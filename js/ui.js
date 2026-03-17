// ══════════════════════════════════════════════════
// js/ui.js — Profile, navigation, chat, toast, particles, admin
// ══════════════════════════════════════════════════

// ── Copy room code ──
function copyRoomCode() {
  if (!roomCode) return;
  navigator.clipboard.writeText(roomCode).then(() => {
    pushToast('Room code copied!', 'acc');
    const btn = document.getElementById('copy-code-btn');
    if (btn) { btn.innerText = '✓'; setTimeout(() => { btn.innerText = '⎘ Copy'; }, 1500); }
  }).catch(() => {
    // Fallback for non-secure contexts
    pushToast(roomCode, 'info');
  });
}

// ── Screen navigation ──
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}
function goMenu() {
  battleActive = false; amSpectating = false;
  document.getElementById('battle-pill').style.display    = 'none';
  document.getElementById('battle-game-btn').style.display = 'none';
  document.getElementById('game-chat-btn').style.display   = 'none';
  document.getElementById('round-pill').style.display      = 'none';
  stopTimer(); show('menu');
}

// ── Profile / Name ──
function updateMenuProfile() {
  const s       = loadSave();
  const name    = s.name || myName;
  const cleared = s.totalCleared || 0;
  const xp      = s.xp || 0;
  const rank    = getRank(cleared);
  const xpp     = xpProgressInLevel(xp);
  document.getElementById('menu-ava').innerText              = name[0].toUpperCase();
  document.getElementById('menu-lvl-badge-wrap').innerHTML   = getLevelBadge(xpp.lvl);
  document.getElementById('menu-name').innerText             = name;
  document.getElementById('menu-rank').innerText             = rank.icon + ' ' + rank.name + ' · ' + cleared + ' cleared';
  document.getElementById('menu-xp-bar').style.width         = xpp.pct + '%';
  document.getElementById('menu-xp-txt').innerText           = 'LVL ' + xpp.lvl + ' · ' + xpp.current + '/' + xpp.need + ' XP';
}

function openNameEdit() {
  const s       = loadSave();
  const cleared = s.totalCleared || 0;
  const rank    = getRank(cleared);
  const xp      = s.xp || 0;
  const xpp     = xpProgressInLevel(xp);
  document.getElementById('name-input').value    = s.name || '';
  document.getElementById('name-err').innerText  = '';
  document.getElementById('rp-icon').innerText   = rank.icon;
  document.getElementById('rp-rank').innerText   = rank.name + ' · Level ' + xpp.lvl;
  document.getElementById('rp-desc').innerText   = cleared + ' levels cleared · ' + xp + ' total XP';
  show('name-edit');
  setTimeout(() => { const i = document.getElementById('name-input'); i.style.touchAction = 'auto'; i.focus(); }, 300);
}

function cancelNameEdit() {
  if (rejoinAfterConflict) {
    // They cancelled after a name conflict — go back to join screen
    rejoinAfterConflict = false;
    show('join-screen');
  } else {
    const s = loadSave();
    show(s.name ? 'menu' : 'menu');
  }
}

function saveName() {
  const val = document.getElementById('name-input').value.trim();
  if (!val) { document.getElementById('name-err').innerText = 'Enter a name first!'; return; }

  // Uniqueness check against lobby
  const inLobby = isHost || (hostConn && hostConn.open);
  if (inLobby) {
    const taken = Object.entries(lobbyPlayers).some(([pid, p]) =>
      pid !== myId && p.name.toLowerCase() === val.toLowerCase()
    );
    if (taken) { document.getElementById('name-err').innerText = 'Name already taken in this room!'; return; }
  }

  myName = val; writeSave({ name: val });
  updateMenuProfile();

  if (rejoinAfterConflict && hostConn && hostConn.open) {
    // FIX: re-send join message with new name
    rejoinAfterConflict = false;
    const cleared = loadSave().totalCleared || 0;
    hostConn.send({ type:'join', id:myId, name:myName,
      xpLevel:getXpLevel(loadSave().xp||0), rankName:getRank(cleared).name });
    show('join-screen');
    document.getElementById('join-status').innerText = 'Rejoining with new name…';
    return;
  }

  if (isHost) {
    // Update host entry in lobby and broadcast
    if (lobbyPlayers[myId]) { lobbyPlayers[myId].name = myName; }
    broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
    renderLobby();
    show('lobby');
  } else if (hostConn && hostConn.open) {
    // FIX: notify host of name change while in lobby
    hostConn.send({ type:'rename', id:myId, name:myName });
    show('lobby');
  } else {
    show('menu');
  }

  pushToast('Profile saved! 👾', 'acc');
}

