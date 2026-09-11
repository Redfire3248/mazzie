// ══════════════════════════════════════════════════
// js/live.js — Live channels (secure mode only)
//   /broadcast      → worldwide admin messages, shown to everyone online
//   /troll/<acc>    → admin effects aimed at one player (flip, spin, fake ban, auto-solve…)
//   /online/<acc>   → presence heartbeat so admins can see who is playing
// Everyone listens with Firebase's REST streaming (EventSource); only admins can write
// /broadcast and /troll — the database rules enforce it.
// ══════════════════════════════════════════════════

let _bcES = null, _trES = null, _hbT = null, _liveOn = false;
const TROLLS = {
  flip:      { desc: 'Turns their board upside down (10s)' },
  spin:      { desc: 'Spins their board (6s)' },
  mirror:    { desc: 'Mirrors the board left↔right (10s)' },
  shake:     { desc: 'Earthquake (4s)' },
  tiny:      { desc: 'Shrinks the board (8s)' },
  invert:    { desc: 'Inverts all colours (8s)' },
  party:     { desc: 'Disco lights + confetti (6s)' },
  honk:      { desc: 'Plays a silly honk' },
  frost:     { desc: 'Freezes their board (4s)' },
  fog:       { desc: 'Hides their numbers (6s)' },
  fakeban:   { desc: 'Fake "you are banned" screen, then "just kidding"' },
  fakecoins: { desc: 'Fake "+1,000,000 coins", then "just kidding"' },
  msg:       { desc: 'Private message popup', text: true },
  solve:     { desc: 'Clears their current level for them' },
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
  if (_liveOn || authMode() !== 'secure' || !currentAccount || currentAccount.offline || typeof EventSource === 'undefined') return;
  _liveOn = true;
  listenBroadcast(); listenTroll(); listenGifts(); heartbeat();
  if (typeof listenFriends === 'function') listenFriends();
  clearInterval(_hbT); _hbT = setInterval(heartbeat, 45000);
  document.addEventListener('visibilitychange', onVis);
}
function stopLive() {
  _liveOn = false;
  if (_bcES) _bcES.close(); if (_trES) _trES.close(); _bcES = _trES = null; clearInterval(_giftT);
  if (typeof onGiftsChanged === 'function') _gifts = {};
  if (typeof stopFriends === 'function') stopFriends();
  clearInterval(_hbT);
  document.removeEventListener('visibilitychange', onVis);
}
function onVis() { if (document.visibilityState === 'visible') heartbeat(); }

// ── Streams: apply 'put'/'patch' events to a local copy of the node ──
function streamNode(url, onChange, onAuthRevoked) {
  const es = new EventSource(url);
  let cur = null;
  const apply = (ev, merge) => {
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
async function listenBroadcast() {
  if (_bcES) _bcES.close();
  _bcES = streamNode(await streamUrl('/broadcast'), b => {
    if (!b || !b.msg || typeof b.at !== 'number') return;
    const seen = +localStorage.getItem('mz_bc_seen') || 0;
    if (b.at <= seen || Date.now() - b.at > 20 * 60000) return;   // already seen, or older than 20 min
    localStorage.setItem('mz_bc_seen', String(b.at));
    showWorldMessage(String(b.msg).slice(0, 200), b.by, b.av);
  }, () => { if (_liveOn) listenBroadcast(); });          // token expired → reconnect with a fresh one
}
async function listenTroll() {
  if (_trES) _trES.close();
  if (!currentAccount || !currentAccount.id) return;
  const path = '/troll/' + currentAccount.id;
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
function listenGifts() { clearInterval(_giftT); pollGifts(); _giftT = setInterval(pollGifts, 30000); }
async function heartbeat() {
  if (!_liveOn || document.visibilityState === 'hidden' || !currentAccount) return;
  dbPut('/online/' + currentAccount.id, {
    name: myName, lvl: myXpLevel(), at: SERVER_TIME,
    where: battleActive ? 'battle' : (document.body.dataset.screen || 'menu'),
    room: inBattleSession() && !battleActive && !isQuickMatch ? roomCode : ''
  }).catch(() => {});
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
    case 'fakeban': fakeBan(by); break;
    case 'fakecoins':
      sfx('reward'); spawnParticles();
      showReward({ icon: 'coin', tone: 'gold', kicker: 'Jackpot!', title: '+1,000,000 coins', chips: [{ html: coinHtml('1,000,000'), label: 'coins' }], ms: 2600 });
      setTimeout(() => showReward({ icon: 'info', tone: 'world', title: 'Just kidding', sub: 'Greetings from ' + by, quick: true }), 200);
      break;
    case 'msg': sfx('world'); showAvatarMessage('Message from ' + by, String(t.text || '').slice(0, 160), by, t.av); break;
    case 'solve':
      if (inGame() && !amSpectating && cells.length) { try { adminAutoSolve(); pushToast(by + ' cleared this level for you', 'acc', 'sparkle'); } catch (e) {} }
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
    case 'reset':
      resetLocalProgress(parseInt(t.value) || Date.now());
      if (inGame() && !battleActive) goMenu();
      showAvatarMessage('Account reset by ' + by, 'Your progress was reset to a fresh start', by, t.av, 6000);
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
