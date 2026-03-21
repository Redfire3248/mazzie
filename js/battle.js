// ══════════════════════════════════════════════════
// js/battle.js — Networking, lobby, host/guest logic
// ══════════════════════════════════════════════════

// ── Peer init ──
function initPeer(cb) {
  peer = new Peer({ debug: 0 });
  peer.on('open', () => { hideConnecting(); cb(); });
  peer.on('error', err => {
    document.getElementById('conn-txt').innerText = 'NETWORK ERROR — ' + err.type;
    setTimeout(() => { hideConnecting(); show('menu'); }, 2500);
  });
}
function hideConnecting() { document.getElementById('connecting').classList.add('hidden'); }

// ── App init ──
window.addEventListener('load', () => {
  initPeer(() => {
    initAccount(name => {
      myName = name;
      updateMenuProfile();
      _setupContinueBtn();
      show('menu');
    });
  });
});

// ── Room code generator ──
function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let c = ''; for (let i = 0; i < 4; i++) c += chars[Math.floor(Math.random() * chars.length)];
  return c;
}

// ── Host a room ──
function openHostLobby() {
  document.getElementById('connecting').classList.remove('hidden');
  document.getElementById('conn-txt').innerText = 'CREATING ROOM…';
  roomCode = genCode(); isHost = true;
  lobbyPlayers = {}; roundScores = {}; finishOrder = []; quitPlayers.clear(); battleRound = 0;
  lobbyPlayers[myId] = {
    name: myName, host: true,
    xpLevel:  getXpLevel(loadSave().xp || 0),
    rankName: getRank(loadSave().totalCleared || 0).name
  };
  if (codePeer) { try { codePeer.destroy(); } catch(e) {} }
  codePeer = new Peer('mazzie-' + roomCode, { debug: 0 });
  codePeer.on('open', () => {
    hideConnecting();
    showLobbyAsHost();
  });
  codePeer.on('connection', conn => { guestConns.push(conn); setupGuestConn(conn); });
  codePeer.on('error', err => {
    hideConnecting();
    if (err.type === 'unavailable-id') { openHostLobby(); }
    else { pushToast('Could not create room: ' + err.type, 'warn'); show('battle-mode'); }
  });
}

// ── Join a room ──
async function doJoin() {
  const code = document.getElementById('join-input').value.trim().toUpperCase();
  if (code.length !== 4) { document.getElementById('join-status').innerText = 'Enter a 4-letter code'; return; }
  document.getElementById('join-status').innerText = 'Connecting…';

  // Re-init peer if it was destroyed or disconnected
  if (!peer || peer.destroyed || peer.disconnected) {
    document.getElementById('join-status').innerText = 'Reconnecting…';
    await new Promise(resolve => {
      peer = new Peer({ debug: 0 });
      peer.on('open', resolve);
      peer.on('error', () => {
        document.getElementById('join-status').innerText = 'Network error. Refresh and try again.';
      });
    });
  }

  if (hostConn) { try { hostConn.close(); } catch(e) {} hostConn = null; }
  lobbyPlayers = {}; roundScores = {}; finishOrder = []; quitPlayers.clear();
  rejoinAfterConflict = false;
  const conn = peer.connect('mazzie-' + code, { reliable: true });
  hostConn = conn;
  conn.on('open', () => {
    const cleared = loadSave().totalCleared || 0;
    conn.send({ type:'join', id:myId, name:myName,
      xpLevel: getXpLevel(loadSave().xp||0), rankName: getRank(cleared).name });
    document.getElementById('join-status').innerText = 'Connected! Waiting for host…';
  });
  conn.on('data', d => handleHostMsg(d));
  conn.on('close', () => {
    if (battleActive || document.getElementById('lobby') && !document.getElementById('lobby').classList.contains('hidden')) {
      pushToast('Disconnected from host','warn');
    }
    hostConn = null;
  });
  conn.on('error', () => {
    document.getElementById('join-status').innerText = 'Could not connect. Check the code.';
    hostConn = null;
  });
}