// ── Chat ──
function openChat() {
  chatUnread = 0;
  document.getElementById('game-chat-btn').classList.remove('has-unread');
  document.getElementById('spec-chat-btn').classList.remove('has-unread');
  document.getElementById('chat-overlay').classList.remove('hidden');
  setTimeout(() => {
    const input = document.getElementById('chat-input');
    input.style.touchAction = 'auto'; input.focus(); scrollChatBottom();
  }, 100);
}
function closeChat() {
  document.getElementById('chat-overlay').classList.add('hidden');
  document.getElementById('chat-input').blur();
}
function sendChat() {
  const input = document.getElementById('chat-input');
  const msg   = input.value.trim(); if (!msg) return;
  input.value = '';
  const d = { type:'chat', id:myId, name:myName, msg };
  if (isHost) broadcastAll(d);
  else if (hostConn && hostConn.open) hostConn.send(d);
  addChatMsg(msg, myName, false, true);
}
function receiveChatMsg(d) {
  if (d.id === myId) return;
  addChatMsg(d.msg, d.name, false, false);
  chatUnread++;
  const overlay = document.getElementById('chat-overlay');
  if (overlay.classList.contains('hidden')) {
    document.getElementById('game-chat-btn').classList.add('has-unread');
    document.getElementById('spec-chat-btn').classList.add('has-unread');
  }
}
function addChatMsg(msg, name, isSystem, isMe) {
  const msgs = document.getElementById('chat-msgs');
  const div  = document.createElement('div');
  div.className = 'chat-msg' + (isSystem ? ' system' : isMe ? ' mine' : '');
  if (isSystem) {
    div.innerHTML = `<div class="chat-bubble">${msg}</div>`;
  } else {
    div.innerHTML = `<div class="chat-msg-name">${isMe?'You':name}</div><div class="chat-bubble">${escapeHtml(msg)}</div>`;
  }
  msgs.appendChild(div);
  chatMsgs.push({ msg, name, isSystem, isMe });
  scrollChatBottom();
}
function scrollChatBottom() { const m = document.getElementById('chat-msgs'); if (m) m.scrollTop = m.scrollHeight; }
function escapeHtml(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
});

// ── Toast ──
function pushToast(msg, type = 'info') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.innerText = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 2700);
}

// ── Particles ──
function spawnParticles() {
  const layer = document.getElementById('particles-layer');
  const cols2 = ['#2dff7f','#ffd700','#a78bfa','#48dbfb','#ff4d6a'];
  for (let i = 0; i < 22; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = 4 + Math.random() * 8;
      p.style.cssText = `width:${size}px;height:${size}px;background:${cols2[Math.floor(Math.random()*cols2.length)]};`
        + `left:${20+Math.random()*60}%;top:${30+Math.random()*40}%;`
        + `animation-duration:${0.7+Math.random()*0.8}s;animation-delay:${Math.random()*0.3}s;`;
      layer.appendChild(p);
      setTimeout(() => p.remove(), 1400);
    }, i * 30);
  }
}

// ══════════════════════════════════════════════════
// ADMIN — PIN + panel
// ══════════════════════════════════════════════════
function adminOpen() {
  pinBuffer = ''; updatePinDots();
  document.getElementById('auth-err').innerText = '';
  document.getElementById('admin-auth').classList.remove('adm-hidden');
}
function adminClose() {
  document.getElementById('admin-auth').classList.add('adm-hidden');
  document.getElementById('admin-panel').classList.add('adm-hidden');
  // Always fully reset PIN state so nothing lingers
  pinBuffer = ''; updatePinDots();
  document.getElementById('auth-err').innerText = '';
}
function pinKey(k) {
  if (pinBuffer.length >= 4) return;
  pinBuffer += k; updatePinDots();
  if (pinBuffer.length === 4) verifyPin();
}
function pinDel() {
  pinBuffer = pinBuffer.slice(0, -1); updatePinDots();
  document.getElementById('auth-err').innerText = '';
}
function updatePinDots() {
  for (let i = 0; i < 4; i++) {
    const d = document.getElementById('pd' + i);
    d.classList.remove('filled','err');
    if (i < pinBuffer.length) d.classList.add('filled');
  }
}
async function verifyPin() {
  const ok = await checkPinHash(pinBuffer);
  if (ok) {
    document.getElementById('admin-auth').classList.add('adm-hidden');
    openAdminPanel();
  } else {
    document.getElementById('auth-err').innerText = 'Wrong PIN';
    for (let i = 0; i < 4; i++) document.getElementById('pd' + i).classList.add('err');
    setTimeout(() => { pinBuffer = ''; updatePinDots(); document.getElementById('auth-err').innerText = ''; }, 900);
  }
}

