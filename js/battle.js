// ══════════════════════════════════════════════════
// js/battle.js — Networking, lobby, host/guest logic
// ══════════════════════════════════════════════════

// ── Peer (lazy — the menu never waits on the signalling server) ──
const _pendingConnects = new Map(); // peerId → fail callback

function makePeer() {
  peer = new Peer({ debug: 0 });
  peer.on('error', onPeerError);
  peer.on('disconnected', () => { try { if (!peer.destroyed) peer.reconnect(); } catch (e) {} });
  return peer;
}
function ensurePeer() {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') return reject(new Error('offline'));
    if (!peer || peer.destroyed) makePeer();
    if (peer.open) return resolve(peer);
    const onOpen  = () => { cleanup(); resolve(peer); };
    const t = setTimeout(() => { cleanup(); reject(new Error('timeout')); }, 12000);
    const cleanup = () => { clearTimeout(t); peer.off('open', onOpen); };
    peer.on('open', onOpen);
  });
}
function onPeerError(err) {
  if (err.type === 'peer-unavailable') {
    const m = /peer\s+(\S+)\s*$/i.exec(err.message || '');
    const target = m && m[1];
    for (const [id, fail] of [..._pendingConnects]) if (!target || target === id) fail();
    return;
  }
  if (['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type))
    console.warn('[peer]', err.type);
}
// Open a reliable data connection, rejecting fast if the peer doesn't exist
function connectTo(peerId, timeoutMs = 7000) {
  return ensurePeer().then(() => new Promise((resolve, reject) => {
    const conn = peer.connect(peerId, { reliable: true });
    let done = false;
    const fail = why => {
      if (done) return; done = true; clearTimeout(t); _pendingConnects.delete(peerId);
      try { conn.close(); } catch (e) {}
      reject(new Error(why));
    };
    const t = setTimeout(() => fail('timeout'), timeoutMs);
    _pendingConnects.set(peerId, () => fail('unavailable'));
    conn.on('open',  () => { if (done) return; done = true; clearTimeout(t); _pendingConnects.delete(peerId); resolve(conn); });
    conn.on('error', () => fail('error'));
  }));
}

function showConnecting(txt) {
  document.getElementById('connecting').classList.remove('hidden');
  document.getElementById('conn-txt').innerText = txt;
}
function hideConnecting() { document.getElementById('connecting').classList.add('hidden'); }

// ── App init ──
// Boot as soon as the DOM exists (not on 'load', which waits for web fonts)
async function bootApp() {
  hydrateIcons();
  applyMyCosmetics();
  syncSoundBtn();
  // Download the sign-in SDK and custom avatar art in parallel
  if (authMode() === 'secure') initFirebase().catch(() => {});
  await Promise.race([loadCustomCosmetics(), new Promise(r => setTimeout(r, 1200))]);
  applyMyCosmetics();
  initAccount(name => {
    hideConnecting();
    migrateOwned();
    myName = name;
    updateMenuProfile();
    _setupContinueBtn();
    show('menu');
  });
  // Warm the signalling connection in the background
  if (typeof Peer !== 'undefined') { try { makePeer(); } catch (e) {} }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bootApp);
else setTimeout(bootApp, 0);

// ── Room code generator ──
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = ''; for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

function selfLobbyEntry(host) {
  return {
    name: myName, host: !!host,
    xpLevel: myXpLevel(),
    rankName: getRank(loadSave().totalCleared || 0).name,
    avatar: getMyAvatar()
  };
}

// ── Host a room (used by Host button and Quick Match) ──
function hostRoom(opts = {}) {
  return new Promise((resolve, reject) => {
    if (typeof Peer === 'undefined') return reject(new Error('offline'));
    roomCode = genCode(); isHost = true; isQuickMatch = !!opts.quick;
    lobbyPlayers = {}; roundScores = {}; finishOrder = []; quitPlayers.clear(); battleRound = 0;
    guestConns = []; connMap.clear();
    lobbyPlayers[myId] = selfLobbyEntry(true);
    if (codePeer) { try { codePeer.destroy(); } catch (e) {} }
    const cp = new Peer('mazzie-' + roomCode, { debug: 0 });
    codePeer = cp;
    let opened = false;
    cp.on('open', () => { opened = true; resolve(roomCode); });
    cp.on('connection', conn => { guestConns.push(conn); setupGuestConn(conn); });
    cp.on('error', err => {
      if (opened) { console.warn('[room]', err.type); return; }
      try { cp.destroy(); } catch (e) {}
      if (err.type === 'unavailable-id') hostRoom(opts).then(resolve, reject);
      else reject(err);
    });
  });
}

function openHostLobby() {
  showConnecting('CREATING ROOM…');
  hostRoom().then(() => { hideConnecting(); showLobbyAsHost(); })
    .catch(err => { hideConnecting(); pushToast('Could not create room: ' + (err.type || err.message), 'warn'); show('battle-mode'); });
}

// ── Join a room ──
function doJoin() {
  const code = document.getElementById('join-input').value.trim().toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) { document.getElementById('join-status').innerText = 'Enter a 4-letter code'; return; }
  joinRoom(code);
}
async function joinRoom(code, opts = {}) {
  const status = t => { const el = document.getElementById(opts.statusEl || 'join-status'); if (el) el.innerText = t; };
  status('Connecting…');
  if (hostConn) { try { hostConn.close(); } catch (e) {} hostConn = null; }
  isHost = false; lobbyPlayers = {}; roundScores = {}; finishOrder = []; quitPlayers.clear();
  rejoinAfterConflict = false;
  let conn;
  try { conn = await connectTo('mazzie-' + code, opts.timeout || 7000); }
  catch (e) {
    status(e.message === 'unavailable' ? 'Room not found — check the code.' : e.message === 'offline' ? 'You are offline.' : 'Could not connect. Try again.');
    if (opts.onFail) opts.onFail(e);
    return false;
  }
  hostConn = conn; roomCode = code; isQuickMatch = !!opts.quick;
  conn.on('data', d => handleHostMsg(d));
  conn.on('close', () => {
    if (hostConn !== conn) return;
    hostConn = null;
    if (!battleActive && typeof mm !== 'undefined' && mm && mm.phase === 'guest') { mmRetry(); return; }
    const wasIn = battleActive || isScreen('lobby') || isScreen('queue') || isScreen('spectate') || isScreen('round-results');
    resetBattleState();
    if (wasIn) { pushToast('Disconnected from host', 'warn'); stopTimer(); show(isQuickMatch ? 'menu' : 'battle-mode'); }
  });
  sendJoin();
  status('Connected! Waiting for host…');
  return true;
}
function sendJoin() {
  if (!hostConn || !hostConn.open) return;
  hostConn.send({ type:'join', id:myId, name:myName, xpLevel:myXpLevel(),
    rankName:getRank(loadSave().totalCleared || 0).name, avatar:getMyAvatar() });
}

// ── Full battle state reset ──
function resetBattleState() {
  isHost = false; battleActive = false; amSpectating = false; isQuickMatch = false;
  lobbyPlayers = {}; roomCode = '';
  roundScores = {}; finishOrder = []; battleRound = 0; roundEnded = false;
  quitPlayers.clear(); progressState = {}; remotePaths = {};
  clearInterval(autoNextTimer);
  document.getElementById('grid').classList.remove('fogged', 'frosted');
}
function _destroyBattleSession() {
  try {
    if (isHost) {
      broadcastAll({ type: 'host_left' });
      guestConns.forEach(c => { try { c.close(); } catch (e) {} });
    } else if (hostConn && hostConn.open) {
      hostConn.send({ type: 'guest_left', id: myId, name: myName });
      const c = hostConn; setTimeout(() => { try { c.close(); } catch (e) {} }, 150);
    }
  } catch (e) {}
  guestConns = []; hostConn = null; connMap.clear();
  if (codePeer) { const cp = codePeer; setTimeout(() => { try { cp.destroy(); } catch (e) {} }, 200); codePeer = null; }
  if (typeof mmStop === 'function') mmStop();
  clearTimeout(_chaosT);
  resetBattleState();
}
function inBattleSession() { return isHost || !!hostConn; }

window.addEventListener('beforeunload', () => { if (inBattleSession()) _destroyBattleSession(); });

function leaveLobby() {
  if (battleActive && !confirm('Leave the battle in progress?')) return;
  _destroyBattleSession();
  show('battle-mode');
}

// ── Lobby settings ──
function pickDiff(btn, diff) {
  battleDiffSetting = diff;
  if (diff !== 'random') battleDiff = diff;
  document.querySelectorAll('.bdiff-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  broadcastLobbySettings();
}
function changeRounds(d) {
  maxRounds = Math.max(1, Math.min(10, maxRounds + d));
  document.getElementById('rounds-disp').innerText = maxRounds;
  broadcastLobbySettings();
}
function toggleBoosts() {
  abilitiesEnabled = !abilitiesEnabled;
  syncBoostToggle();
  broadcastLobbySettings();
}
function syncBoostToggle() {
  const b = document.getElementById('boost-toggle');
  if (b) { b.classList.toggle('on', abilitiesEnabled); b.innerText = abilitiesEnabled ? 'ON' : 'OFF'; }
}
function broadcastLobbySettings() {
  if (!isHost) return;
  broadcastAll({ type:'lobby_settings', diff:battleDiffSetting, rounds:maxRounds, abilities:abilitiesEnabled, mods:battleMods });
}

// ══════════════════════════════════════════════════
// MODIFIERS — the host picks any mix; they apply to everyone's board for the whole match
// ══════════════════════════════════════════════════
const MODIFIERS = {
  boosts: { name: 'Power-ups',     icon: 'bolt',    desc: 'Boosts appear on the board and in your slots' },
  events: { name: 'Random Events', icon: 'sparkle', desc: 'Flips, spins, mirrors and worse hit random players mid-round' },
  oneshot:{ name: 'One Shot',      icon: 'target',  short: 'One Shot', desc: 'One wrong move and your whole path is wiped' },
  rush:   { name: 'Rush',          icon: 'clock',   short: 'Rush',     desc: 'A countdown per board — run out and the path resets' },
  // Puzzle pieces (see PIECES in js/puzzle.js) — these change the board itself
  portal: { name: 'Portals',       icon: 'orb',     short: 'Portals', desc: 'Two linked cells: step on one, come out the other' },
  oneway: { name: 'One-Way',       icon: 'arrowR',  short: 'One-Way', desc: 'Arrow cells can only be entered from one side' },
  locks:  { name: 'Locks & Keys',  icon: 'lock',    short: 'Locks',   desc: 'Locked cells open only once you take their key' }
};
const cleanMods = m => (Array.isArray(m) ? m : []).filter(k => MODIFIERS[k]).slice(0, 12);
function setMods(list) { battleMods = cleanMods(list); partyMode = battleMods.includes('events'); abilitiesEnabled = battleMods.includes('boosts'); }
function toggleMod(k) {
  if (!isHost || !MODIFIERS[k]) return;
  setMods(battleMods.includes(k) ? battleMods.filter(x => x !== k) : [...battleMods, k]);
  renderModRow(); broadcastLobbySettings(); sfx('tap');
}
function renderModRow() {
  const row = document.getElementById('mod-row'); if (!row) return;
  row.innerHTML = Object.entries(MODIFIERS).map(([k, m]) =>
    `<button class="mod-chip${battleMods.includes(k) ? ' on' : ''}" onclick="toggleMod('${k}')" title="${m.desc}">${ic(m.icon)}<span>${m.name}</span></button>`).join('');
}
// Apply the active modifiers to the board (solo play always clears them)
function applyMods(list) {
  const on = k => list.includes(k);
  const turn = on('flip') || on('mirror') || on('spin');
  ['grid', 'grid-svg'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.classList.toggle('modded', turn);
    el.classList.toggle('mod-flip', on('flip')); el.classList.toggle('mod-mirror', on('mirror')); el.classList.toggle('mod-spin', on('spin'));
  });
  const game = document.getElementById('game');
  game.classList.toggle('mod-ghost', on('ghost')); game.classList.toggle('mod-fog', on('fog'));
}

// ══════════════════════════════════════════════════
// PARTY MODE ("Chaos") — the host throws a random troll at a random racer every 10–16 s
// ══════════════════════════════════════════════════
const PARTY_TROLLS = { flip: 'flipped upside down', spin: 'sent spinning', mirror: 'mirrored', shake: 'an earthquake',
  tiny: 'shrunk', invert: 'colour-flipped', fog: 'fogged', ghost: 'ghosted', frost: 'frozen', party: 'a disco', honk: 'honked' };
let _chaosT = null, _chaosHit = {}, _chaosLastId = null;
function startChaos() {
  clearTimeout(_chaosT);
  if (battleRound <= 1) { _chaosHit = {}; _chaosLastId = null; }
  if (!isHost || !partyMode) return;
  _chaosT = setTimeout(chaosTick, 4000 + Math.random() * 3000);
}
function chaosTick() {
  if (!isHost || !partyMode || !battleActive || roundEnded) return;
  const done = new Set(finishOrder.map(f => f.id));
  const alive = Object.keys(lobbyPlayers).filter(pid => !quitPlayers.has(pid) && !done.has(pid));
  // Fair rotation: never the same player twice in a row (when others are still playing),
  // a breather between hits on one player, and whoever waited longest goes first
  const now = Date.now();
  let pool = alive.filter(pid => now - (_chaosHit[pid] || 0) >= 9000);
  if (pool.length > 1) pool = pool.filter(pid => pid !== _chaosLastId);
  if (pool.length) {
    pool.sort((a, b) => (_chaosHit[a] || 0) - (_chaosHit[b] || 0));
    const oldest = pool.filter(pid => (_chaosHit[pid] || 0) === (_chaosHit[pool[0]] || 0));
    const id = oldest[Math.floor(Math.random() * oldest.length)];
    _chaosHit[id] = now; _chaosLastId = id;
    const kinds = Object.keys(PARTY_TROLLS), kind = kinds[Math.floor(Math.random() * kinds.length)];
    const msg = { type:'party_troll', id, kind, name: (lobbyPlayers[id] || {}).name || 'Someone' };
    broadcastAll(msg); onPartyTroll(msg);
  }
  _chaosT = setTimeout(chaosTick, 5000 + Math.random() * 4000);
}
function onPartyTroll(d) {
  if (!PARTY_TROLLS[d.kind]) return;
  const name = cleanName(d.name), me = d.id === myId;
  if (me && battleActive && !amSpectating) applyTroll({ kind: d.kind, by: 'Chaos', ms: 5000 });
  else if (amSpectating) showSpecTroll(d.id, d.kind);          // watching? see what they are dealing with
  pushToast((me ? 'You got ' : name + ' got ') + PARTY_TROLLS[d.kind] + '!', me ? 'warn' : 'info', 'sparkle');
  addChatMsg('Chaos: ' + name + ' got ' + PARTY_TROLLS[d.kind], null, true);
}

// ── Spectating: play the same prank on the little board you are watching ──
const SPEC_TROLL_MS = { flip: 10000, mirror: 10000, spin: 6000, tiny: 8000, shake: 4000, invert: 8000, fog: 6000, frost: 4000, ghost: 7000, party: 6000 };
function clearSpecTrollFx() {
  const wrap = document.getElementById('spec-mini-grid'); if (!wrap) return;
  [...wrap.classList].filter(c => c.startsWith('sp-')).forEach(c => { clearTimeout(wrap['_t_' + c]); wrap.classList.remove(c); });
}
function showSpecTroll(pid, kind) {
  const wrap = document.getElementById('spec-mini-grid');
  if (!wrap || !SPEC_TROLL_MS[kind]) return;
  // Mark the row so you can tell who is being hit even when you are watching someone else
  const row = document.getElementById('spec-row-' + pid);
  if (row) { row.classList.remove('trolled'); void row.offsetWidth; row.classList.add('trolled'); setTimeout(() => row.classList.remove('trolled'), 2000); }
  if (pid !== specViewPid) return;                              // the board only shows the player you picked
  const cls = 'sp-' + kind;
  wrap.classList.remove(cls); void wrap.offsetWidth; wrap.classList.add(cls);
  clearTimeout(wrap['_t_' + cls]);
  wrap['_t_' + cls] = setTimeout(() => wrap.classList.remove(cls), SPEC_TROLL_MS[kind]);
}
function pickRoundDiff() {
  if (battleDiffSetting === 'mm') return mmRoundDiff();
  if (battleDiffSetting === 'random') return DIFFS[Math.floor(Math.random() * DIFFS.length)];
  return DIFFS.includes(battleDiffSetting) ? battleDiffSetting : 'easy';
}

// ── Start battle ──
function hostStart() {
  if (Object.keys(lobbyPlayers).length < 2) { pushToast('Need at least 2 players!', 'warn'); return; }

  // Final name-uniqueness safety pass — suffix any duplicates with a number
  const seen = new Map();
  Object.entries(lobbyPlayers).forEach(([pid, p]) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) { const n = seen.get(key) + 1; seen.set(key, n); lobbyPlayers[pid].name = p.name + ' ' + n; }
    else seen.set(key, 1);
  });
  broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
  renderLobby();

  battleActive = true; battleRound = 1; level = 1; dailyMode = false; roundEnded = false;
  battleDiff = pickRoundDiff();
  const seed = randSeed(); battleSeed = seed;
  finishOrder = []; progressState = {}; roundScores = {}; remotePaths = {}; quitPlayers.clear();
  totalExpected = Object.keys(lobbyPlayers).length;
  broadcastAll({ type:'start_round', round:1, maxRounds, seed, diff:battleDiff, level:1, abilities:abilitiesEnabled, mods:battleMods });
  initialSeed = seed;
  startGame(battleDiff, seed);
  startChaos();
}

