// ══════════════════════════════════════════════════
// js/friends.js — Friends (secure mode)
//   /friendReq/<to>/<from>  friend requests          /friends/<me>/<them>  your friends
//   /invites/<to>/<from>    "join my room" invites   /online/<acc>         presence (friends may read)
// Requests and invites stream live (EventSource); the friends list is fetched when needed
// (browsers only allow ~6 open connections per server). The database rules make sure only
// friends can invite you or see when you're online.
// ══════════════════════════════════════════════════

let _friends = {}, _reqIn = {}, _invites = {}, _presence = {};
let _rqES = null, _ivES = null, _presT = null, _frPollT = null, _seenInvites = new Set();
const friendsReady = () => authMode() === 'secure' && currentAccount && !currentAccount.offline && !currentAccount.local && _authUser;

// ── Live streams (started/stopped by live.js) ──
async function listenFriends() {
  stopFriends();
  if (!friendsReady()) return;
  const me = currentAccount.id;
  loadFriends();
  _frPollT = setInterval(loadFriends, 60000);
  _rqES = streamNode(await streamUrl('/friendReq/' + me), v => {
    const prev = _reqIn;
    _reqIn = v && typeof v === 'object' ? v : {};
    Object.entries(_reqIn).forEach(([id, r]) => {
      if (prev[id] || !r) return;
      sfx('world');
      showAvatarMessage('Friend request', cleanName(r.name) + ' wants to be friends', cleanName(r.name), r.av, 5000);
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
  [_rqES, _ivES].forEach(es => { if (es) es.close(); });
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
async function refreshPresence() {
  await loadFriends();
  const ids = Object.keys(_friends);
  await Promise.all(ids.map(async id => { try { _presence[id] = await dbGet('/online/' + id); } catch (e) { _presence[id] = null; } }));
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
  refreshPresence();
  clearInterval(_presT); _presT = setInterval(() => { if (isScreen('friends')) refreshPresence(); else clearInterval(_presT); }, 20000);
}
function closeFriends() { show(inBattleSession() ? 'lobby' : 'menu'); }

function renderFriends() {
  const box = document.getElementById('friends-body'); if (!box) return;
  if (!friendsReady()) {
    box.innerHTML = `<div class="search-empty">${ic('users')}Friends need you to be signed in online.</div>`;
    return;
  }
  const out = loadSave().friendOut || {};
  const reqs = Object.entries(_reqIn), invs = Object.entries(_invites);
  const list = Object.entries(_friends).map(([id, f]) => ({ id, f, st: friendStatus(id) }))
    .sort((a, b) => b.st.on - a.st.on || String(a.f.name).localeCompare(String(b.f.name)));
  const row = (id, name, av, right, sub, cls) => `<div class="friend-row${cls ? ' ' + cls : ''}">
      <div class="fr-ava">${renderAvatar(sanitizeAvatar(av || {}), name, 40)}</div>
      <div class="fr-txt"><b>${escapeHtml(name)}</b><small>${sub}</small></div>
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
      joinBtn + inviteBtn + `<button class="icon-btn sm" onclick="giftFriend('${escapeHtml(name)}')" title="Send a gift">${ic('gift')}</button>`
        + `<button class="icon-btn sm ghost-x" onclick="removeFriend('${id}','${escapeHtml(name)}')" title="Remove">${ic('x')}</button>`,
      `<i class="dot${st.on ? ' on' : ''}"></i>${st.text}${st.on && st.lvl ? ' · LVL ' + st.lvl : ''}`, st.on ? 'online' : '');
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
  try {
    const u = await dbGet('/usernames/' + nameKey(name));
    const to = u && (u.acc || u.uid);
    if (!to) return (err.innerText = 'No player called "' + name + '".');
    if (to === currentAccount.id) return (err.innerText = "That's you!");
    if (_friends[to]) return (err.innerText = 'You are already friends.');
    if (_reqIn[to]) return acceptFriend(to);                       // they already asked you
    await dbPut('/friendReq/' + to + '/' + currentAccount.id, { name: myName, at: SERVER_TIME, av: getMyAvatar() });
    writeSave({ friendOut: { ...(loadSave().friendOut || {}), [to]: cleanName(name) } });
    inp.value = ''; sfx('coin');
    pushToast('Friend request sent to ' + cleanName(name), 'acc', 'users');
    renderFriends();
  } catch (e) { err.innerText = e.message === 'DENIED' ? 'Could not send (already sent?)' : 'Could not reach the server.'; }
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
function giftFriend(name) { openStore(); openGiftForm('basic', name); }

// ── Invites: one tap makes a room (if needed) and invites them ──
async function inviteFriend(id) {
  if (battleActive) { pushToast('Finish the match first', 'warn'); return; }
  try {
    if (!inBattleSession()) {
      showConnecting('CREATING ROOM…');
      await hostRoom();
      hideConnecting();
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
  el.innerHTML = `<div class="ip-ava">${renderAvatar(sanitizeAvatar(inv.av || {}), cleanName(inv.name), 46)}</div>
    <div class="ip-txt"><small>Room invite</small><b>${escapeHtml(cleanName(inv.name))} wants to play!</b></div>
    <div class="ip-btns"><button class="btn primary sm" onclick="acceptInvite('${id}')">${ic('login')}Join</button>
      <button class="icon-btn sm" onclick="dismissInvite('${id}')">${ic('x')}</button></div>`;
  el.hidden = false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  clearTimeout(el._t); el._t = setTimeout(hideInvite, 20000);
}
function hideInvite() { const el = document.getElementById('invite-pop'); if (el) el.hidden = true; }