function openAdminPanel() {
  const isBattle = battleActive;
  document.getElementById('adm-mode-badge').innerText     = isBattle ? 'BATTLE' : 'SOLO';
  document.getElementById('adm-battle-cmds').style.display = isBattle ? 'block' : 'none';
  document.getElementById('adm-target-section').style.display =
    (isBattle && Object.keys(lobbyPlayers).length > 1) ? 'block' : 'none';
  adminRefreshStatus();
  if (isBattle) renderAdminTargets();
  document.getElementById('admin-panel').classList.remove('adm-hidden');
}
function adminRefreshStatus() {
  document.getElementById('adm-lvl-disp').innerText     = battleActive ? ('R'+battleRound) : level;
  document.getElementById('adm-timer-disp').innerText   = fmt(elapsedSec);
  document.getElementById('adm-players-disp').innerText = Object.keys(lobbyPlayers).length || 1;
}
function renderAdminTargets() {
  const row = document.getElementById('adm-target-row'); row.innerHTML = '';
  Object.entries(lobbyPlayers).forEach(([pid, p]) => {
    const chip = document.createElement('button');
    chip.className = 'adm-target-chip' + (pid === adminTargetId ? ' sel' : '');
    chip.innerText = p.name + (pid === myId ? ' (you)' : '');
    chip.onclick = () => { adminTargetId = pid; renderAdminTargets(); };
    row.appendChild(chip);
  });
}
function adminLog(type, msg) {
  const log = document.getElementById('adm-log'); if (!log) return;
  const entry = document.createElement('div');
  entry.className = 'adm-log-entry ' + type;
  entry.innerText = '[' + fmt(elapsedSec) + '] ' + msg;
  log.appendChild(entry); log.scrollTop = log.scrollHeight;
}

// ── Helper: run admin action then close panel ──
function adminAct(fn) { fn(); adminClose(); }