// ── Render lobby ──
const playerCache = {}; // pid → last known {name, avatar} (for players who left before the final)
function renderLobby() {
  const pids = Object.keys(lobbyPlayers);
  pids.forEach(pid => { playerCache[pid] = { name:lobbyPlayers[pid].name, avatar:lobbyPlayers[pid].avatar }; });
  document.getElementById('p-count').innerText = pids.length + ' / ' + MAX_ROOM_PLAYERS;
  const box = document.getElementById('players-box'); box.innerHTML = '';
  pids.forEach(pid => {
    const p = lobbyPlayers[pid];
    const isMe = pid === myId;
    const title = titleName(p.avatar);
    const row = document.createElement('div'); row.className = 'p-row'; row.dataset.pid = pid;
    row.onclick = e => { if (!e.target.closest('.p-kick')) openProfile(pid, p); };
    row.innerHTML = `<div class="p-ava-wrap">${renderAvatar(p.avatar, p.name, 38)}
      <div class="p-lvl-wrap">${getLevelBadge(p.xpLevel || 1)}</div></div>
    <div class="p-info">
      <div class="p-name">${escapeHtml(p.name)}${isMe ? ' <span class="you">(you)</span>' : ''}</div>
      <div class="p-meta">${rankChip(p.rankName)}${title ? ' · ' + escapeHtml(title) : ''}</div>
    </div>
    <div class="p-tag ${p.host ? 'host' : 'guest'}">${p.host ? 'HOST' : 'GUEST'}</div>`;
    if (isHost && !isMe) {
      const k = document.createElement('button');
      k.className = 'p-kick'; k.title = 'Kick'; k.innerHTML = ic('userX');
      k.onclick = () => kickPlayer(pid);
      row.appendChild(k);
    }
    box.appendChild(row);
  });
  const sb = document.getElementById('start-btn');
  if (sb) sb.disabled = pids.length < 2;
  if (typeof mmOnLobbyChanged === 'function') mmOnLobbyChanged();
}

