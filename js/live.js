// ══════════════════════════════════════════════════
// js/live.js — Live channels (secure mode only)
//   /broadcast      → worldwide admin messages, shown to everyone online
//   /troll/<acc>    → admin effects aimed at one player (flip, spin, fake ban, auto-solve…)
//   /online/<acc>   → presence heartbeat so admins can see who is playing
// Everyone listens with Firebase's REST streaming (EventSource); only admins can write
// /broadcast and /troll — the database rules enforce it.
// ══════════════════════════════════════════════════

let _bcES = null, _trES = null, _hbT = null, _liveOn = false;
let _bcOff = null, _trOff = null, _giftOff = null;     // live-socket unsubscribers
const TROLLS = {
  flip:      { desc: 'Turns their board upside down (10s)' },
  spin:      { desc: 'Slowly spins their board (6s)' },
  mirror:    { desc: 'Mirrors the board left↔right (10s)' },
  shake:     { desc: 'Earthquake (4s)' },
  tiny:      { desc: 'Shrinks the board (8s)' },
  invert:    { desc: 'Negative colours + their path fades out (8s)' },
  party:     { desc: 'Disco lights + confetti (6s)' },
  honk:      { desc: 'Plays a silly honk' },
  frost:     { desc: 'Freezes their board (4s)' },
  fog:       { desc: 'Hides their numbers (6s)' },
  ghost:     { desc: 'Makes their trail invisible (7s)' },
  fakeban:   { desc: 'Fake "you are banned" screen, then "just kidding"' },
  fakecoins: { desc: 'Fake "+1,000,000 coins", then "just kidding"' },
  msg:       { desc: 'Private message popup', text: true },
  solve:     { desc: 'Clears their current level for them' },
  clearpath: { desc: 'Wipes the path they have drawn so far' },
  skip:      { desc: 'Sends them to the next level' },
  level:     { desc: 'Moves them to level N', value: true },
  gift:      { desc: 'Gift coins (already added by the admin)', value: true },
  cosmetic:  { desc: 'Tell them about a cosmetic you granted', text: true },
  keys:      { desc: 'Tell them about crate keys you gave', text: true }
};

async function streamUrl(path) {
  const u = new URL(await dbUrl(path));
  return u.toString();
}
function startLive() {
  initServiceWorker();                      // notifications + home-screen install
  if (_liveOn || authMode() !== 'secure' || !currentAccount || currentAccount.offline) return;
  _liveOn = true;
  listenBroadcast(); listenTroll(); listenGifts(); heartbeat();
  if (typeof listenFriends === 'function') listenFriends();
  clearInterval(_hbT); _hbT = setInterval(heartbeat, 45000);
  document.addEventListener('visibilitychange', onVis);
  // Phones silently kill live connections when the app sleeps → a watchdog + wake-up reconnect
  clearInterval(_wdT); _wdT = setInterval(watchStreams, 20000);
  window.addEventListener('online', reconnectLive);
  window.addEventListener('pageshow', onPageShow);
  window.addEventListener('focus', catchUpNow);
}
function stopLive() {
  _liveOn = false;
  _bcES = esKill(_bcES); _trES = esKill(_trES); clearInterval(_giftT);
  [_bcOff, _trOff, _giftOff].forEach(off => { if (off) try { off(); } catch (e) {} });
  _bcOff = _trOff = _giftOff = null;
  if (typeof onGiftsChanged === 'function') _gifts = {};
  if (typeof stopFriends === 'function') stopFriends();
  clearInterval(_hbT); clearInterval(_wdT);
  document.removeEventListener('visibilitychange', onVis);
  window.removeEventListener('online', reconnectLive);
  window.removeEventListener('pageshow', onPageShow);
  window.removeEventListener('focus', catchUpNow);
}
let _wdT = null, _hiddenAt = 0;
// Back in the app, or back on this tab? Catch up on everything at once — no reload needed.
function catchUpNow() {
  if (typeof clearDenyCache === 'function') clearDenyCache();     // give anything refused a fresh chance
  if (typeof pollGifts === 'function') pollGifts();
  if (typeof pollInbox === 'function') pollInbox();
  if (typeof refreshPresence === 'function' && isScreen('friends')) refreshPresence(true);
  if (typeof refreshFromCloud === 'function' && _signedOut) refreshFromCloud().catch(() => {});
}
function onVis() {
  if (document.visibilityState === 'hidden') { _hiddenAt = Date.now(); return; }
  heartbeat();
  catchUpNow();
  // Back from the background: the phone probably cut the streams — reconnect and catch up now
  if (_hiddenAt && Date.now() - _hiddenAt > 5000) reconnectLive();
  _hiddenAt = 0;
}
function onPageShow(e) { if (e.persisted) reconnectLive(); }
// Restart every live stream and fetch anything we may have missed while asleep
function reconnectLive() {
  if (!_liveOn) return;
  listenBroadcast(); listenTroll();
  if (typeof listenFriends === 'function') listenFriends();
  if (typeof pollGifts === 'function') pollGifts();
}
// A stream is dead if it closed, or Firebase's keep-alive (sent about every 30 s) stopped arriving
function watchStreams() {
  if (liveReady()) return;                            // the SDK reconnects on its own
  if (!_liveOn || document.visibilityState === 'hidden' || streamsPaused()) return;
  const all = [_bcES, _trES];                       // friend requests and invites are polled, not streamed
  if (all.some(es => !es || es.readyState === 2 || Date.now() - (es._last || 0) > 100000)) reconnectLive();
}

