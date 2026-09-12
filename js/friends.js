// ══════════════════════════════════════════════════
// js/friends.js — Friends (secure mode)
//   /friendReq/<to>/<from>  friend requests          /friends/<me>/<them>  your friends
//   /invites/<to>/<from>    "join my room" invites   /online/<acc>         presence (friends may read)
// Requests and invites stream live (EventSource); the friends list is fetched when needed
// (browsers only allow ~6 open connections per server). The database rules make sure only
// friends can invite you or see when you're online.
// ══════════════════════════════════════════════════

let _friends = {}, _reqIn = {}, _invites = {}, _presence = {}, _profiles = {};
let _rqES = null, _ivES = null, _presT = null, _frPollT = null, _seenInvites = new Set();
const friendsReady = () => authMode() === 'secure' && currentAccount && !currentAccount.offline && !currentAccount.local && _authUser;

// ── Live streams (started/stopped by live.js) ──
async function listenFriends() {
  stopFriends();
  if (!friendsReady()) return;
  const me = currentAccount.id;
  loadFriends();
  _frPollT = setInterval(loadFriends, 30000);
  if (isScreen('friends')) { refreshPresence(); _presT = setInterval(() => { if (isScreen('friends')) refreshPresence(); else clearInterval(_presT); }, 7000); }
  _rqES = streamNode(await streamUrl('/friendReq/' + me), v => {
    const prev = _reqIn;
    _reqIn = v && typeof v === 'object' ? v : {};
    Object.entries(_reqIn).forEach(([id, r]) => {
      if (prev[id] || !r) return;
      sfx('world');
      showAvatarMessage('Friend request', cleanName(r.name) + ' wants to be friends', cleanName(r.name), r.av, 5000);
      notifyUser('MAZZIE', cleanName(r.name) + ' wants to be friends', 'friendreq');
    });
    friendsChanged();
  }, () => { if (_liveOn) listenFriends(); });
  _ivES = streamNode(await streamUrl('/invites/' + me), v => {
    _invites = v && typeof v === 'object' ? v : {};
    Object.entries(_invites).forEach(([id, inv]) => {
      if (!inv || _seenInvites.has(id + inv.at)) return;
      _seenInvites.add(id + inv.at);
      if (typeof inv.at === 'number' && Date.now() - inv.at > 5 * 60000) return;   // stale
      showInvite(id, inv);
    });
    friendsChanged();
  }, () => { if (_liveOn) listenFriends(); });
}
function stopFriends() {
  [_rqES, _ivES].forEach(es => esKill(es));
  _rqES = _ivES = null;
  clearInterval(_presT); clearInterval(_frPollT);
}
// Friends list (fetched when needed; it changes rarely)
async function loadFriends() {
  if (!friendsReady()) return;
  let v; try { v = await dbGet('/friends/' + currentAccount.id); } catch (e) { return; }
  _friends = v && typeof v === 'object' ? v : {};
  // A request I sent was accepted → it's now a friend
  const out = loadSave().friendOut || {};
  let changed = false;
  Object.keys(out).forEach(id => { if (_friends[id]) { delete out[id]; changed = true; pushToast(cleanName(_friends[id].name) + ' accepted your friend request', 'acc', 'users'); } });
  if (changed) writeSave({ friendOut: out });
  friendsChanged();
}
function friendsChanged() {
  const n = Object.keys(_reqIn).length + Object.keys(_invites).length;
  const b = document.getElementById('friends-badge');
  if (b) { b.textContent = n; b.hidden = !n; }
  if (isScreen('friends')) renderFriends();
}

// ── Presence ──
let _presTick = 0;
async function refreshPresence(full) {
  await loadFriends();
  const ids = Object.keys(_friends);
  // Presence every pass (it changes the most); looks and levels every other pass, so a
  // long friends list does not mean a burst of requests every few seconds
  const looks = full || _presTick++ % 2 === 0;
  await Promise.all(ids.map(async id => {
    try { _presence[id] = await dbGet('/online/' + id); } catch (e) { _presence[id] = null; }
    if (!looks) return;
    try { const p = await dbGet('/profiles/' + id); if (p) _profiles[id] = p; } catch (e) {}
  }));
  if (isScreen('friends')) renderFriends();
}
function friendStatus(id) {
  const p = _presence[id];
  if (!p || typeof p.at !== 'number' || Date.now() - p.at > 120000) return { on: false, text: 'Offline' };
  const where = p.where === 'battle' || p.where === 'game' ? 'Playing' : p.where === 'lobby' ? (p.room ? 'In a room' : 'In a room') : 'Online';
  return { on: true, text: where, room: p.room && /^[A-Z]{4}$/.test(p.room) ? p.room : '', lvl: p.lvl, name: p.name };
}