function kickPlayer(pid) {
  if (!isHost || pid === myId || !lobbyPlayers[pid]) return;
  const name = lobbyPlayers[pid].name;
  broadcastAll({ type:'kick', id:pid });
  handlePlayerQuit(pid);
  adminLog('warn', 'Kicked: ' + name);
}

// ── Host: messages from guests ──
function setupGuestConn(conn) {
  conn.on('data',  d => { try { handleGuestMsg(conn, d); } catch (e) { console.warn(e); } });
  conn.on('close', () => { const pid = connMap.get(conn); if (pid) handlePlayerQuit(pid); guestConns = guestConns.filter(c => c !== conn); });
  conn.on('error', () => { const pid = connMap.get(conn); if (pid) handlePlayerQuit(pid); });
}

function nameTakenInRoom(name, exceptPid) {
  return Object.entries(lobbyPlayers).some(([pid, p]) => pid !== exceptPid && p.name.toLowerCase() === name.toLowerCase());
}
const RANK_NAMES = new Set(RANKS.map(r => r.name));

function handleGuestMsg(conn, d) {
  if (!d || typeof d !== 'object') return;
  const pid = connMap.get(conn);

  if (d.type === 'join') {
    if (pid) return;
    const id = String(d.id || '').slice(0, 48);
    if (!id || id === myId) { conn.send({ type:'name_conflict' }); return; }
    // Someone who was already in this room is coming back (left by accident / lost signal)
    if (lobbyPlayers[id]) {
      for (const [c, cid] of connMap) if (cid === id && c !== conn) { connMap.delete(c); try { c.close(); } catch (e) {} }   // drop their old, dead link
      connMap.set(conn, id);
      const back = quitPlayers.delete(id);
      lobbyPlayers[id].avatar = sanitizeAvatar(d.avatar);
      broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
      conn.send({ type:'lobby_settings', diff:battleDiffSetting, rounds:maxRounds, abilities:abilitiesEnabled, mods:battleMods });
      if (battleActive) {
        const done = finishOrder.some(f => f.id === id);
        conn.send({ type:'rejoin_state', round:battleRound, maxRounds, seed:battleSeed, diff:battleDiff, level, mods:battleMods,
          finished:done, scores:roundScores, order:finishOrder, progress:progressState });
        broadcastAll({ type:'player_back', id, name:lobbyPlayers[id].name });
        if (back) { progressState[id] = { ...(progressState[id] || { pct:0 }), quit:false }; updateSpectateRow(id, progressState[id].pct || 0, !!done, '', false); }
      }
      renderLobby(); sfx('node');
      pushToast(lobbyPlayers[id].name + ' rejoined', 'acc', 'login');
      adminLog('ok', lobbyPlayers[id].name + ' rejoined');
      return;
    }
    if (battleActive) { conn.send({ type:'room_busy' }); setTimeout(() => conn.close(), 400); return; }
    if (Object.keys(lobbyPlayers).length >= MAX_ROOM_PLAYERS) { conn.send({ type:'room_full' }); setTimeout(() => conn.close(), 400); return; }
    let name = cleanName(d.name);
    if (lobbyPlayers[id]) { conn.send({ type:'name_conflict' }); return; }
    if (nameTakenInRoom(name)) {
      if (!isQuickMatch) { conn.send({ type:'name_conflict' }); return; }
      // Strangers in quick match can share a name — just number them
      let n = 2; while (nameTakenInRoom(name.slice(0, 13) + ' ' + n)) n++;
      name = name.slice(0, 13) + ' ' + n;
    }
    connMap.set(conn, id);
    quitPlayers.delete(id);
    lobbyPlayers[id] = {
      name, host:false,
      xpLevel: Math.max(1, Math.min(99999, parseInt(d.xpLevel) || 1)),
      rankName: RANK_NAMES.has(d.rankName) ? d.rankName : 'Newbie',
      avatar: sanitizeAvatar(d.avatar)
    };
    broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
    conn.send({ type:'lobby_settings', diff:battleDiffSetting, rounds:maxRounds, abilities:abilitiesEnabled, mods:battleMods });
    renderLobby();
    sfx('node');
    adminLog('ok', name + ' joined');
    return;
  }
  if (!pid || !lobbyPlayers[pid]) return; // must join first

  switch (d.type) {
    case 'rename': {
      const name = cleanName(d.name);
      if (nameTakenInRoom(name, pid)) { conn.send({ type:'name_conflict' }); return; }
      lobbyPlayers[pid].name = name;
      broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
      renderLobby();
      adminLog('ok', 'Rename → ' + name);
      break;
    }
    case 'avatar':
      lobbyPlayers[pid].avatar = sanitizeAvatar(d.avatar);
      broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
      renderLobby();
      break;
    case 'done': {
      if (!battleActive || roundEnded || finishOrder.some(e => e.id === pid)) return;
      const sec  = Math.max(0, Math.min(99999, Number(d.sec) || 0));
      const time = fmtMs(Math.round(sec * 1000));
      const path = Array.isArray(d.path) ? d.path.slice(0, 200).map(n => n | 0) : [];
      const pts  = calcPoints(sec, finishOrder.length);
      finishOrder.push({ id:pid, name:lobbyPlayers[pid].name, sec, time, pts });
      progressState[pid] = { pct:100, done:true, path };
      remotePaths[pid]   = path;
      broadcastAll({ type:'progress', id:pid, pct:100, done:true, time, path });
      updateSpectateRow(pid, 100, true, time, false);
      if (specViewPid === pid) renderMiniBoardForPlayer(pid);
      checkRoundComplete();
      break;
    }
    case 'progress': {
      if (!battleActive) return;
      const path = Array.isArray(d.path) ? d.path.slice(0, 200).map(n => n | 0) : [];
      const pct  = Math.max(0, Math.min(100, parseInt(d.pct) || 0));
      progressState[pid] = { pct, done:false, path };
      remotePaths[pid]   = path;
      broadcastAll({ type:'progress', id:pid, pct, path });
      updateSpectateRow(pid, pct, false, '', false);
      if (specViewPid === pid) renderMiniBoardForPlayer(pid);
      break;
    }
    case 'guest_left':
      handlePlayerQuit(pid);
      break;
    case 'chat': {
      const msg = String(d.msg || '').slice(0, 80).trim(); if (!msg) return;
      const out = { type:'chat', id:pid, name:lobbyPlayers[pid].name, msg };
      broadcastAll(out); receiveChatMsg(out);
      break;
    }
    case 'ability':
      relayAttack({ id:pid, name:lobbyPlayers[pid].name, kind:d.kind });
      break;
    case 'emote':
      relayEmote(pid, String(d.e || ''));
      break;
  }
}

