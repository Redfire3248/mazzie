// ══════════════════════════════════════════════════
// js/ui.js — Navigation, profile, chat, toast, particles, settings
// ══════════════════════════════════════════════════

// ── Copy room code ──
function copyRoomCode() {
  if (!roomCode) return;
  navigator.clipboard.writeText(roomCode).then(() => {
    pushToast('Room code copied!', 'acc');
    const btn = document.getElementById('copy-code-btn');
    if (btn) { btn.innerHTML = ic('check') + 'Copied'; setTimeout(() => { btn.innerHTML = ic('copy') + 'Copy'; }, 1500); }
  }).catch(() => pushToast(roomCode, 'info'));
}

// ── Screen navigation ──
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
  document.body.dataset.screen = id;
  // Any real screen means loading is over (safety net for every sign-in path)
  document.getElementById('connecting').classList.add('hidden');
  if (id === 'menu') { updateDailyBtn(); _setupContinueBtn(); updateMenuProfile(); }
  if (el && typeof fitText === 'function') { requestAnimationFrame(() => fitText(el)); setTimeout(() => fitText(el), 350); }   // shrink long titles to fit
}
function isScreen(id) { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden'); }

function goMenu() {
  clearTimeout(window._autoNextT);
  if (inBattleSession()) _destroyBattleSession();
  battleActive = false; amSpectating = false; dailyMode = false;
  document.getElementById('battle-pill').style.display   = 'none';
  document.getElementById('game-chat-btn').style.display = 'none';
  document.getElementById('round-pill').style.display    = 'none';
  stopTimer(); show('menu');
}
// In-game Menu button: confirm before abandoning a live battle
function gameMenuBtn() {
  if (battleActive && !confirm('Leave the battle in progress?')) return;
  goMenu();
}

// ── Profile / Name ──
function updateMenuProfile() {
  const s       = loadSave();
  const name    = (currentAccount && currentAccount.name) || s.name || myName;
  const cleared = s.totalCleared || 0;
  const rank    = getRank(cleared);
  const xpp     = xpProgressInLevel(s.xp || 0);
  const av      = getMyAvatar();
  document.getElementById('menu-ava').innerHTML              = renderAvatar(av, name, 48);
  document.getElementById('menu-lvl-badge-wrap').innerHTML   = getLevelBadge(xpp.lvl);
  document.getElementById('menu-name').innerText             = name;
  const title = titleName(av);
  document.getElementById('menu-rank').innerHTML             = rankIcon(rank) + '<span>' + rank.name + (title ? ' · ' + escapeHtml(title) : '') + '</span><span class="dim">' + cleared + ' cleared</span>';
  document.getElementById('menu-xp-bar').style.width         = xpp.pct + '%';
  document.getElementById('menu-xp-txt').innerText           = xpp.current + ' / ' + xpp.need + ' XP';
  const offlineEl = document.getElementById('menu-offline-badge');
  if (offlineEl) offlineEl.style.display = (currentAccount && (currentAccount.offline || currentAccount.local)) ? '' : 'none';
  const qb = document.getElementById('qm-bracket');
  if (qb && typeof bracketFor === 'function') { const i = bracketFor(xpp.lvl); qb.innerHTML = bracketIcon(i) + MM_BRACKETS[i].name; }
  const adm = document.getElementById('menu-admin-btn');
  if (adm) adm.hidden = !isAdminUser();
  if (typeof updateCoinUI === 'function') {
    updateCoinUI();
    const si = document.getElementById('store-info');
    const chestReady = s.chestDay !== todayKey();
    si.innerText = chestReady ? 'Free chest!' : 'Boosts';
    si.classList.toggle('done', chestReady);
  }
}

function updateDailyBtn() {
  const el = document.getElementById('daily-info'); if (!el) return;
  const best = (loadSave().daily || {})[todayKey()];
  el.innerText = best ? fmtMs(best) : 'New';
  el.classList.toggle('done', !!best);
}

function openNameEdit() {
  const s       = loadSave();
  const cleared = s.totalCleared || 0;
  const rank    = getRank(cleared);
  const xp      = s.xp || 0;
  const xpp     = xpProgressInLevel(xp);
  const name    = (currentAccount && currentAccount.name) || s.name || '';
  document.getElementById('name-input').value        = name;
  document.getElementById('name-err').innerText      = '';
  document.getElementById('name-checking').innerText = '';
  document.getElementById('rp-icon').innerHTML       = rankIcon(rank);
  document.getElementById('rp-rank').innerText       = rank.name + ' · Level ' + xpp.lvl;
  document.getElementById('rp-desc').innerText       = cleared + ' levels cleared · ' + xp + ' total XP';
  show('name-edit');
  setTimeout(() => { const i = document.getElementById('name-input'); i.focus(); }, 300);
}

// Live availability check as user types
let _nameEditTimeout = null;
async function onNameInputChange() {
  const val = document.getElementById('name-input').value.trim();
  const el  = document.getElementById('name-checking');
  if (!el) return;
  clearTimeout(_nameEditTimeout);
  const current = (currentAccount && currentAccount.name) || '';
  if (val === current || val.length < 2) { el.innerText = ''; return; }
  el.innerText = 'Checking…'; el.className = 'name-checking';
  _nameEditTimeout = setTimeout(async () => {
    if (document.getElementById('name-input').value.trim() !== val) return;
    const status = await checkNameAvailable(val);
    if (status === 'available')   { el.innerHTML = ic('check') + 'Available'; el.className = 'name-checking ok'; }
    else if (status === 'taken')  { el.innerHTML = ic('x') + 'Already taken'; el.className = 'name-checking bad'; }
    else if (status === 'invalid'){ el.innerHTML = ic('x') + 'Invalid name'; el.className = 'name-checking bad'; }
    else el.innerText = '';
  }, 600);
}

function cancelNameEdit() {
  if (rejoinAfterConflict) { rejoinAfterConflict = false; show('join-screen'); }
  else show(inBattleSession() ? 'lobby' : 'menu');
}

async function saveName() {
  const val   = document.getElementById('name-input').value.trim();
  const errEl = document.getElementById('name-err');
  const btn   = document.querySelector('#name-edit .b-btn.primary');
  if (!val) { errEl.innerText = 'Enter a name first!'; return; }

  const current = (currentAccount && currentAccount.name) || '';
  if (val.toLowerCase() === current.toLowerCase() && !rejoinAfterConflict) { show(inBattleSession() ? 'lobby' : 'menu'); return; }

  // Room uniqueness first (cheap, no network)
  if (inBattleSession() && nameTakenInRoom(val, myId)) { errEl.innerText = 'Name already taken in this room!'; return; }

  if (btn) { btn.disabled = true; btn.innerText = '…'; }
  errEl.innerText = '';
  const result = await renameAccount(val);
  if (btn) { btn.disabled = false; btn.innerHTML = 'Save' + ic('arrowR'); }
  if (result && result.error) { errEl.innerText = result.error; return; }

  myName = val;
  writeSave({ name: val });
  updateMenuProfile();
  syncAccountToCloud().catch(() => {});

  if (rejoinAfterConflict && hostConn && hostConn.open) {
    rejoinAfterConflict = false;
    sendJoin();
    show('join-screen');
    document.getElementById('join-status').innerText = 'Rejoining with new name…';
    return;
  }
  if (isHost) {
    if (lobbyPlayers[myId]) lobbyPlayers[myId].name = myName;
    broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
    renderLobby(); show('lobby');
  } else if (hostConn && hostConn.open) {
    hostConn.send({ type:'rename', id:myId, name:myName });
    show('lobby');
  } else {
    show('menu');
  }
  pushToast('Profile saved', 'acc');
}

// ── Chat ──
const QUICK_EMOTES = ['Hi!', 'GG', 'Nice!', 'So close', 'Too fast', 'Rematch?', 'Good luck', 'Oops'];
function openChat() {
  chatUnread = 0;
  document.getElementById('game-chat-btn').classList.remove('has-unread');
  document.getElementById('spec-chat-btn').classList.remove('has-unread');
  document.getElementById('chat-overlay').classList.remove('hidden');
  const row = document.getElementById('chat-emotes');
  if (row && !row.childElementCount) QUICK_EMOTES.forEach(e => {
    const b = document.createElement('button'); b.className = 'chat-emote'; b.innerText = e;
    b.onclick = () => sendChat(e); row.appendChild(b);
  });
  setTimeout(() => { document.getElementById('chat-input').focus(); scrollChatBottom(); }, 100);
}
function closeChat() {
  document.getElementById('chat-overlay').classList.add('hidden');
  document.getElementById('chat-input').blur();
}
function sendChat(preset) {
  const input = document.getElementById('chat-input');
  const msg   = (typeof preset === 'string' ? preset : input.value).trim().slice(0, 80); if (!msg) return;
  if (typeof preset !== 'string') input.value = '';
  if (!inBattleSession()) { pushToast('Not in a room', 'warn'); return; }
  const d = { type:'chat', id:myId, name:myName, msg };
  if (isHost) broadcastAll(d);
  else if (hostConn && hostConn.open) hostConn.send(d);
  addChatMsg(msg, myName, false, true);
}
function receiveChatMsg(d) {
  if (d.id === myId) return;
  addChatMsg(d.msg, d.name, false, false);
  chatUnread++;
  if (document.getElementById('chat-overlay').classList.contains('hidden')) {
    document.getElementById('game-chat-btn').classList.add('has-unread');
    document.getElementById('spec-chat-btn').classList.add('has-unread');
    // Show the latest message as a floating bubble while racing
    showChatPeek(d.name, d.msg);
  }
}
function showChatPeek(name, msg) {
  const el = document.getElementById('chat-peek'); if (!el) return;
  el.innerHTML = `<b>${escapeHtml(name)}</b> ${escapeHtml(msg)}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function addChatMsg(msg, name, isSystem, isMe) {
  const msgs = document.getElementById('chat-msgs');
  const div  = document.createElement('div');
  div.className = 'chat-msg' + (isSystem ? ' system' : isMe ? ' mine' : '');
  div.innerHTML = isSystem
    ? `<div class="chat-bubble">${escapeHtml(msg)}</div>`
    : `<div class="chat-msg-name">${isMe ? 'You' : escapeHtml(name)}</div><div class="chat-bubble">${escapeHtml(msg)}</div>`;
  msgs.appendChild(div);
  chatMsgs.push({ msg, name, isSystem, isMe });
  while (msgs.childElementCount > 120) msgs.firstChild.remove();
  scrollChatBottom();
}
function scrollChatBottom() { const m = document.getElementById('chat-msgs'); if (m) m.scrollTop = m.scrollHeight; }

document.getElementById('chat-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
  if (e.key === 'Escape') closeChat();
});

// ── Toast ──
const TOAST_ICON = { acc:'check', warn:'alert', xp:'star', info:'info' };
function pushToast(msg, type = 'info', icon) {
  const c = document.getElementById('toast-container');
  while (c.childElementCount >= 4) c.firstChild.remove();
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = ic(icon || TOAST_ICON[type] || 'info') + '<span>' + escapeHtml(msg) + '</span>';
  c.appendChild(t);
  setTimeout(() => t.remove(), 2700);
}

// ── Reward cards: show exactly what you got (level-ups, unlocks, coins, boosts, messages) ──
// showReward({ icon | iconHtml, title, sub, chips:[{html,label}], tone:'gold'|'xp'|'cyan'|'acc'|'world', ms, quick })
const _rewardQ = [];
let _rewardBusy = false;
function showReward(r) {
  _rewardQ.push(r);
  if (!_rewardBusy) nextReward();
}
function nextReward() {
  const r = _rewardQ.shift();
  if (!r) { _rewardBusy = false; return; }
  _rewardBusy = true;
  const layer = document.getElementById('reward-layer');
  const card = document.createElement('div');
  card.className = 'reward ' + (r.tone || 'gold') + (r.face ? ' face' : '');
  const chips = (r.chips || []).slice(0, 6);
  const more = (r.chips || []).length - chips.length;
  card.innerHTML = `<div class="rw-shine"></div>
    <div class="rw-ic">${r.iconHtml || ic(r.icon || 'star')}</div>
    <div class="rw-body">
      ${r.kicker ? `<div class="rw-kicker">${escapeHtml(r.kicker)}</div>` : ''}
      <div class="rw-title">${escapeHtml(r.title || '')}</div>
      ${r.sub ? `<div class="rw-sub">${escapeHtml(r.sub)}</div>` : ''}
      ${chips.length ? `<div class="rw-chips">${chips.map((c, i) => `<div class="rw-chip" style="animation-delay:${180 + i * 70}ms">${c.html}${c.label ? `<small>${escapeHtml(c.label)}</small>` : ''}</div>`).join('')}${more > 0 ? `<div class="rw-chip more">+${more}</div>` : ''}</div>` : ''}
    </div>`;
  layer.appendChild(card);
  if (typeof fitText === 'function') fitText(card);
  let done = false;
  const close = () => {
    if (done) return; done = true;
    card.classList.add('out');
    setTimeout(() => { card.remove(); nextReward(); }, 260);
  };
  card.onclick = close;
  setTimeout(close, r.ms || (r.quick ? 1800 : chips.length ? 3600 : 2600));
}

// Admin / player message card that shows the sender's character (icon + frame)
function showAvatarMessage(kicker, msg, by, av, ms) {
  const face = renderAvatar(sanitizeAvatar(av || {}), by || 'Admin', 46);
  showReward({ iconHtml: face, tone: 'world', kicker, title: String(msg || '').slice(0, 200), ms: ms || 6500, face: true });
}

// ── Particles ──
function spawnParticles() {
  const layer = document.getElementById('particles-layer');
  const cols2 = ['#2dff7f', '#ffd700', '#a78bfa', '#4dfffe', '#ff4d6a', '#ff9f43'];
  for (let i = 0; i < 22; i++) {
    setTimeout(() => {
      const p = document.createElement('div');
      p.className = 'particle';
      const size = 4 + Math.random() * 8;
      p.style.cssText = `width:${size}px;height:${size}px;background:${cols2[Math.floor(Math.random() * cols2.length)]};`
        + `left:${20 + Math.random() * 60}%;top:${30 + Math.random() * 40}%;`
        + `animation-duration:${0.7 + Math.random() * 0.8}s;animation-delay:${Math.random() * 0.3}s;`;
      layer.appendChild(p);
      setTimeout(() => p.remove(), 1400);
    }, i * 30);
  }
}

// ── Sound / haptics toggles ──
function toggleSound() { setSetting('sound', !getSetting('sound', true)); syncSoundBtn(); sfx('node'); }
function syncSoundBtn() {
  const b = document.getElementById('sound-btn'); if (b) b.innerHTML = ic(getSetting('sound', true) ? 'sound' : 'mute');
}

// ── Long-press helper (mobile admin access) ──
function onLongPress(el, ms, fn) {
  if (!el) return;
  let t = null;
  el.addEventListener('pointerdown', () => { t = setTimeout(fn, ms); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, () => clearTimeout(t)));
}