// ══════════════════════════════════════════════════
// SCREEN
// ══════════════════════════════════════════════════
function openFriends() {
  show('friends');
  document.getElementById('friend-add-err').innerText = '';
  renderFriends();
  if (!friendsReady()) return;
  refreshPresence(true);
  clearInterval(_presT); _presT = setInterval(() => { if (isScreen('friends')) refreshPresence(); else clearInterval(_presT); }, 7000);
}
// Back to the room (fully set up: host gets Start + settings) or the menu
function closeFriends() {
  if (!inBattleSession()) return show('menu');
  if (isHost) showLobbyAsHost(); else showLobbyAsGuest();
}

function renderFriends() {
  const box = document.getElementById('friends-body'); if (!box) return;
  if (!friendsReady()) {
    box.innerHTML = `<div class="search-empty">${ic('users')}Friends need you to be signed in online.</div>`;
    return;
  }
  const out = loadSave().friendOut || {};
  const reqs = Object.entries(_reqIn), invs = Object.entries(_invites);
  const rankOf = id => rankChip(getRank((_profiles[id] || {}).cleared || 0), 'tiny');
  const list = Object.entries(_friends).map(([id, f]) => ({ id, f: { ...f, ...(_profiles[id] ? { name: _profiles[id].name || f.name, av: _profiles[id].av || f.av } : {}) }, st: friendStatus(id) }))
    .sort((a, b) => b.st.on - a.st.on || String(a.f.name).localeCompare(String(b.f.name)));
  const row = (id, name, av, right, sub, cls) => `<div class="friend-row${cls ? ' ' + cls : ''}">
      <button class="fr-ava" onclick="openProfile('${id}')" title="View profile">${renderAvatar(sanitizeAvatar(av || {}), name, 40)}</button>
      <button class="fr-txt" onclick="openProfile('${id}')" title="View profile"><b>${escapeHtml(name)}</b><small>${sub}</small></button>
      <div class="fr-btns">${right}</div></div>`;
  let h = '';
  if (invs.length) {
    h += `<div class="set-group-lbl">Invites</div><div class="fr-group">` + invs.map(([id, v]) => row(id, cleanName(v.name), v.av,
      `<button class="btn primary sm" onclick="acceptInvite('${id}')">${ic('login')}Join</button><button class="icon-btn sm" onclick="dismissInvite('${id}')">${ic('x')}</button>`,
      'Invited you to room ' + escapeHtml(v.room || ''))).join('') + `</div>`;
  }
  if (reqs.length) {
    h += `<div class="set-group-lbl">Friend requests</div><div class="fr-group">` + reqs.map(([id, r]) => row(id, cleanName(r.name), r.av,
      `<button class="btn primary sm" onclick="acceptFriend('${id}')">${ic('check')}Accept</button><button class="icon-btn sm" onclick="declineFriend('${id}')">${ic('x')}</button>`,
      'Wants to be friends')).join('') + `</div>`;
  }
  const onlineN = list.filter(x => x.st.on).length;
  h += `<div class="set-group-lbl">Friends · ${onlineN} online</div>`;
  if (!list.length && !Object.keys(out).length) h += `<div class="search-empty">${ic('users')}No friends yet — add someone by their username above.</div>`;
  h += `<div class="fr-group">` + list.map(({ id, f, st }) => {
    const name = cleanName(st.name || f.name);
    const joinBtn = st.room && st.room !== roomCode ? `<button class="icon-btn sm join" onclick="joinFriendRoom('${st.room}')" title="Join their room">${ic('login')}</button>` : '';
    const inviteBtn = `<button class="btn primary sm" onclick="inviteFriend('${id}')" title="Invite to your room">${ic('swords')}Invite</button>`;
    return row(id, name, f.av,
      joinBtn + inviteBtn + `<button class="icon-btn sm" onclick="openProfile('${id}')" title="View profile">${ic('user')}</button><button class="icon-btn sm" onclick="giftFriend('${escapeHtml(name)}')" title="Send a gift">${ic('gift')}</button>`
        + `<button class="icon-btn sm ghost-x" onclick="removeFriend('${id}','${escapeHtml(name)}')" title="Remove">${ic('x')}</button>`,
      rankOf(id) + `<i class="dot${st.on ? ' on' : ''}"></i>${st.text}${st.on && st.lvl ? ' · LVL ' + st.lvl : ''}`, st.on ? 'online' : '');
  }).join('')
    + Object.entries(out).filter(([id]) => !_friends[id]).map(([id, name]) => row(id, name, null,
      `<button class="icon-btn sm ghost-x" onclick="cancelRequest('${id}')" title="Cancel">${ic('x')}</button>`, 'Request sent · waiting', 'pending')).join('')
    + `</div>`;
  box.innerHTML = h;
}