function sanitizePlayers(pl) {
  const out = {};
  Object.entries(pl).forEach(([pid, p]) => {
    out[pid] = { name:p.name, host:!!p.host, xpLevel:p.xpLevel, rankName:p.rankName, avatar:sanitizeAvatar(p.avatar) };
  });
  return out;
}
function adoptPlayers(pl) {
  const out = {};
  if (pl && typeof pl === 'object') Object.entries(pl).forEach(([pid, p]) => {
    if (!p) return;
    out[String(pid).slice(0, 48)] = { name:cleanName(p.name), host:!!p.host, xpLevel:parseInt(p.xpLevel) || 1,
      rankName:RANK_NAMES.has(p.rankName) ? p.rankName : 'Newbie', avatar:sanitizeAvatar(p.avatar) };
  });
  return out;
}

// ── Guest: messages from host ──
function handleHostMsg(d) {
  if (!d || typeof d !== 'object') return;
  switch (d.type) {
    case 'lobby_update':
      lobbyPlayers = adoptPlayers(d.players);
      rememberRoom();
      renderLobby();
      if (isScreen('join-screen')) showLobbyAsGuest();
      break;
    case 'lobby_settings':
      battleDiffSetting = DIFFS.includes(d.diff) || d.diff === 'random' || d.diff === 'mm' ? d.diff : 'easy';
      maxRounds = Math.max(1, Math.min(10, parseInt(d.rounds) || 3));
      setMods(d.mods);
      renderGuestSettings();
      break;
    case 'play_again':
      battleActive = false; amSpectating = false;
      roundScores = {}; finishOrder = []; battleRound = 0; quitPlayers.clear();
      progressState = {}; remotePaths = {};
      showLobbyAsGuest();
      pushToast('Host started a new game!', 'acc');
      break;
    case 'name_conflict':
      rejoinAfterConflict = true;
      pushToast('Name already taken! Choose another.', 'warn');
      openNameEdit();
      document.getElementById('name-err').innerText = 'That name is taken in this room!';
      break;
    case 'room_busy':
    case 'room_full':
      pushToast(d.type === 'room_busy' ? 'That match already started' : 'Room is full', 'warn');
      document.getElementById('join-status').innerText = d.type === 'room_busy' ? 'Match in progress — try another room.' : 'Room is full.';
      if (isQuickMatch && typeof mmRetry === 'function') mmRetry();
      break;
    case 'start_round':
      battleActive = true; battleRound = d.round | 0; maxRounds = d.maxRounds | 0 || 3;
      battleSeed = d.seed >>> 0; battleDiff = DIFFS.includes(d.diff) ? d.diff : 'easy';
      setMods(d.mods);
      level = d.level || 1; dailyMode = false; roundEnded = false;
      finishOrder = []; progressState = {}; remotePaths = {}; quitPlayers.clear();
      amSpectating = false;
      initialSeed = battleSeed;
      document.getElementById('spec-live-wrap').style.display = 'none';
      if (typeof mmStop === 'function') mmStop(true);
      startGame(battleDiff, battleSeed);
      break;
    case 'round_results':
      stopTimer(); amSpectating = true;
      battleRound = d.round | 0; maxRounds = d.maxRounds | 0;
      finishOrder = (Array.isArray(d.order) ? d.order : []).map(e => ({ ...e, name:cleanName(e.name) }));
      showRoundResults(finishOrder);
      break;
    case 'final_results':
      roundScores = d.scores || {};
      if (d.players) lobbyPlayers = adoptPlayers(d.players);
      showFinalResults();
      break;
    case 'progress': {
      const pct = Math.max(0, Math.min(100, parseInt(d.pct) || 0));
      progressState[d.id] = { pct, done:!!d.done, path:d.path || [] };
      remotePaths[d.id]   = Array.isArray(d.path) ? d.path : [];
      updateSpectateRow(d.id, pct, !!d.done, d.time || '', false);
      if (specViewPid === d.id) renderMiniBoardForPlayer(d.id);
      break;
    }
    case 'player_quit': {
      quitPlayers.add(d.id);
      const nm = cleanName(d.name);
      pushToast(nm + ' left the game', 'warn');
      addChatMsg(nm + ' left the game', null, true);
      updateSpectateRow(d.id, (progressState[d.id] && progressState[d.id].pct) || 0, false, '', true);
      break;
    }
    case 'host_left':
      forgetRoom();
      if (!battleActive && mm && mm.phase === 'guest') { mmRetry(); break; }
      pushToast('Host left the room', 'warn');
      stopTimer();
      hostConn = null;
      { const q = isQuickMatch; resetBattleState(); show(q ? 'menu' : 'battle-mode'); }
      break;
    case 'announce':
      sfx('world'); showAvatarMessage('Announcement · ' + cleanName(d.by || 'Admin'), String(d.msg || '').slice(0, 80), cleanName(d.by || 'Admin'), d.av);
      addChatMsg('Admin: ' + String(d.msg || '').slice(0, 80), null, true);
      break;
    case 'freeze':
      if (!d.id || d.id === myId) { timerFrozen = true; pushToast('Timer frozen by admin', 'warn', 'pause'); }
      break;
    case 'unfreeze':
      if (!d.id || d.id === myId) timerFrozen = false;
      break;
    case 'kick':
      if (d.id === myId) {
        forgetRoom();
        pushToast('You were kicked from the room', 'warn');
        _destroyBattleSession(); stopTimer();
        setTimeout(() => show('menu'), 600);
      }
      break;
    case 'force_win':
      if (d.id === myId || !d.id) onWin();
      break;
    case 'grant_xp':
      if (d.id === myId) {
        const amt = Math.max(-100000, Math.min(100000, parseInt(d.amount) || 0));
        addXp(amt); updateMenuProfile(); pushToast('+' + amt + ' XP from admin', 'xp');
      }
      break;
    case 'force_boost':
      if (d.id && d.id !== myId) break;
      if (inGame() && !amSpectating) { try { useAbility(String(d.kind || '')); } catch (e) {} }
      break;
    case 'grant_boost':
      if ((d.id === myId || !d.id) && ABILITIES[d.kind] && abilityInv.length < MAX_SLOTS) {
        abilityInv.push(d.kind); renderAbilityBar(abilityInv.length - 1);
        pushToast('Admin gave you ' + ABILITIES[d.kind].name, 'acc', ABILITIES[d.kind].icon);
      }
      break;
    // Both are silent on purpose: the board just changes, with no sign an admin did it
    case 'reset_path':
      if (d.id && d.id !== myId) break;
      if (inGame() && !amSpectating) resetPath();
      break;
    case 'admin_solve':
      if (d.id && d.id !== myId) break;
      if (inGame() && !amSpectating && cells.length) { try { adminAutoSolve(); } catch (e) {} }
      break;
    case 'ability_hit':
      receiveAttack({ ...d, fromName:cleanName(d.fromName) });
      break;
    case 'rejoin_state':
      battleActive = true; battleRound = d.round | 0; maxRounds = d.maxRounds | 0 || 3;
      battleSeed = d.seed >>> 0; battleDiff = DIFFS.includes(d.diff) ? d.diff : 'easy';
      setMods(d.mods);
      level = d.level || 1; dailyMode = false; roundEnded = false; initialSeed = battleSeed;
      roundScores = d.scores && typeof d.scores === 'object' ? d.scores : {};
      finishOrder = (Array.isArray(d.order) ? d.order : []).map(e => ({ ...e, name:cleanName(e.name) }));
      progressState = d.progress && typeof d.progress === 'object' ? d.progress : {};
      remotePaths = {}; Object.entries(progressState).forEach(([k, v]) => { remotePaths[k] = Array.isArray(v && v.path) ? v.path : []; });
      quitPlayers.clear();
      if (typeof mmStop === 'function') mmStop(true);
      rememberRoom();
      if (d.finished) { amSpectating = true; showSpectateScreen(''); }
      else { amSpectating = false; startGame(battleDiff, battleSeed); }
      pushToast('Back in the match!', 'acc', 'login');
      break;
    case 'player_back':
      quitPlayers.delete(d.id);
      if (d.id !== myId) { pushToast(cleanName(d.name) + ' rejoined', 'acc', 'login'); addChatMsg(cleanName(d.name) + ' rejoined', null, true); }
      break;
    case 'party_troll':
      onPartyTroll(d);
      break;
    case 'chat':
      receiveChatMsg({ id:d.id, name:cleanName(d.name), msg:String(d.msg || '').slice(0, 80) });
      break;
    case 'emote':
      showEmote({ id:d.id, name:cleanName(d.name), e:String(d.e || '') });
      break;
  }
}