// ── Full battle state reset (shared by leaveLobby + tab close) ──
function _destroyBattleSession() {
  try {
    if (isHost) {
      broadcastAll({ type: 'host_left' });
      guestConns.forEach(c => { try { c.close(); } catch(e) {} });
    } else {
      if (hostConn && hostConn.open) {
        hostConn.send({ type: 'guest_left', id: myId, name: myName });
        hostConn.close();
      }
    }
  } catch(e) {}
  guestConns = []; hostConn = null;
  if (codePeer) { try { codePeer.destroy(); } catch(e) {} codePeer = null; }
  isHost = false; battleActive = false; amSpectating = false;
  lobbyPlayers = {}; roomCode = '';
  roundScores = {}; finishOrder = []; battleRound = 0;
  quitPlayers.clear(); progressState = {}; remotePaths = {};
  clearInterval(autoNextTimer);
}

// ── Tab/window close — tell host we left ──
window.addEventListener('beforeunload', () => {
  if (isHost || hostConn) _destroyBattleSession();
});

function leaveLobby() {
  if (battleActive) {
    if (!confirm('Leave the battle in progress?')) return;
  }
  _destroyBattleSession();
  show('battle-mode');
}

// ── Lobby settings ──
function pickDiff(btn, diff) {
  battleDiff = diff;
  document.querySelectorAll('.bdiff-btn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
}
function changeRounds(d) {
  maxRounds = Math.max(1, Math.min(10, maxRounds + d));
  document.getElementById('rounds-disp').innerText = maxRounds;
}

// ── Start battle ──
function hostStart() {
  if (Object.keys(lobbyPlayers).length < 2) { pushToast('Need at least 2 players!','warn'); return; }

  // Final name-uniqueness safety pass — suffix any duplicates with a number
  const seen = new Map(); // lowercase name → count
  Object.entries(lobbyPlayers).forEach(([pid, p]) => {
    const key = p.name.toLowerCase();
    if (seen.has(key)) {
      const n = seen.get(key) + 1; seen.set(key, n);
      lobbyPlayers[pid].name = p.name + ' ' + n;
    } else {
      seen.set(key, 1);
    }
  });
  broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
  renderLobby();

  battleActive = true; battleRound = 1;
  level = 1;
  const seed = (Math.random() * 1e6) | 0; battleSeed = seed;
  finishOrder = []; progressState = {}; roundScores = {}; remotePaths = {}; quitPlayers.clear();
  totalExpected = Object.keys(lobbyPlayers).length;
  broadcastAll({ type:'start_round', round:1, maxRounds, seed, diff:battleDiff, level:1 });
  initialSeed = seed;
  startGame(battleDiff, seed);
}

// ── Render lobby ──
function renderLobby() {
  const pids = Object.keys(lobbyPlayers);
  document.getElementById('p-count').innerText = pids.length;
  const box = document.getElementById('players-box'); box.innerHTML = '';
  pids.forEach((pid, i) => {
    const p = lobbyPlayers[pid];
    const isMe = pid === myId;
    const row = document.createElement('div'); row.className = 'p-row';
    row.innerHTML = `<div class="p-ava-wrap">
      <div class="p-ava" style="background:${PAL[i%PAL.length]}">${p.name.slice(0,2).toUpperCase()}</div>
      <div class="p-lvl-wrap">${getLevelBadge(p.xpLevel||1)}</div>
    </div>
    <div class="p-info">
      <div class="p-name">${p.name}${isMe?' (you)':''}</div>
      <div class="p-meta">${p.rankName||'Newbie'}</div>
    </div>
    <div class="p-tag ${p.host?'host':'guest'}">${p.host?'HOST':'GUEST'}</div>`;
    box.appendChild(row);
  });
  const sb = document.getElementById('start-btn');
  if (sb) sb.disabled = pids.length < 2;
}

// ── Host message handler (from guests) ──
function setupGuestConn(conn) {
  conn.on('data',  d => handleGuestMsg(conn, d));
  conn.on('close', () => { const pid = connMap.get(conn); if (pid) handlePlayerQuit(pid); });
  conn.on('error', () => { const pid = connMap.get(conn); if (pid) handlePlayerQuit(pid); });
}

function handleGuestMsg(conn, d) {
  if (d.type === 'join') {
    // FIX: unique name check (case-insensitive)
    const nameTaken = Object.entries(lobbyPlayers).some(([pid, p]) =>
      p.name.toLowerCase() === d.name.toLowerCase()
    );
    if (nameTaken) { conn.send({ type:'name_conflict' }); return; }
    connMap.set(conn, d.id);
    lobbyPlayers[d.id] = { name:d.name, host:false, xpLevel:d.xpLevel||1, rankName:d.rankName||'', _conn:conn };
    broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
    conn.send({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
    renderLobby();
    adminLog('ok', d.name + ' joined');

  } else if (d.type === 'rename') {
    // FIX: player changing name in lobby
    const nameTaken = Object.entries(lobbyPlayers).some(([pid, p]) =>
      pid !== d.id && p.name.toLowerCase() === d.name.toLowerCase()
    );
    if (nameTaken) { conn.send({ type:'name_conflict' }); return; }
    if (lobbyPlayers[d.id]) {
      lobbyPlayers[d.id].name = d.name;
      broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
      renderLobby();
      adminLog('ok', 'Rename: ' + d.id + ' → ' + d.name);
    }

  } else if (d.type === 'done') {
    const pts = calcPoints(d.sec, finishOrder.length);
    finishOrder.push({ id:d.id, name:d.name, sec:d.sec, time:d.time, pts, rankName:d.rankName, xpLvl:d.xpLvl });
    progressState[d.id] = { pct:100, done:true, path:d.path||[] };
    remotePaths[d.id]   = d.path || [];
    broadcastAll({ type:'progress', id:d.id, pct:100, done:true, time:d.time, path:d.path||[] });
    if (specViewPid === d.id) renderMiniBoardForPlayer(d.id);
    checkRoundComplete();

  } else if (d.type === 'progress') {
    progressState[d.id] = { pct:d.pct, done:false, path:d.path||[] };
    remotePaths[d.id]   = d.path || [];
    broadcastAll(d);
    updateSpectateRow(d.id, d.pct, false, '', false);
    if (specViewPid === d.id) renderMiniBoardForPlayer(d.id);

  } else if (d.type === 'guest_left') {
    const pid = d.id || connMap.get(conn);
    if (pid) handlePlayerQuit(pid);

  } else if (d.type === 'chat') {
    broadcastAll(d);
    receiveChatMsg(d);
  }
}

function sanitizePlayers(pl) {
  const out = {};
  Object.entries(pl).forEach(([pid, p]) => {
    out[pid] = { name:p.name, host:p.host, xpLevel:p.xpLevel, rankName:p.rankName };
  });
  return out;
}

// ── Guest message handler (from host) ──
function handleHostMsg(d) {
  if (d.type === 'lobby_update') {
    lobbyPlayers = d.players;
    renderLobby();
    // Navigate guest from join-screen → lobby on first lobby_update
    const joinScreen = document.getElementById('join-screen');
    if (joinScreen && !joinScreen.classList.contains('hidden')) {
      showLobbyAsGuest();
    }

  } else if (d.type === 'play_again') {
    // Host wants a rematch — guests go back to lobby
    battleActive = false; amSpectating = false;
    roundScores = {}; finishOrder = []; battleRound = 0; quitPlayers.clear();
    progressState = {}; remotePaths = {};
    showLobbyAsGuest();
    pushToast('Host started a new game!', 'acc');

  } else if (d.type === 'name_conflict') {
    rejoinAfterConflict = true;
    pushToast('Name already taken! Choose another.', 'warn');
    show('name-edit');
    document.getElementById('name-err').innerText = 'That name is taken in this room!';

  } else if (d.type === 'start_round') {
    battleActive = true; battleRound = d.round; maxRounds = d.maxRounds;
    battleSeed = d.seed; battleDiff = d.diff;
    level = d.level || 1; // FIX: sync level from host
    finishOrder = []; progressState = {}; remotePaths = {}; quitPlayers.clear();
    amSpectating = false;
    initialSeed = d.seed;
    document.getElementById('spec-live-wrap').style.display = 'none';
    startGame(d.diff, d.seed);

  } else if (d.type === 'round_results') {
    battleRound = d.round; maxRounds = d.maxRounds;
    finishOrder = d.order || [];
    showRoundResults(finishOrder);

  } else if (d.type === 'final_results') {
    roundScores = d.scores || {};
    if (d.players) lobbyPlayers = d.players;
    showFinalResults();

  } else if (d.type === 'progress') {
    progressState[d.id] = { pct:d.pct, done:d.done||false, path:d.path||[] };
    remotePaths[d.id]   = d.path || [];
    updateSpectateRow(d.id, d.pct, d.done||false, d.time||'', false);
    if (specViewPid === d.id) renderMiniBoardForPlayer(d.id);

  } else if (d.type === 'player_quit') {
    quitPlayers.add(d.id);
    pushToast(d.name + ' left the game', 'warn');
    addChatMsg('🚪 ' + d.name + ' left the game', null, true);
    updateSpectateRow(d.id, progressState[d.id]?.pct||0, false, '', true);

  } else if (d.type === 'host_left') {
    pushToast('Host left the room', 'warn');
    hostConn = null; battleActive = false; lobbyPlayers = {};
    show('battle-mode');

  } else if (d.type === 'announce') {
    pushToast('📢 ' + d.msg, 'info');
    addChatMsg('📢 ' + d.msg, null, true);

  } else if (d.type === 'freeze') {
    timerFrozen = true; pushToast('⏸ Timer frozen by admin', 'warn');

  } else if (d.type === 'unfreeze') {
    timerFrozen = false;

  } else if (d.type === 'kick') {
    if (d.id === myId) { pushToast('You were kicked from the room', 'warn'); setTimeout(() => goMenu(), 1200); }

  } else if (d.type === 'force_win') {
    if (d.id === myId || !d.id) onWin();

  } else if (d.type === 'grant_xp') {
    if (d.id === myId) { addXp(d.amount); updateMenuProfile(); pushToast('⬡ +'+d.amount+' XP from admin!','xp'); }

  } else if (d.type === 'reset_path') {
    resetPath(); pushToast('↩ Admin reset your path','warn');

  } else if (d.type === 'chat') {
    receiveChatMsg(d);
  }
}

// ── Host game management ──
function calcPoints(sec, pos) {
  const base = [100, 75, 55, 40, 30, 20, 15, 10];
  return (base[pos] || 8) + Math.max(0, 60 - sec);
}

function hostRegisterFinish(sec, time) {
  const pts = calcPoints(sec, finishOrder.length);
  const cleared = loadSave().totalCleared || 0;
  finishOrder.push({
    id:myId, name:myName, sec, time, pts,
    rankName:getRank(cleared).name, xpLvl:getXpLevel(loadSave().xp||0)
  });
  progressState[myId] = { pct:100, done:true, path:[...pathIndices] };
  broadcastAll({ type:'progress', id:myId, pct:100, done:true, time, path:[...pathIndices] });
  checkRoundComplete();
}

function checkRoundComplete() {
  const active = totalExpected - quitPlayers.size;
  if (finishOrder.length >= active) setTimeout(() => broadcastRoundResults(), 400);
}

function broadcastRoundResults() {
  stopTimer();
  const fullOrder = [...finishOrder];
  quitPlayers.forEach(pid => {
    if (!fullOrder.find(e => e.id === pid) && lobbyPlayers[pid])
      fullOrder.push({ id:pid, name:lobbyPlayers[pid].name, sec:9999, time:'QUIT', pts:0, quit:true });
  });
  broadcastAll({ type:'round_results', order:fullOrder, round:battleRound, maxRounds });
  showRoundResults(fullOrder);
}

function hostNextRound() {
  clearInterval(autoNextTimer);
  battleRound++;
  level = 1; // FIX: reset level for each round
  finishOrder = []; progressState = {}; remotePaths = {}; quitPlayers.clear();
  amSpectating = false;
  const seed = (Math.random() * 1e6) | 0; battleSeed = seed;
  broadcastAll({ type:'start_round', round:battleRound, maxRounds, seed, diff:battleDiff, level:1 });
  startGame(battleDiff, seed);
}

function hostShowFinal() {
  clearInterval(autoNextTimer);
  broadcastAll({ type:'final_results', scores:roundScores, players:lobbyPlayers });
  showFinalResults();
}

function broadcastAll(msg) { guestConns.forEach(c => { if (c && c.open) c.send(msg); }); }

function handlePlayerQuit(pid) {
  if (!lobbyPlayers[pid] || quitPlayers.has(pid)) return;
  quitPlayers.add(pid);
  progressState[pid] = { ...(progressState[pid] || { pct:0 }), quit:true };
  const pname = lobbyPlayers[pid].name;
  pushToast(pname + ' left the game', 'warn');
  addChatMsg('🚪 ' + pname + ' left the game', null, true);
  if (isHost) broadcastAll({ type:'player_quit', id:pid, name:pname });
  updateSpectateRow(pid, progressState[pid].pct||0, false, '', true);
  if (battleActive && isHost) checkRoundComplete();
  adminLog('warn', pname + ' disconnected');
}

// ── Spectate screen ──
function showSpectateScreen(myTime) {
  document.getElementById('spec-round-badge').innerText = 'Round ' + battleRound + ' of ' + maxRounds;
  specPlayerOrder = Object.keys(lobbyPlayers).filter(pid => pid !== myId);
  specViewPid = null;
  document.getElementById('spec-viewer-name').innerText = 'All Players';
  document.getElementById('spec-viewer-sub').innerText  = 'Tap a player row to watch live';
  document.getElementById('spec-live-wrap').style.display = 'none';
  renderSpectateList();
  updateSpecNavBtns();
  show('spectate');
}

function renderSpectateList() {
  const list = document.getElementById('spec-list'); list.innerHTML = '';
  Object.entries(lobbyPlayers).forEach(([pid, p], i) => {
    const entry   = finishOrder.find(e => e.id === pid);
    const prog    = progressState[pid] || { pct:0, done:false };
    const isQuit  = quitPlayers.has(pid);
    const done    = !!entry;
    const row     = document.createElement('div');
    row.className = 'spec-row' + (done?' done':'') + (isQuit?' quit':'');
    row.id = 'spec-row-' + pid;
    const isMe = pid === myId;
    if (isMe) {
      row.style.cssText = 'cursor:default;opacity:.7;';
    } else {
      row.onclick = () => specSelectPlayer(pid);
    }
    const statusTxt = done ? entry.time : (isQuit ? 'QUIT' : 'Racing…');
    const pct       = done ? 100 : (isQuit ? prog.pct||0 : prog.pct||0);
    const fillClass = isQuit ? 'quit-fill' : (done ? '' : ' racing');
    const lvlBadge  = getLevelBadge(p.xpLevel || 1);
    row.innerHTML = `<div class="spec-row-top">
      <div class="spec-ava" style="background:${PAL[i%PAL.length]}">${p.name.slice(0,2).toUpperCase()}</div>
      <div class="spec-name">${p.name}${pid===myId?' (you)':''} ${lvlBadge}</div>
      <div class="spec-status${done?' done':''}${isQuit?' quit':''}">${statusTxt}</div>
    </div>
    <div class="prog-bar-bg"><div class="prog-bar-fill${fillClass}" id="prog-${pid}" style="width:${pct}%"></div></div>`;
    list.appendChild(row);
  });
}

function updateSpectateRow(pid, pct, done, time, quit) {
  const bar = document.getElementById('prog-' + pid);
  const row = document.getElementById('spec-row-' + pid);
  if (!bar || !row) return;
  if (quit) {
    bar.className = 'prog-bar-fill quit-fill';
    row.classList.add('quit');
    const stat = row.querySelector('.spec-status');
    if (stat) { stat.innerText = 'QUIT'; stat.className = 'spec-status quit'; }
  } else if (done) {
    bar.classList.remove('racing'); bar.style.width = '100%';
    row.classList.add('done');
    const stat = row.querySelector('.spec-status');
    if (stat) { stat.innerText = time; stat.classList.add('done'); }
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
    const newIdx = (idx + dir + specPlayerOrder.length) % specPlayerOrder.length;
    specViewPid = specPlayerOrder[newIdx];
  }
  specSelectPlayer(specViewPid);
}

function specSelectPlayer(pid) {
  if (!lobbyPlayers[pid] || pid === myId) return; // can't spectate yourself
  specViewPid = pid;
  const p = lobbyPlayers[pid];
  document.getElementById('spec-viewer-name').innerText = p.name;
  const isQuit = quitPlayers.has(pid);
  const entry  = finishOrder.find(e => e.id === pid);
  document.getElementById('spec-viewer-sub').innerText =
    isQuit ? 'Player quit' : entry ? 'Finished: ' + entry.time : 'Racing…';
  document.getElementById('spec-live-wrap').style.display = 'block';
  document.getElementById('spec-live-name').innerText = p.name;
  renderMiniBoardForPlayer(pid);
  updateSpecNavBtns();
  const card = document.querySelector('.spec-card');
  if (card) card.scrollTop = 0;
}

function updateSpecNavBtns() {
  const hasMult = specPlayerOrder.length > 1;
  document.getElementById('spec-prev-btn').disabled = !hasMult;
  document.getElementById('spec-next-btn').disabled = !hasMult;
}

function renderMiniBoardForPlayer(pid) {
  const wrap = document.getElementById('spec-mini-grid');
  if (!wrap) return;
  wrap.innerHTML = '';
  const path = remotePaths[pid] || [];
  const miniCellSize = Math.min(Math.floor((Math.min(window.innerWidth - 80, 360) - GPAD * 2 - (cols - 1) * 2) / cols), 28);
  wrap.style.cssText = `display:grid;grid-template-columns:repeat(${cols},${miniCellSize}px);gap:2px;padding:6px;background:var(--bg);border-radius:10px;`;
  const visitedSet = new Set(solutionPath);
  const pathSet    = new Set(path);
  const pathHead   = path.length > 0 ? path[path.length - 1] : -1;
  for (let i = 0; i < rows * cols; i++) {
    const el = document.createElement('div');
    el.className = 'mini-cell';
    el.style.cssText = `width:${miniCellSize}px;height:${miniCellSize}px;border-radius:4px;`;
    if (!visitedSet.has(i))      el.classList.add('hidden-cell');
    else if (i === pathHead)     el.classList.add('path-head');
    else if (pathSet.has(i))     el.classList.add('active');
    const mainCell = cells[i];
    if (mainCell && mainCell.dataset.num) {
      const nd = document.createElement('div');
      nd.className = 'mini-node';
      nd.style.cssText = `width:60%;height:60%;border-radius:50%;background:#fff;color:#111;`
        + `display:flex;align-items:center;justify-content:center;font-weight:700;`
        + `font-size:${Math.max(6,miniCellSize*0.28)}px;font-family:'DM Mono',monospace;`;
      nd.innerText = mainCell.dataset.num;
      el.appendChild(nd);
      if (pathSet.has(i) || i === pathHead) {
        nd.style.background = i === pathHead ? '#08080f' : 'var(--acc)';
        nd.style.color      = i === pathHead ? 'var(--acc)' : '#08080f';
      }
    }
    wrap.appendChild(el);
  }
}

// ── Round / Final results ──
function showRoundResults(order) {
  document.getElementById('rr-title').innerText = 'Round ' + battleRound + ' of ' + maxRounds;
  document.getElementById('rr-sub').innerText   = battleRound < maxRounds ? 'Round Complete!' : 'Final Round!';
  const list = document.getElementById('rr-list'); list.innerHTML = '';
  const pClasses = ['p1','p2','p3'];
  order.forEach((e, i) => {
    const pts = e.pts || 0;
    roundScores[e.id] = (roundScores[e.id] || 0) + pts;
    const row = document.createElement('div');
    row.className = 'rr-row ' + (pClasses[i] || '');
    row.innerHTML = `<div class="rr-medal">${MEDALS[i]||'#'+(i+1)}</div>
      <div class="rr-info">
        <div class="rr-name">${e.name}${e.id===myId?' (you)':''}</div>
        <div class="rr-pts">+${pts} pts · Total: ${roundScores[e.id]} pts</div>
      </div>
      <div class="rr-time">${e.quit?'QUIT':e.time}</div>`;
    list.appendChild(row);
  });

  const nextBtn      = document.getElementById('next-round-btn');
  const waitDiv      = document.getElementById('waiting-next');
  const finalBtn     = document.getElementById('final-leaderboard-btn');
  const countdownDiv = document.getElementById('rr-countdown');
  const countdownNum = document.getElementById('rr-countdown-num');

  if (isHost) {
    if (battleRound >= maxRounds) {
      nextBtn.style.display  = 'none'; finalBtn.style.display = 'block';
      waitDiv.style.display  = 'none'; countdownDiv.style.display = 'none';
    } else {
      finalBtn.style.display = 'none'; nextBtn.style.display  = 'block';
      waitDiv.style.display  = 'none';
      autoNextSec = 10; countdownNum.innerText = autoNextSec; countdownDiv.style.display = 'block';
      clearInterval(autoNextTimer);
      autoNextTimer = setInterval(() => {
        autoNextSec--;
        countdownNum.innerText = autoNextSec;
        if (autoNextSec <= 0) { clearInterval(autoNextTimer); countdownDiv.style.display = 'none'; hostNextRound(); }
      }, 1000);
    }
  } else {
    nextBtn.style.display  = 'none'; finalBtn.style.display = 'none';
    waitDiv.style.display  = 'flex'; countdownDiv.style.display = 'none';
  }
  show('round-results');
}

function showFinalResults() {
  clearInterval(autoNextTimer);
  const sorted = Object.entries(roundScores).sort((a, b) => b[1] - a[1]);
  const winnerName = sorted.length > 0 ? (lobbyPlayers[sorted[0][0]]?.name || '???') : '';
  const isWinner = sorted.length > 0 && sorted[0][0] === myId;
  document.getElementById('fin-winner').innerText = winnerName + (isWinner ? ' 🎉 (you!)' : ' wins! 🎉');
  const list = document.getElementById('fin-list'); list.innerHTML = '';
  sorted.forEach(([pid, pts], i) => {
    const p = lobbyPlayers[pid];
    const row = document.createElement('div');
    row.className = 'fin-row' + (i === 0 ? ' rank1' : '');
    const roundCount = maxRounds;
    row.innerHTML = `<div class="fin-medal">${MEDALS[i]||'#'+(i+1)}</div>
      <div class="fin-info">
        <div class="fin-name">${p?p.name:pid}${pid===myId?' (you)':''}</div>
        <div class="fin-score">${roundCount} round${roundCount!==1?'s':''}</div>
      </div>
      <div class="fin-pts">${pts} pts</div>`;
    list.appendChild(row);
  });

  // Show play-again only for host; guests get it via play_again message
  const paBtn = document.getElementById('fin-play-again-btn');
  const waitDiv = document.getElementById('fin-wait-host');
  if (isHost) {
    if (paBtn)  { paBtn.style.display = 'block'; }
    if (waitDiv){ waitDiv.style.display = 'none'; }
  } else {
    if (paBtn)  { paBtn.style.display = 'none'; }
    if (waitDiv){ waitDiv.style.display = 'flex'; }
  }

  show('final-results');
  spawnParticles();
}

function playAgain() {
  clearInterval(autoNextTimer);
  battleActive = false; amSpectating = false;
  roundScores = {}; finishOrder = []; battleRound = 0; quitPlayers.clear();
  progressState = {}; remotePaths = {};
  if (isHost) {
    broadcastAll({ type:'play_again' });
    // Update host entry XP/rank
    lobbyPlayers[myId] = {
      name: myName, host: true,
      xpLevel:  getXpLevel(loadSave().xp || 0),
      rankName: getRank(loadSave().totalCleared || 0).name
    };
    broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
    showLobbyAsHost();
  }
}

function showLobbyAsHost() {
  show('lobby');
  document.getElementById('lob-title').innerText            = 'Your Room';
  document.getElementById('host-code-box').style.display    = '';
  document.getElementById('room-code-disp').innerText       = roomCode;
  document.getElementById('host-settings').style.display    = 'flex';
  document.getElementById('start-btn').style.display        = 'block';
  document.getElementById('wait-msg').style.display         = 'flex';
  renderLobby();
}

function showLobbyAsGuest() {
  show('lobby');
  document.getElementById('lob-title').innerText            = 'Joined Room';
  document.getElementById('host-code-box').style.display    = 'none';
  document.getElementById('host-settings').style.display    = 'none';
  document.getElementById('start-btn').style.display        = 'none';
  document.getElementById('wait-msg').style.display         = 'flex';
  renderLobby();
}