// A stream whose token has expired answers 401 and the browser then retries the SAME stale URL
// for ever — a flood of failures that also makes the page stutter. So we take the retries over:
// close the stream ourselves and reopen it with a fresh token, backing off as failures pile up.
let _esFails = 0, _esPause = 0;
// Closing a stream on purpose (reconnect, sign-out) must not count as a failure
function esKill(es) { if (!es) return null; es._dead = true; try { es.close(); } catch (e) {} return null; }
function streamBackoff() { return Math.min(60000, 1200 * Math.pow(2, Math.min(_esFails, 6))); }
function streamsPaused() { return Date.now() < _esPause; }

// ── Streams: apply 'put'/'patch' events to a local copy of the node ──
function streamNode(url, onChange, onAuthRevoked) {
  const es = new EventSource(url);
  es._last = Date.now();
  const touch = () => { es._last = Date.now(); _esFails = 0; };
  es.addEventListener('error', () => {
    if (es._dead) return;
    es._dead = true; es.close();                       // stop the browser's own retry loop
    _esFails++;
    const wait = streamBackoff();
    _esPause = Date.now() + wait;                      // the watchdog leaves it alone until then
    if (_esFails === 6) console.warn('live updates keep failing — slowing down retries');
    if (onAuthRevoked) setTimeout(() => { if (_liveOn) onAuthRevoked(); }, wait);
  });
  es.addEventListener('keep-alive', touch);
  es.addEventListener('open', touch);
  let cur = null;
  const apply = (ev, merge) => {
    touch();
    let msg; try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (!msg) return;
    if (msg.path === '/') cur = merge && cur ? { ...cur, ...msg.data } : msg.data;
    else {
      const k = msg.path.replace(/^\//, '').split('/')[0];
      cur = cur && typeof cur === 'object' ? { ...cur } : {};
      if (msg.data === null) delete cur[k]; else cur[k] = msg.data;
    }
    onChange(cur);
  };
  es.addEventListener('put', e => apply(e, false));
  es.addEventListener('patch', e => apply(e, true));
  es.addEventListener('auth_revoked', () => { es.close(); if (onAuthRevoked) onAuthRevoked(); });
  es.addEventListener('cancel', () => { es.close(); if (onAuthRevoked) setTimeout(onAuthRevoked, 5000); });
  return es;
}
// One handler, whether the value arrived over the socket or a poll
function onBroadcastValue(b) {
  if (!b || !b.msg || typeof b.at !== 'number') return;
  const seen = +localStorage.getItem('mz_bc_seen') || 0;
  if (b.at <= seen || Date.now() - b.at > 20 * 60000) return;     // already seen, or older than 20 min
  localStorage.setItem('mz_bc_seen', String(b.at));
  showWorldMessage(String(b.msg).slice(0, 200), b.by, b.av);
}
let _lastTrollAt = 0, _pendingTroll = null;
function onTrollValue(t) {
  if (!t || !t.kind || typeof t.at !== 'number') return;
  if (t.at === _lastTrollAt) return;                              // the same one echoing back
  _lastTrollAt = t.at;
  if (Date.now() - t.at > 3 * 60000) { dbDelete('/troll/' + currentAccount.id).catch(() => {}); return; }
  // Board effects need a board. If the player is on the menu, hold it and run it when they start one,
  // instead of quietly doing nothing — that was why solve "sometimes failed".
  if ((t.kind === 'solve' || t.kind === 'clearpath') && (!inGame() || amSpectating || !cells.length)) {
    _pendingTroll = { ...t, holdUntil: Date.now() + 3 * 60000 };
    dbDelete('/troll/' + currentAccount.id).catch(() => {});
    return;
  }
  applyTroll(t);
  // Clear it only once it has been acted on, so a second command sent moments later is not
  // wiped out by this delete
  dbDelete('/troll/' + currentAccount.id).catch(() => {});
}
// Called when a board appears: run anything that was waiting for one
function runPendingTroll() {
  const p = _pendingTroll; if (!p) return;
  if (Date.now() > p.holdUntil) { _pendingTroll = null; return; }
  if (!inGame() || amSpectating || !cells.length) return;
  _pendingTroll = null;
  try { applyTroll(p); } catch (e) {}
}
async function listenBroadcast() {
  _bcES = esKill(_bcES);
  if (liveReady()) { _bcOff = (_bcOff || (() => {}))(), _bcOff = liveWatch('/broadcast', onBroadcastValue); return; }
  _bcES = streamNode(await streamUrl('/broadcast'), b => {
    if (!b || !b.msg || typeof b.at !== 'number') return;
    const seen = +localStorage.getItem('mz_bc_seen') || 0;
    if (b.at <= seen || Date.now() - b.at > 20 * 60000) return;   // already seen, or older than 20 min
    localStorage.setItem('mz_bc_seen', String(b.at));
    showWorldMessage(String(b.msg).slice(0, 200), b.by, b.av);
  }, () => { if (_liveOn) listenBroadcast(); });          // token expired → reconnect with a fresh one
}
async function listenTroll() {
  _trES = esKill(_trES);
  if (!currentAccount || !currentAccount.id) return;
  const path = '/troll/' + currentAccount.id;
  if (liveReady()) { _trOff = (_trOff || (() => {}))(), _trOff = liveWatch(path, onTrollValue); return; }
  _trES = streamNode(await streamUrl(path), t => {
    if (!t || !t.kind || typeof t.at !== 'number') return;
    dbDelete(path).catch(() => {});                      // one-shot: clear it so it never replays
    if (Date.now() - t.at > 3 * 60000) return;
    applyTroll(t);
  }, () => { if (_liveOn) listenTroll(); });              // token expired → reconnect with a fresh one
}
// Gift crates: checked every 30 s and whenever the Store opens (not streamed — browsers only
// allow ~6 open connections per server, and the live streams above already use 4)
let _giftT = null;
async function pollGifts() {
  if (!_liveOn || !currentAccount || !currentAccount.id || typeof onGiftsChanged !== 'function') return;
  try { onGiftsChanged(await dbGet('/gifts/' + currentAccount.id)); } catch (e) {}
}
function listenGifts() {
  clearInterval(_giftT);
  if (_giftOff) { _giftOff(); _giftOff = null; }
  if (liveReady() && currentAccount && currentAccount.id) {
    _giftOff = liveWatch('/gifts/' + currentAccount.id, v => onGiftsChanged(v));   // arrives the moment it is sent
    return;
  }
  pollGifts(); _giftT = setInterval(pollGifts, 12000);
}
async function heartbeat() {
  if (!_liveOn || document.visibilityState === 'hidden' || !currentAccount) return;
  dbPut('/online/' + currentAccount.id, {
    name: myName, lvl: myXpLevel(), at: SERVER_TIME,
    where: battleActive ? 'battle' : (document.body.dataset.screen || 'menu'),
    room: inBattleSession() && !battleActive && !isQuickMatch ? roomCode : ''
  }).catch(() => {});
  if (typeof publishLookIfChanged === 'function') publishLookIfChanged();   // friends see a new name/look right away
}

// ── World message banner ──
function showWorldMessage(msg, by, av) {
  sfx('world'); buzz([30, 40, 30]);
  showAvatarMessage('Message to everyone' + (by ? ' · ' + cleanName(by) : ''), msg, cleanName(by || 'Admin'), av, 7000);
  if (inBattleSession()) addChatMsg('World: ' + msg, null, true);
}

// ── Troll effects ──
function tempClass(el, cls, ms) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  clearTimeout(el['_t_' + cls]); el['_t_' + cls] = setTimeout(() => el.classList.remove(cls), ms);
}
function applyTroll(t) {
  const board = document.querySelector('.board-wrap'), root = document.documentElement, grid = document.getElementById('grid');
  const by = cleanName(t.by || 'Admin');
  switch (t.kind) {
    case 'flip':   tempClass(board, 'troll-flip', t.ms || 10000); sfx('hit'); break;
    case 'spin':   tempClass(board, 'troll-spin', t.ms || 6000); break;
    case 'mirror': tempClass(board, 'troll-mirror', t.ms || 10000); break;
    case 'shake':  tempClass(document.body, 'troll-shake', Math.min(t.ms || 4000, 4000)); buzz([80, 40, 80, 40, 120]); break;
    case 'tiny':   tempClass(board, 'troll-tiny', t.ms || 8000); break;
    case 'invert': tempClass(root, 'troll-invert', t.ms || 8000); break;
    case 'party':  tempClass(root, 'troll-party', t.ms || 6000); for (let i = 0; i < 6; i++) setTimeout(spawnParticles, i * 500); sfx('win'); break;
    case 'honk':   sfx('honk'); setTimeout(() => sfx('honk'), 700); break;
    case 'frost':  if (inGame() && !amSpectating) { const ms = t.ms ? 2000 : 4000; inputLockedUntil = performance.now() + ms; isDrawing = false; grid.classList.add('frosted'); setTimeout(() => grid.classList.remove('frosted'), ms); sfx('hit'); } break;
    case 'fog':    grid.classList.add('fogged'); clearTimeout(window._fogT); window._fogT = setTimeout(() => grid.classList.remove('fogged'), t.ms || 6000); break;
    case 'ghost':  tempClass(document.getElementById('game'), 'mod-ghost', t.ms || 7000); break;
    case 'fakeban': fakeBan(by); break;
    case 'fakecoins':
      sfx('reward'); spawnParticles();
      showReward({ icon: 'coin', tone: 'gold', kicker: 'Jackpot!', title: '+1,000,000 coins', chips: [{ html: coinHtml('1,000,000'), label: 'coins' }], ms: 2600 });
      setTimeout(() => showReward({ icon: 'info', tone: 'world', title: 'Just kidding', sub: 'Greetings from ' + by, quick: true }), 200);
      break;
    case 'msg': sfx('world'); showAvatarMessage('Message from ' + by, String(t.text || '').slice(0, 160), by, t.av); break;
    case 'solve':
      if (inGame() && !amSpectating && cells.length) { try { adminAutoSolve(); } catch (e) {} }   // silent: no admin name, no toast
      break;
    case 'clearpath':
      if (inGame() && !amSpectating) resetPath();                                                 // silent as well
      break;
    case 'skip':
      if (inGame() && !battleActive && !dailyMode) { nextLevel(); pushToast(by + ' skipped you ahead', 'acc', 'arrowR'); }
      break;
    case 'level': {
      const n = Math.max(1, Math.min(9999, parseInt(t.value) || 1));
      writeSave({ level: n });
      if (inGame() && !battleActive && !dailyMode) { level = n; updateInGameLevelBadge(); generate(); startTimer(); }
      _setupContinueBtn();
      pushToast(by + ' moved you to level ' + n, 'info', 'arrowR');
      break;
    }
    case 'reset':                                   // silent: no message, no admin name
      resetLocalProgress(parseInt(t.value) || Date.now());
      if (inGame() && !battleActive) goMenu();
      break;
    case 'keys': refreshFromCloud().then(() => {
      const [kind, n] = String(t.text || '').split(':');
      if (!CRATES[kind]) return;
      sfx('reward'); spawnParticles();
      showReward({ icon: 'key', tone: 'gold', kicker: 'Gift from ' + by, title: '+' + (parseInt(n) || 1) + ' ' + CRATES[kind].name + ' key' + ((parseInt(n) || 1) > 1 ? 's' : ''), sub: 'Open it in the Store', ms: 5000 });
    }); break;
    case 'cosmetic': refreshFromCloud().then(() => {
      const [set, id] = String(t.text || '').split(':');
      const item = COSMETIC_SETS[set] && _find(COSMETIC_SETS[set], id);
      if (!item) return;
      sfx('level'); spawnParticles();
      showReward({ iconHtml: itemPreview({ set, item }, 44), tone: 'gold', kicker: 'Gift from ' + by, title: item.name,
        sub: rarityOf(item).name + ' ' + SET_LABEL[set] + ' · added to your Locker', ms: 5000 });
    }); break;
    case 'gift': refreshFromCloud().then(() => {
      sfx('reward'); spawnParticles();
      showReward({ icon: 'gift', tone: 'gold', kicker: 'Gift from ' + by, title: '+' + (parseInt(t.value) || 0) + ' coins', chips: [{ html: coinHtml(getCoins()), label: 'balance' }] });
    }); break;
  }
}
function fakeBan(by) {
  const o = document.createElement('div');
  o.className = 'fake-ban';
  o.innerHTML = `<div class="panel-card center"><div class="lock-ring" style="--p:100">${ic('lock')}</div>
    <div class="panel-title">Account banned</div><div class="panel-sub">Reason: being way too good at this game</div>
    <div class="lock-time">99:59</div></div>`;
  document.body.appendChild(o); sfx('hit');
  setTimeout(() => { o.classList.add('reveal'); o.querySelector('.panel-title').textContent = 'Just kidding'; o.querySelector('.panel-sub').textContent = 'Greetings from ' + by; o.querySelector('.lock-time').textContent = ':)'; sfx('reward'); }, 4200);
  setTimeout(() => o.remove(), 6200);
}
// Re-read coins/boosts after an admin changed them server-side
async function refreshFromCloud() {
  try { const a = await dbGet('/accounts/' + currentAccount.id); if (a) { writeSave({ coins: a.coins || 0, boosts: a.boosts || {}, xp: a.xp || 0, level: a.level || loadSave().level, crateKeys: keyMap(a.crateKeys), owned: mergeOwned(a.owned, loadSave().owned) }); updateMenuProfile(); updateCoinUI(); } } catch (e) {}
}