function renderGuestSettings() {
  const el = document.getElementById('guest-settings'); if (!el) return;
  const diff = battleDiffSetting === 'random' ? 'Random' : battleDiffSetting === 'mm' ? 'Level-based' : battleDiffSetting.toUpperCase();
  el.innerHTML = `<span>${diff}</span><span>${maxRounds} round${maxRounds !== 1 ? 's' : ''}</span>${battleMods.map(k => `<span class="chaos-chip">${MODIFIERS[k].name}</span>`).join('')}`;
}

// ── Host game management ──
function calcPoints(sec, pos) {
  const base = [100, 75, 55, 40, 30, 20, 15, 10];
  return (base[pos] || 8) + Math.max(0, 60 - Math.floor(sec));
}

function hostRegisterFinish(sec, time) {
  if (finishOrder.some(e => e.id === myId)) return;
  const pts = calcPoints(sec, finishOrder.length);
  finishOrder.push({ id:myId, name:myName, sec, time, pts });
  progressState[myId] = { pct:100, done:true, path:[...pathIndices] };
  broadcastAll({ type:'progress', id:myId, pct:100, done:true, time, path:[...pathIndices] });
  checkRoundComplete();
}

function checkRoundComplete() {
  const active = totalExpected - quitPlayers.size;
  if (!roundEnded && finishOrder.length >= active) setTimeout(() => broadcastRoundResults(), 400);
}