// ── Level / Board ──
function adminSetLevel() {
  const v = parseInt(document.getElementById('adm-lvl-input').value) || 1;
  level = Math.max(1, v);
  updateInGameLevelBadge();
  generate(); startTimer();
  adminLog('ok', 'Level set to ' + level);
  adminClose();
}
function adminDeltaLevel(d) {
  level = Math.max(1, level + d);
  updateInGameLevelBadge();
  generate(); startTimer();
  adminLog('ok', 'Level → ' + level);
  adminClose();
}
function adminNewBoard()   { adminAct(() => { generate(); startTimer(); adminLog('ok','New board generated'); }); }
function adminResetBoard() { adminAct(() => { resetPath(); adminLog('ok','Path cleared'); }); }
function adminRevealPath() {
  clearSvg();
  const svg = document.getElementById('grid-svg');
  if (solutionPath.length < 2) return;
  const pts = solutionPath.map(cellCenter);
  let d = `M${pts[0].x},${pts[0].y}`; for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x},${pts[i].y}`;
  const el = document.createElementNS('http://www.w3.org/2000/svg','path');
  el.setAttribute('d',d); el.setAttribute('stroke','rgba(167,139,250,.4)'); el.setAttribute('stroke-width','3');
  el.setAttribute('stroke-linecap','round'); el.setAttribute('stroke-linejoin','round');
  el.setAttribute('fill','none'); el.setAttribute('stroke-dasharray','6 4'); svg.appendChild(el);
  setTimeout(() => clearSvg(), 4000);
  adminLog('ok','Path revealed for 4s');
  adminClose();
}
function adminAutoSolve() {
  if (!solutionPath.length) return;
  resetPath(); let i = 0;
  const interval = setInterval(() => {
    if (i >= solutionPath.length) { clearInterval(interval); onWin(); return; }
    push(solutionPath[i++]);
  }, 60);
  adminLog('ok','Auto-solving…');
  adminClose();
}

// ── XP / Stats ──
function adminAddXp(amt)    { const r=addXp(amt); updateMenuProfile(); adminLog('ok','+'+amt+' XP → LVL '+r.newLvl); adminClose(); }
function adminResetXp()     { writeSave({xp:0}); updateMenuProfile(); adminLog('warn','XP reset'); adminClose(); }
function adminAddCleared(n) { const s=loadSave(); writeSave({totalCleared:(s.totalCleared||0)+n}); updateMenuProfile(); adminLog('ok','+'+n+' clears'); adminClose(); }
function adminSetXpVal()    { const v=parseInt(document.getElementById('adm-xp-input').value)||0; writeSave({xp:v}); updateMenuProfile(); adminLog('ok','XP set to '+v); adminClose(); }

// ── Timer ──
function adminFreezeTimer() { timerFrozen=true;  if(isHost)broadcastAll({type:'freeze'});   adminLog('warn','Timer frozen');   adminClose(); }
function adminResumeTimer() { timerFrozen=false; if(isHost)broadcastAll({type:'unfreeze'}); adminLog('ok','Timer resumed');   adminClose(); }
function adminResetTimer()  { elapsedSec=0; document.getElementById('timer').innerText='00:00'; adminLog('ok','Timer reset'); adminClose(); }
function adminAddTime(sec)  {
  elapsedSec = Math.max(0, elapsedSec + sec);
  document.getElementById('timer').innerText = fmt(elapsedSec);
  adminLog('ok', (sec>0?'+':'')+sec+'s to timer → '+fmt(elapsedSec));
  adminClose();
}

// ── Battle commands ──
function adminForceWin()  { adminAct(() => { onWin(); adminLog('ok','Force win'); }); }
function adminForceLose() { adminAct(() => { goMenu(); adminLog('warn','Force lose → menu'); }); }

function adminFreezeTarget() {
  if (isHost) broadcastAll({ type:'freeze', id:adminTargetId });
  timerFrozen = true; // also freeze self if targeting self
  adminLog('warn', 'Freeze → ' + (lobbyPlayers[adminTargetId]?.name || adminTargetId));
  adminClose();
}
function adminUnfreezeAll() {
  timerFrozen = false;
  if (isHost) broadcastAll({ type:'unfreeze' });
  adminLog('ok','Unfroze all');
  adminClose();
}

// FIX: Kick now also marks the player as quit on the host's own screen
function adminKick() {
  if (!isHost || adminTargetId === myId) { adminLog('warn','Cannot kick self or non-host'); adminClose(); return; }
  const kicked = lobbyPlayers[adminTargetId];
  if (!kicked) { adminClose(); return; }
  broadcastAll({ type:'kick', id:adminTargetId });
  // Immediately mark as quit on host side too
  handlePlayerQuit(adminTargetId);
  adminLog('warn', 'Kicked: ' + kicked.name);
  adminClose();
}

function adminSkipRound() {
  if (!isHost || !battleActive) { adminLog('warn','Must be host in active battle'); adminClose(); return; }
  adminLog('ok', 'Round skipped by admin');
  broadcastRoundResults();
  adminClose();
}

function adminResetAllPaths() {
  resetPath();
  if (isHost) broadcastAll({ type:'reset_path' });
  adminLog('ok', 'All paths reset');
  adminClose();
}

function adminGrantXpToTarget() {
  const amt = parseInt(document.getElementById('adm-grant-xp-input').value) || 50;
  if (adminTargetId === myId) {
    addXp(amt); updateMenuProfile();
    adminLog('ok', 'Granted '+amt+' XP to self');
  } else {
    if (isHost) broadcastAll({ type:'grant_xp', id:adminTargetId, amount:amt });
    adminLog('ok', 'Granted '+amt+' XP to '+(lobbyPlayers[adminTargetId]?.name||adminTargetId));
  }
  adminClose();
}

function adminSetDiff() {
  const sel = document.getElementById('adm-diff-select').value;
  battleDiff = sel; currentDiff = sel;
  document.getElementById('diff-label').innerText = sel.toUpperCase();
  adminLog('ok', 'Diff → ' + sel);
  adminClose();
}

function adminSendAnnounce() {
  const msg = document.getElementById('adm-msg-input').value.trim(); if (!msg) return;
  if (isHost) broadcastAll({ type:'announce', msg });
  addChatMsg('📢 ' + msg, null, true); pushToast('📢 ' + msg, 'info');
  document.getElementById('adm-msg-input').value = '';
  adminLog('ok', 'Announced: ' + msg);
  adminClose();
}

function adminResetAll() {
  if (!confirm('Wipe ALL local save data?')) return;
  localStorage.removeItem('mazzie'); updateMenuProfile();
  adminLog('warn','All saves wiped'); pushToast('Saves wiped!','warn');
  adminClose();
}
async function adminChangePIN() {
  const newPin = prompt('Enter new PIN (digits only):');
  if (!newPin || !/^\d+$/.test(newPin)) { pushToast('Invalid PIN','warn'); return; }
  const hash = await sha256(newPin);
  localStorage.setItem('mazzie_pin_hash', hash);
  pushToast('PIN updated! Update config.js to make it permanent.','acc');
  adminLog('ok','PIN changed (localStorage override)');
  adminClose();
}

// F2 — toggle: close if anything admin is open, open PIN if everything is closed
document.addEventListener('keydown', e => {
  if (e.key !== 'F2') return;
  e.preventDefault();
  const authOpen  = !document.getElementById('admin-auth').classList.contains('adm-hidden');
  const panelOpen = !document.getElementById('admin-panel').classList.contains('adm-hidden');
  if (authOpen || panelOpen) adminClose();
  else adminOpen();
});