// ── Actions ──
async function sendFriendRequest() {
  const inp = document.getElementById('friend-add'), err = document.getElementById('friend-add-err');
  const name = inp.value.trim(); err.innerText = '';
  if (!friendsReady()) return (err.innerText = 'Sign in online to add friends.');
  if (!name) return;
  let to = null;
  try {
    await loadFriends();                                           // make sure the friends list is fresh
    const u = await dbGet('/usernames/' + nameKey(name));
    to = u && (u.acc || u.uid);
    if (!to) return (err.innerText = 'No player called "' + name + '".');
    if (to === currentAccount.id) return (err.innerText = "That's you!");
    if (_friends[to]) return (err.innerText = 'You are already friends.');
    if (_reqIn[to]) return acceptFriend(to);                       // they already asked you
    // Already sent one? (you can read your own outgoing request)
    let pending = null;
    try { pending = await dbGet('/friendReq/' + to + '/' + currentAccount.id); } catch (e) { if (e.message === 'DENIED') return (err.innerText = 'The server refused — the database rules need publishing (admin: run "doctor").'); }
    if (pending) { writeSave({ friendOut: { ...(loadSave().friendOut || {}), [to]: cleanName(name) } }); renderFriends(); return (err.innerText = 'Request already sent — waiting for ' + cleanName(name) + '.'); }
    await dbPut('/friendReq/' + to + '/' + currentAccount.id, { name: cleanName(myName), at: SERVER_TIME, av: getMyAvatar() });
    writeSave({ friendOut: { ...(loadSave().friendOut || {}), [to]: cleanName(name) } });
    inp.value = ''; sfx('coin');
    pushToast('Friend request sent to ' + cleanName(name), 'acc', 'users');
    renderFriends();
  } catch (e) {
    err.innerText = e.message === 'DENIED'
      ? (to && _friends[to] ? 'You are already friends.' : 'The server refused the request — the database rules may need publishing (admin: run "doctor").')
      : 'Could not reach the server — check your internet.';
  }
}
async function acceptFriend(id) {
  const r = _reqIn[id]; if (!r) return;
  const me = currentAccount.id;
  try {
    await dbPatch('/', {
      ['friends/' + me + '/' + id]: { name: cleanName(r.name), at: SERVER_TIME, av: r.av || null },
      ['friends/' + id + '/' + me]: { name: myName, at: SERVER_TIME, av: getMyAvatar() },
      ['friendReq/' + me + '/' + id]: null
    });
    sfx('reward'); pushToast('You and ' + cleanName(r.name) + ' are now friends', 'acc', 'users');
    delete _reqIn[id];
    refreshPresence();
  } catch (e) { pushToast('Could not accept — try again', 'warn'); }
}
function declineFriend(id) { dbDelete('/friendReq/' + currentAccount.id + '/' + id).catch(() => {}); delete _reqIn[id]; friendsChanged(); }
function cancelRequest(id) {
  dbDelete('/friendReq/' + id + '/' + currentAccount.id).catch(() => {});
  const out = loadSave().friendOut || {}; delete out[id]; writeSave({ friendOut: out }); renderFriends();
}
async function removeFriend(id, name) {
  if (!confirm('Remove ' + name + ' from your friends?')) return;
  const me = currentAccount.id;
  try { await dbPatch('/', { ['friends/' + me + '/' + id]: null, ['friends/' + id + '/' + me]: null }); delete _friends[id]; friendsChanged(); }
  catch (e) { pushToast('Could not remove — try again', 'warn'); }
}
function giftFriend(name) {
  if (authMode() !== 'secure' || !currentAccount || currentAccount.offline) { pushToast('Gifting needs you signed in online', 'warn', 'gift'); return; }
  openStore();
  setTimeout(() => openGiftForm('basic', name), 60);   // after the Store screen has painted
}