function broadcastRoundResults() {
  if (roundEnded) return;
  roundEnded = true;
  stopTimer(); amSpectating = true;
  const fullOrder = [...finishOrder];
  Object.keys(lobbyPlayers).forEach(pid => {
    if (fullOrder.find(e => e.id === pid)) return;
    const q = quitPlayers.has(pid);
    fullOrder.push({ id:pid, name:lobbyPlayers[pid].name, sec:9999, time:q ? 'QUIT' : 'DNF', pts:0, quit:q, dnf:!q });
  });
  broadcastAll({ type:'round_results', order:fullOrder, round:battleRound, maxRounds });
  showRoundResults(fullOrder);
}

function hostNextRound() {
  clearInterval(autoNextTimer);
  if (!isHost) return;
  battleRound++;
  level = 1; roundEnded = false;
  battleDiff = pickRoundDiff();
  finishOrder = []; progressState = {}; remotePaths = {};
  // Players who left last round are dropped from the room now
  if (quitPlayers.size) {
    quitPlayers.forEach(pid => { if (pid !== myId) delete lobbyPlayers[pid]; });
    quitPlayers.clear();
    broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
  }
  totalExpected = Object.keys(lobbyPlayers).length;
  if (totalExpected < 2) { pushToast('Everyone else left — match over', 'warn'); hostShowFinal(); return; }
  amSpectating = false;
  const seed = randSeed(); battleSeed = seed;
  broadcastAll({ type:'start_round', round:battleRound, maxRounds, seed, diff:battleDiff, level:1, abilities:abilitiesEnabled, mods:battleMods });
  startGame(battleDiff, seed);
  startChaos();
}

function hostShowFinal() {
  clearInterval(autoNextTimer);
  broadcastAll({ type:'final_results', scores:roundScores, players:sanitizePlayers(lobbyPlayers) });
  showFinalResults();
}

function broadcastAll(msg) { guestConns.forEach(c => { if (c && c.open) { try { c.send(msg); } catch (e) {} } }); }

function handlePlayerQuit(pid) {
  if (!lobbyPlayers[pid] || quitPlayers.has(pid)) return;
  const pname = lobbyPlayers[pid].name;
  // In the lobby a leaver simply disappears
  if (!battleActive) {
    delete lobbyPlayers[pid];
    for (const [c, id] of connMap) if (id === pid) { connMap.delete(c); try { c.close(); } catch (e) {} }
    if (isHost) broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
    renderLobby();
    pushToast(pname + ' left', 'warn');
    adminLog('warn', pname + ' left the lobby');
    return;
  }
  quitPlayers.add(pid);
  progressState[pid] = { ...(progressState[pid] || { pct:0 }), quit:true };
  pushToast(pname + ' left the game', 'warn');
  addChatMsg(pname + ' left the game', null, true);
  if (isHost) broadcastAll({ type:'player_quit', id:pid, name:pname });
  updateSpectateRow(pid, progressState[pid].pct || 0, false, '', true);
  if (isHost) checkRoundComplete();
  adminLog('warn', pname + ' disconnected');
}

// ── Spectate screen ──
function showSpectateScreen(myTime) {
  document.getElementById('spec-round-badge').innerText = 'Round ' + battleRound + ' of ' + maxRounds;
  document.getElementById('spec-sub').innerText = 'You finished in ' + myTime;
  specPlayerOrder = Object.keys(lobbyPlayers).filter(pid => pid !== myId);
  specViewPid = null;
  document.getElementById('spec-viewer-name').innerText = 'All Players';
  document.getElementById('spec-viewer-sub').innerText  = 'Tap a player row to watch live';
  document.getElementById('spec-live-wrap').style.display = 'none';
  renderSpectateList();
  updateSpecNavBtns();
  show('spectate');
  // Auto-watch the first rival still racing
  const racing = specPlayerOrder.find(pid => !finishOrder.some(e => e.id === pid) && !quitPlayers.has(pid));
  if (racing) specSelectPlayer(racing);
}

function renderSpectateList() {
  const list = document.getElementById('spec-list'); list.innerHTML = '';
  Object.entries(lobbyPlayers).forEach(([pid, p]) => {
    const entry  = finishOrder.find(e => e.id === pid);
    const prog   = progressState[pid] || { pct:0, done:false };
    const isQuit = quitPlayers.has(pid);
    const done   = !!entry || prog.done;
    const isMe   = pid === myId;
    const row    = document.createElement('div');
    row.className = 'spec-row' + (done ? ' done' : '') + (isQuit ? ' quit' : '') + (isMe ? ' me' : '');
    row.id = 'spec-row-' + pid;
    if (!isMe) row.onclick = () => specSelectPlayer(pid);
    const statusTxt = entry ? entry.time : (isQuit ? 'QUIT' : done ? 'Done' : 'Racing…');
    const pct       = done ? 100 : (prog.pct || 0);
    const fillClass = isQuit ? ' quit-fill' : (done ? '' : ' racing');
    row.innerHTML = `<div class="spec-row-top">
      ${renderAvatar(p.avatar, p.name, 30)}
      <div class="spec-name">${escapeHtml(p.name)}${isMe ? ' (you)' : ''} ${getLevelBadge(p.xpLevel || 1)}${rankChip(p.rankName, 'tiny')}</div>
      <div class="spec-status${done ? ' done' : ''}${isQuit ? ' quit' : ''}">${escapeHtml(statusTxt)}</div>
    </div>
    <div class="prog-bar-bg"><div class="prog-bar-fill${fillClass}" id="prog-${escapeHtml(pid)}" style="width:${pct}%"></div></div>`;
    list.appendChild(row);
  });
}

function updateSpectateRow(pid, pct, done, time, quit) {
  const bar = document.getElementById('prog-' + pid);
  const row = document.getElementById('spec-row-' + pid);
  if (!bar || !row) return;
  const stat = row.querySelector('.spec-status');
  if (quit) {
    bar.className = 'prog-bar-fill quit-fill';
    row.classList.add('quit');
    if (stat) { stat.innerText = 'QUIT'; stat.className = 'spec-status quit'; }
  } else if (done) {
    bar.classList.remove('racing'); bar.style.width = '100%';
    row.classList.add('done');
    if (stat) { stat.innerText = time || 'Done'; stat.classList.add('done'); }
  } else {
    bar.style.width = pct + '%';
  }
}

function specNavigate(dir) {
  if (!specPlayerOrder.length) return;
  if (specViewPid === null) {
    specViewPid = dir > 0 ? specPlayerOrder[0] : specPlayerOrder[specPlayerOrder.length - 1];
  } else {
    const idx = specPlayerOrder.indexOf(specViewPid);
    specViewPid = specPlayerOrder[(idx + dir + specPlayerOrder.length) % specPlayerOrder.length];
  }
  specSelectPlayer(specViewPid);
}