// ── Admin side ──
// Every admin message carries your look, so players see your character next to it
const adminBroadcast = msg => dbPut('/broadcast', { msg: String(msg).slice(0, 200), at: SERVER_TIME, by: myName, av: getMyAvatar() });
const adminTroll = (acc, kind, extra) => dbPut('/troll/' + acc, { kind, at: SERVER_TIME, by: myName, av: getMyAvatar(), ...(extra || {}) });
async function adminOnline() {
  const all = (await dbGet('/online')) || {};
  const now = Date.now();
  return Object.entries(all).filter(([, o]) => o && now - o.at < 120000).map(([id, o]) => ({ id, ...o })).sort((a, b) => a.name.localeCompare(b.name));
}

// ══════════════════════════════════════════════════
// SYSTEM NOTIFICATIONS — so an invite still reaches you with the app in the background
// (the browser only allows these after the player says yes in Settings)
// ══════════════════════════════════════════════════
// The worker is what actually shows notifications; the page only asks it to.
let _swReg = null;
async function initServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return null;
  try {
    _swReg = await navigator.serviceWorker.register('sw.js?v=1', { scope: './' });
    await navigator.serviceWorker.ready;
    return _swReg;
  } catch (e) { console.warn('MAZZIE: service worker not available', e && e.message); return null; }
}
function notifySupported() { return typeof Notification !== 'undefined' && 'serviceWorker' in navigator; }
function notifyState() { return notifySupported() ? Notification.permission : 'unsupported'; }
function notifyOn() { return notifySupported() && Notification.permission === 'granted' && getSetting('notify', true); }
async function askNotify() {
  if (!notifySupported()) { pushToast('This browser cannot show notifications', 'warn'); return false; }
  if (!_swReg) await initServiceWorker();
  if (!_swReg) { pushToast('Notifications need the app served over https', 'warn'); return false; }
  if (Notification.permission === 'denied') { pushToast('Notifications are blocked in your browser settings', 'warn'); return false; }
  if (Notification.permission !== 'granted') {
    try { await Notification.requestPermission(); } catch (e) {}
  }
  const ok = Notification.permission === 'granted';
  setSetting('notify', ok);
  if (ok) pushToast('Notifications on — invites will reach you in the background', 'acc', 'mail');
  return ok;
}
// Only when the app is not in front: on screen you already get the popup.
// Always via the worker — `new Notification()` is refused outright on Android.
function notifyUser(title, body, tag) {
  if (!notifyOn() || document.visibilityState === 'visible') return;
  const reg = _swReg || (navigator.serviceWorker && navigator.serviceWorker.controller ? null : null);
  const post = r => { if (r && r.active) r.active.postMessage({ type: 'notify', title, body, tag }); };
  if (reg) return post(reg);
  if (navigator.serviceWorker) navigator.serviceWorker.ready.then(post).catch(() => {});
}