// ── Invites: one tap makes a room (if needed) and invites them ──
async function inviteFriend(id) {
  if (battleActive) { pushToast('Finish the match first', 'warn'); return; }
  try {
    if (!inBattleSession()) {
      showConnecting('CREATING ROOM…');
      await hostRoom();
      hideConnecting();
      // Set the lobby up as host right away (Start button, settings, room code), then stay here
      const back = isScreen('friends');
      showLobbyAsHost();
      if (back) { show('friends'); renderFriends(); }
    }
    await dbPut('/invites/' + id + '/' + currentAccount.id, { name: myName, room: roomCode, at: SERVER_TIME, av: getMyAvatar() });
    sfx('coin'); pushToast('Invite sent to ' + cleanName((_friends[id] || {}).name || 'friend'), 'acc', 'send');
    if (isScreen('friends')) renderFriends();
    if (!isScreen('lobby') && !isScreen('friends')) showLobbyAsHost();
  } catch (e) {
    hideConnecting();
    pushToast(e && e.message === 'DENIED' ? 'Only friends can be invited' : 'Could not create the room — check your internet', 'warn');
  }
}
async function acceptInvite(id) {
  const inv = _invites[id]; hideInvite();
  if (!inv || !/^[A-Z]{4}$/.test(inv.room || '')) return;
  dbDelete('/invites/' + currentAccount.id + '/' + id).catch(() => {});
  joinFriendRoom(inv.room);
}
function joinFriendRoom(code) {
  if (battleActive) { pushToast('Finish your match first', 'warn'); return; }
  if (inBattleSession()) _destroyBattleSession();
  show('join-screen');
  const inp = document.getElementById('join-input'); if (inp) inp.value = code;
  joinRoom(code);
}
function dismissInvite(id) {
  hideInvite();
  dbDelete('/invites/' + currentAccount.id + '/' + id).catch(() => {});
  delete _invites[id]; friendsChanged();
}

// ── Invite pop-up (with buttons) ──
function showInvite(id, inv) {
  const el = document.getElementById('invite-pop'); if (!el) return;
  sfx('world'); buzz([30, 40, 30]);
  const who = cleanName(inv.name);
  pushToast(who + ' invited you to a room', 'acc', 'swords');
  notifyUser('MAZZIE', who + ' invited you to play' + (inv.room ? ' (room ' + inv.room + ')' : ''), 'invite');
  el.innerHTML = `<div class="ip-ava">${renderAvatar(sanitizeAvatar(inv.av || {}), cleanName(inv.name), 46)}</div>
    <div class="ip-txt"><small>Room invite</small><b>${escapeHtml(cleanName(inv.name))} wants to play!</b></div>
    <div class="ip-btns"><button class="btn primary sm" onclick="acceptInvite('${id}')">${ic('login')}Join</button>
      <button class="icon-btn sm" onclick="dismissInvite('${id}')">${ic('x')}</button></div>`;
  el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  clearTimeout(el._t); el._t = setTimeout(hideInvite, 20000);
}
function hideInvite() { const el = document.getElementById('invite-pop'); if (el) el.hidden = true; }