function specSelectPlayer(pid) {
  clearSpecTrollFx();
  if (!lobbyPlayers[pid] || pid === myId) return;
  specViewPid = pid;
  const p = lobbyPlayers[pid];
  document.getElementById('spec-viewer-name').innerText = p.name;
  const isQuit = quitPlayers.has(pid);
  const entry  = finishOrder.find(e => e.id === pid);
  document.getElementById('spec-viewer-sub').innerText = isQuit ? 'Player quit' : entry ? 'Finished: ' + entry.time : 'Racing…';
  document.getElementById('spec-live-wrap').style.display = 'block';
  document.getElementById('spec-live-name').innerText = p.name;
  document.querySelectorAll('.spec-row').forEach(r => r.classList.toggle('watching', r.id === 'spec-row-' + pid));
  renderMiniBoardForPlayer(pid);
  updateSpecNavBtns();
}

function updateSpecNavBtns() {
  const hasMult = specPlayerOrder.length > 1;
  document.getElementById('spec-prev-btn').disabled = !hasMult;
  document.getElementById('spec-next-btn').disabled = !hasMult;
}

// Spectating: a read-only copy of the watched player's board, built with the SAME cell / node /
// obstacle styles as the real board, and their own trail drawn with the same neon layers.
function renderMiniBoardForPlayer(pid) {
  const wrap = document.getElementById('spec-mini-grid');
  if (!wrap || !cells.length) return;
  const path = remotePaths[pid] || [];
  const pad = GPAD, gap = GAP;
  const maxW = Math.min(window.innerWidth - 56, 460), maxH = Math.max(200, window.innerHeight - 330);
  const cs = Math.max(14, Math.min(56, Math.floor((maxW - pad * 2 - (cols - 1) * gap) / cols), Math.floor((maxH - pad * 2 - (rows - 1) * gap) / rows)));
  const av = sanitizeAvatar((lobbyPlayers[pid] || playerCache[pid] || {}).avatar || {});
  const t = _find(TRAILS, av.trail) || TRAILS[0];
  const keepFx = [...wrap.classList].filter(c => c.startsWith('sp-'));   // a prank mid-flight survives the redraw
  wrap.className = ['spec-mini-grid', 'spec-board', ...keepFx].join(' ');
  wrap.style.cssText = `grid-template-columns:repeat(${cols},${cs}px);padding:${pad}px;gap:${gap}px;--trail-rgb:${t.rgb};--trail:rgb(${t.rgb});--trail-core:${t.core || '#fff'};--cs:${cs}px;--r:${Math.max(4, Math.round(cs * 0.2))}px`;
  const visible = new Set(solutionPath), pSet = new Set(path);
  const head = path.length ? path[path.length - 1] : -1;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < rows * cols; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.style.width = el.style.height = cs + 'px';
    if (portalMap.has(i)) { el.classList.add('portal'); el.style.setProperty('--pt', cells[i].style.getPropertyValue('--pt')); }
    if (onewayFrom.has(i)) { el.classList.add('oneway'); el.dataset.ow = cells[i].dataset.ow; }
    if (lockPairs.some(p => p.lock === i)) el.classList.add('lock-cell', ...(pSet.has(lockPairs.find(p => p.lock === i).key) ? [] : ['shut']));
    if (lockPairs.some(p => p.key === i)) el.classList.add('key-cell');
    if (obstacleSet.has(i)) el.classList.add('obstacle');
    else if (!visible.has(i)) el.classList.add('hidden-cell');
    else if (i === head) el.classList.add('active', 'path-head');
    else if (pSet.has(i)) el.classList.add('active');
    const num = cells[i] && cells[i].dataset.num;
    if (num) { el.dataset.num = num; el.innerHTML = `<div class="node" style="font-size:${Math.max(8, Math.round(cs * 0.3))}px">${num}</div>`; }
    else if (cells[i] && cells[i].querySelector('.pc-mark')) el.innerHTML = cells[i].innerHTML;
    frag.appendChild(el);
  }
  wrap.innerHTML = ''; wrap.appendChild(frag);
  if (path.length > 1) {
    const c = i => [pad + (i % cols) * (cs + gap) + cs / 2, pad + Math.floor(i / cols) * (cs + gap) + cs / 2];
    const d = path.map((i, k) => (k && gridAdj(path[k - 1], i) ? 'L' : 'M') + c(i).join(' ')).join(' ');
    const W = pad * 2 + cols * cs + (cols - 1) * gap, Hh = pad * 2 + rows * cs + (rows - 1) * gap;
    const gid = 'spg' + String(pid).replace(/[^a-z0-9]/gi, '');
    const spin = t.spin ? `<animateTransform attributeName="gradientTransform" type="rotate" from="0 ${W / 2} ${Hh / 2}" to="360 ${W / 2} ${Hh / 2}" dur="3s" repeatCount="indefinite"/>` : '';
    wrap.insertAdjacentHTML('beforeend', `<svg class="spec-trail${t.flow ? ' flow' : ''}${t.pulse ? ' pulse' : ''}${t.zap ? ' zap' : ''}${t.dash ? ' dash' : ''}" viewBox="0 0 ${W} ${Hh}" width="${W}" height="${Hh}">
      <defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${W}" y2="${Hh}">${trailStops(t)}${spin}</linearGradient></defs>
      <path class="st-glow" d="${d}" stroke="url(#${gid})"/><path class="st-body" d="${d}" stroke="url(#${gid})"/>
      <path class="st-core" d="${d}"/>${t.flow ? `<path class="st-flow" d="${d}"/>` : ''}</svg>`);
  }
}

// ── Round / Final results ──
function showRoundResults(order) {
  document.getElementById('rr-title').innerText = 'Round ' + battleRound + ' of ' + maxRounds;
  document.getElementById('rr-sub').innerText   = battleRound < maxRounds ? 'Round Complete!' : 'Final Round!';
  const list = document.getElementById('rr-list'); list.innerHTML = '';
  const pClasses = ['p1', 'p2', 'p3'];
  order.forEach((e, i) => {
    const pts = e.pts || 0;
    roundScores[e.id] = (roundScores[e.id] || 0) + pts;
    const p = lobbyPlayers[e.id];
    const row = document.createElement('div');
    row.className = 'rr-row ' + (pClasses[i] || '') + (e.id === myId ? ' me' : '');
    row.style.animationDelay = (i * 60) + 'ms';
    row.innerHTML = `<div class="rr-medal">${medal(i)}</div>
      ${renderAvatar(p && p.avatar, e.name, 30)}
      <div class="rr-info">
        <div class="rr-name">${escapeHtml(e.name)}${e.id === myId ? ' (you)' : ''}</div>
        <div class="rr-pts">${rankChip((p && p.rankName) || e.rankName, 'tiny')}+${pts} pts · Total: ${roundScores[e.id]} pts</div>
      </div>
      <div class="rr-time">${escapeHtml(e.quit ? 'QUIT' : e.time)}</div>`;
    list.appendChild(row);
  });

  const nextBtn      = document.getElementById('next-round-btn');
  const waitDiv      = document.getElementById('waiting-next');
  const finalBtn     = document.getElementById('final-leaderboard-btn');
  const countdownDiv = document.getElementById('rr-countdown');
  const countdownNum = document.getElementById('rr-countdown-num');

  if (isHost) {
    waitDiv.style.display = 'none';
    clearInterval(autoNextTimer);
    const last = battleRound >= maxRounds;
    nextBtn.style.display  = last ? 'none' : 'block';
    finalBtn.style.display = last ? 'block' : 'none';
    autoNextSec = last ? 5 : 6; countdownNum.innerText = autoNextSec; countdownDiv.style.display = 'flex';
    document.getElementById('rr-countdown-lbl').innerText = last ? 'Final standings in' : 'Next round in';
    autoNextTimer = setInterval(() => {
      autoNextSec--;
      countdownNum.innerText = autoNextSec;
      if (autoNextSec <= 0) { clearInterval(autoNextTimer); countdownDiv.style.display = 'none'; last ? hostShowFinal() : hostNextRound(); }
    }, 1000);
  } else {
    nextBtn.style.display  = 'none'; finalBtn.style.display = 'none';
    waitDiv.style.display  = 'flex'; countdownDiv.style.display = 'none';
  }
  show('round-results');
}