// ══════════════════════════════════════════════════
// INSTALLING — Chrome hands us its own prompt; iPhone needs a sentence of instruction
// ══════════════════════════════════════════════════
let _installEvent = null;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
function installState() {
  if (isStandalone()) return 'installed';
  if (_installEvent) return 'ready';          // Chrome will show a real prompt
  if (isIos()) return 'ios';                  // Safari has no prompt: tell them where to tap
  return 'unavailable';
}
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();                         // keep it for our own button
  _installEvent = e;
  updateInstallUI();
});
window.addEventListener('appinstalled', () => {
  _installEvent = null;
  pushToast('MAZZIE installed — open it from your home screen', 'acc', 'check');
  updateInstallUI();
});
async function installApp() {
  const st = installState();
  if (st === 'installed') { pushToast('Already installed', 'info', 'check'); return; }
  if (st === 'ready') {
    _installEvent.prompt();
    const res = await _installEvent.userChoice.catch(() => null);
    if (res && res.outcome === 'accepted') _installEvent = null;
    updateInstallUI();
    return;
  }
  if (st === 'ios') {
    showAvatarMessage('Add to Home Screen',
      'Tap the Share button at the bottom of Safari, then "Add to Home Screen". Notifications only work once it is added.',
      'MAZZIE', null, 9000);
    return;
  }
  pushToast('Your browser has no install button — try Chrome, or add it to your home screen', 'info');
}
function updateInstallUI() {
  const st = installState();
  const show = st === 'ready' || st === 'ios';
  const banner = document.getElementById('install-banner');
  if (banner) banner.classList.toggle('hidden', !show);
  const sub = document.getElementById('install-sub');
  if (sub) sub.innerText = st === 'ios' ? 'Share → Add to Home Screen' : 'One tap — an icon on your home screen';
  const row = document.getElementById('set-install');
  if (row) row.hidden = st === 'unavailable';
  const val = document.getElementById('set-install-val');
  if (val) val.innerText = st === 'installed' ? 'Installed — running as an app'
    : st === 'ios' ? 'Safari: Share → Add to Home Screen'
    : 'Adds an icon and runs without browser bars';
  const btn = document.getElementById('set-install-btn');
  if (btn) { btn.disabled = st === 'installed'; btn.innerText = st === 'installed' ? 'Installed' : 'Install'; }
}