// ══════════════════════════════════════════════════
// PROFILE VIEWER (friends list + room lobby)
// ══════════════════════════════════════════════════
let _profT = null;
async function openProfile(id, hint, quiet) {
  if (!id) return;
  hint = hint || {};
  let p = null;
  if (friendsReady()) { try { p = await dbGet('/profiles/' + id); if (p) _profiles[id] = p; } catch (e) {} }
  if (quiet && document.getElementById('profile-pop').hidden) return;      // closed while loading
  const f = _friends[id] || {};
  const name = cleanName((p && p.name) || hint.name || f.name || 'Player');
  const av = sanitizeAvatar((p && p.av) || hint.avatar || f.av || {});
  const lvl = p && typeof p.xp === 'number' ? getXpLevel(p.xp) : (hint.xpLevel || 1);
  const cleared = p && typeof p.cleared === 'number' ? p.cleared : null;
  const rank = cleared != null ? getRank(cleared) : { name: hint.rankName || 'Player', icon: 'seed', color: 'var(--txt2)' };
  const st = _friends[id] ? friendStatus(id) : null;
  const trail = _find(TRAILS, av.trail) || TRAILS[0];
  const isMe = currentAccount && id === currentAccount.id;
  const canAct = friendsReady() && !isMe;
  const btns = !canAct ? '' : _friends[id]
    ? `<button class="btn primary" onclick="closeProfile();inviteFriend('${id}')">${ic('swords')}Invite</button>
       <button class="btn secondary" onclick="closeProfile();giftFriend('${escapeHtml(name)}')">${ic('gift')}Gift</button>`
    : _reqIn[id] ? `<button class="btn primary" onclick="closeProfile();acceptFriend('${id}')">${ic('check')}Accept request</button>`
    : (loadSave().friendOut || {})[id] ? `<button class="btn secondary" disabled>${ic('users')}Request sent</button>`
    : `<button class="btn primary" onclick="addFriendById('${id}','${escapeHtml(name)}')">${ic('plus')}Add friend</button>`;
  const el = document.getElementById('profile-pop');
  el.innerHTML = `<div class="profile-card-pop">
    <button class="icon-btn sheet-x" onclick="closeProfile()">${ic('x')}</button>
    <div class="pp-ava">${renderAvatar(av, name, 96)}</div>
    <div class="pp-name">${escapeHtml(name)}</div>
    ${titleHtml(av) ? `<div class="pp-title fit" data-max="16" data-min="9">${titleHtml(av)}</div>` : ''}
    ${st ? `<div class="pp-status"><i class="dot${st.on ? ' on' : ''}"></i>${st.text}</div>` : ''}
    <div class="pp-stats">
      <div><b>${getLevelBadge(lvl)} ${lvl}</b><small>Level</small></div>
      <div><b>${rankIcon(rank)} ${escapeHtml(rank.name)}</b><small>Rank</small></div>
      <div><b>${cleared != null ? cleared.toLocaleString() : '—'}</b><small>Cleared</small></div>
    </div>
    <div class="pp-trail">${trailPreviewSvg(trail)}<small>${escapeHtml(trail.name)} trail</small></div>
    ${btns ? `<div class="pp-btns">${btns}</div>` : ''}
  </div>`;
  el.hidden = false;
  fitText(el);
  if (!quiet) {
    sfx('tap');
    clearInterval(_profT);
    _profT = setInterval(() => { if (document.getElementById('profile-pop').hidden) clearInterval(_profT); else openProfile(id, hint, true); }, 3000);
  }
}
function closeProfile() { const el = document.getElementById('profile-pop'); if (el) el.hidden = true; clearInterval(_profT); }
async function addFriendById(id, name) {
  try {
    await loadFriends();
    if (_friends[id]) { pushToast('You are already friends', 'info', 'users'); return; }
    await dbPut('/friendReq/' + id + '/' + currentAccount.id, { name: cleanName(myName), at: SERVER_TIME, av: getMyAvatar() });
    writeSave({ friendOut: { ...(loadSave().friendOut || {}), [id]: cleanName(name) } });
    sfx('coin'); pushToast('Friend request sent to ' + cleanName(name), 'acc', 'users');
    closeProfile();
  } catch (e) { pushToast(e.message === 'DENIED' ? 'Request already sent (or rules need publishing)' : 'Could not reach the server', 'warn'); }
}
document.addEventListener('pointerdown', e => {
  const el = document.getElementById('profile-pop');
  if (el && !el.hidden && e.target === el) closeProfile();
});