function showFinalResults() {
  clearInterval(autoNextTimer);
  stopTimer();
  const sorted = Object.entries(roundScores).sort((a, b) => b[1] - a[1]);
  const pinfo  = pid => lobbyPlayers[pid] || playerCache[pid] || null;
  const winnerName = sorted.length > 0 ? ((pinfo(sorted[0][0]) || {}).name || '???') : '';
  const isWinner = sorted.length > 0 && sorted[0][0] === myId;
  document.getElementById('fin-winner').innerText = isWinner ? 'You win!' : winnerName + ' wins!';
  const list = document.getElementById('fin-list'); list.innerHTML = '';
  let myPlace = -1;
  sorted.forEach(([pid, pts], i) => {
    if (pid === myId) myPlace = i;
    const p = pinfo(pid);
    const row = document.createElement('div');
    row.className = 'fin-row' + (i === 0 ? ' rank1' : '') + (pid === myId ? ' me' : '');
    row.style.animationDelay = (i * 80) + 'ms';
    row.innerHTML = `<div class="fin-medal">${medal(i)}</div>
      ${renderAvatar(p && p.avatar, p ? p.name : '?', 36)}
      <div class="fin-info">
        <div class="fin-name">${escapeHtml(p ? p.name : '???')}${pid === myId ? ' (you)' : ''}</div>
        <div class="fin-score">${rankChip(p && p.rankName, 'tiny')}${maxRounds} round${maxRounds !== 1 ? 's' : ''}</div>
      </div>
      <div class="fin-pts">${pts} pts</div>`;
    list.appendChild(row);
  });

  // Placement XP bonus (once per match)
  const bonus = [60, 30, 15][myPlace] || 0;
  const bEl = document.getElementById('fin-bonus');
  const placeCoins = [30, 18, 10][myPlace] || 5;
  if (battleActive && myPlace >= 0) {
    if (bonus) addXp(bonus);
    addCoins(placeCoins);
    bEl.innerHTML = (bonus ? '+' + bonus + ' XP · ' : '') + coinHtml('+' + placeCoins) + ' for ' + (['1st', '2nd', '3rd'][myPlace] || 'playing');
    bEl.style.display = '';
  }
  else bEl.style.display = 'none';
  battleActive = false;
  syncAccountToCloud().catch(() => {});

  const paBtn   = document.getElementById('fin-play-again-btn');
  const qBtn    = document.getElementById('fin-queue-btn');
  const waitDiv = document.getElementById('fin-wait-host');
  paBtn.style.display   = (!isQuickMatch && isHost) ? 'block' : 'none';
  waitDiv.style.display = (!isQuickMatch && !isHost) ? 'flex' : 'none';
  qBtn.style.display    = isQuickMatch ? 'block' : 'none';

  show('final-results');
  spawnParticles();
  if (isWinner) { sfx('win'); setTimeout(spawnParticles, 500); }
}

function playAgain() {
  clearInterval(autoNextTimer);
  battleActive = false; amSpectating = false;
  roundScores = {}; finishOrder = []; battleRound = 0; quitPlayers.clear();
  progressState = {}; remotePaths = {};
  if (isHost) {
    broadcastAll({ type:'play_again' });
    lobbyPlayers[myId] = selfLobbyEntry(true);
    broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
    showLobbyAsHost();
  }
}

function showLobbyAsHost() {
  show('lobby');
  document.getElementById('lob-title').innerText         = 'Your Room';
  document.getElementById('host-code-box').style.display = '';
  document.getElementById('room-code-disp').innerText    = roomCode;
  document.getElementById('host-settings').style.display = 'flex';
  document.getElementById('guest-settings').style.display = 'none';
  document.getElementById('start-btn').style.display     = 'block';
  document.getElementById('wait-msg').style.display      = 'flex';
  renderModRow();
  renderLobby();
}

function showLobbyAsGuest() {
  if (isQuickMatch) { renderLobby(); return; } // quick-match guests stay on the queue screen
  show('lobby');
  document.getElementById('lob-title').innerText          = 'Joined Room';
  document.getElementById('host-code-box').style.display  = 'none';
  document.getElementById('host-settings').style.display  = 'none';
  document.getElementById('guest-settings').style.display = 'flex';
  document.getElementById('start-btn').style.display      = 'none';
  document.getElementById('wait-msg').style.display       = 'flex';
  renderGuestSettings();
  renderLobby();
}

// ══════════════════════════════════════════════════
// REJOIN — guests can get back into a room for 10 minutes after leaving by accident
// ══════════════════════════════════════════════════
const REJOIN_MS = 10 * 60000;
function rememberRoom() { if (!isHost && roomCode && !isQuickMatch) try { localStorage.setItem('mz_lastRoom', JSON.stringify({ code: roomCode, at: Date.now() })); } catch (e) {} }
function forgetRoom() { try { localStorage.removeItem('mz_lastRoom'); } catch (e) {} updateRejoinBtns(); }
function lastRoom() {
  try { const r = JSON.parse(localStorage.getItem('mz_lastRoom') || 'null'); return r && /^[A-Z]{4}$/.test(r.code) && Date.now() - r.at < REJOIN_MS ? r : null; } catch (e) { return null; }
}
function updateRejoinBtns() {
  const r = !inBattleSession() && lastRoom();
  document.querySelectorAll('.rejoin-btn').forEach(b => { b.classList.toggle('hidden', !r); const c = b.querySelector('.rejoin-code'); if (c && r) c.textContent = r.code; });
}
async function rejoinRoom() {
  const r = lastRoom(); if (!r) return updateRejoinBtns();
  if (inBattleSession()) _destroyBattleSession();
  show('join-screen');
  const inp = document.getElementById('join-input'); if (inp) inp.value = r.code;
  const ok = await joinRoom(r.code, { onFail: () => { forgetRoom(); pushToast('That room is gone', 'warn'); } });
  if (ok) sfx('node');
}
