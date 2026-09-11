// ══════════════════════════════════════════════════
// js/matchmaking.js — Level-based Quick Match (random opponents)
//
// No server needed: each level bracket has one well-known PeerJS "beacon" id.
//   • Whoever claims the beacon first hosts a hidden room and hands its code
//     to anyone who connects to the beacon.
//   • Everyone else connects to the beacon, gets the code and joins.
//   • A lonely host slowly widens the search to LOWER brackets only, so two
//     lonely hosts can never both abandon their rooms for each other.
//   • The match auto-starts 5s after a 2nd player arrives (instantly at 4).
// ══════════════════════════════════════════════════

const MM_BRACKETS = [
  { name:'Bronze',   color:'var(--bronze)', min:1,  diffs:['baby', 'easy'] },
  { name:'Silver',   color:'var(--silver)', min:5,  diffs:['easy', 'medium'] },
  { name:'Gold',     color:'var(--gold)', min:15, diffs:['medium', 'hard'] },
  { name:'Platinum', color:'var(--cyan)', min:30, diffs:['hard', 'expert'] },
  { name:'Diamond',  color:'var(--xp)', min:60, diffs:['hard', 'expert'] }
];
const MM_PREFIX    = 'mazzie-qm2-';
const MM_MAX       = 4;
const MM_START_SEC = 5;
let mm = null;

function bracketIcon(i) { return `<span class="tier-ic" style="color:${MM_BRACKETS[i].color}">${ic('tier')}</span>`; }
function bracketFor(lvl) { let b = 0; MM_BRACKETS.forEach((x, i) => { if (lvl >= x.min) b = i; }); return b; }
function bracketRange(i) {
  const b = MM_BRACKETS[i], n = MM_BRACKETS[i + 1];
  return 'LVL ' + b.min + (n ? '–' + (n.min - 1) : '+');
}
function setQStatus(t) { const el = document.getElementById('q-status'); if (el) el.innerText = t; }

function startQuickMatch() {
  if (typeof Peer === 'undefined') { pushToast('Quick Match needs an internet connection', 'warn'); return; }
  if (inBattleSession()) _destroyBattleSession();
  mmStop();
  mm = { bracket:bracketFor(myXpLevel()), t0:Date.now(), phase:'search', beacon:null,
         widened:0, probing:false, startAt:0, roomReady:false, attempts:0 };
  show('queue');
  renderQueue();
  mm.tickT = setInterval(mmTick, 400);
  mmSearch();
}

async function mmSearch() {
  const my = mm; if (!my) return;
  my.phase = 'search'; my.roomReady = false; my.startAt = 0;
  setQStatus('Looking for ' + MM_BRACKETS[my.bracket].name + ' players…');
  const code = await mmProbe(my.bracket);
  if (mm !== my) return;
  if (code) {
    my.phase = 'joining';
    setQStatus('Match found! Joining…');
    const ok = await joinRoom(code, { quick:true, statusEl:'q-status', timeout:6000 });
    if (mm !== my) return;
    if (ok) { my.phase = 'guest'; setQStatus('Waiting for the match to start…'); renderQueue(); return; }
  }
  mmClaim();
}

// Ask a bracket's beacon for its room code (null if nobody is hosting)
async function mmProbe(b) {
  let conn;
  try { conn = await connectTo(MM_PREFIX + b, 4000); } catch (e) { return null; }
  return new Promise(resolve => {
    const t = setTimeout(() => { try { conn.close(); } catch (e) {} resolve(null); }, 3500);
    conn.on('data', d => {
      if (!d || d.type !== 'mm_room' || !/^[A-Z]{4}$/.test(d.code)) return;
      clearTimeout(t);
      resolve(d.code); // resolve BEFORE close — PeerJS fires 'close' synchronously
      try { conn.close(); } catch (e) {}
    });
    conn.on('close', () => { clearTimeout(t); resolve(null); });
  });
}

// Become this bracket's host
function mmClaim() {
  const my = mm; if (!my) return;
  const bp = new Peer(MM_PREFIX + my.bracket, { debug:0 });
  let opened = false;
  bp.on('open', async () => {
    opened = true;
    if (mm !== my) { try { bp.destroy(); } catch (e) {} return; }
    my.beacon = bp; my.phase = 'host';
    setQStatus('Waiting for players…');
    try { await hostRoom({ quick:true }); }
    catch (e) { mmFail('Could not create a room'); return; }
    if (mm !== my) return;
    my.roomReady = true;
    renderQueue();
  });
  bp.on('connection', conn => {
    conn.on('open', () => {
      let tries = 0;
      const hand = () => {
        if (mm !== my || my.phase !== 'host' || battleActive) { try { conn.close(); } catch (e) {} return; }
        if (!my.roomReady) { if (++tries < 20) setTimeout(hand, 250); return; }
        conn.send({ type:'mm_room', code:roomCode, lvl:myXpLevel() });
        setTimeout(() => { try { conn.close(); } catch (e) {} }, 1500);
      };
      hand();
    });
  });
  bp.on('error', err => {
    if (opened) return;
    try { bp.destroy(); } catch (e) {}
    if (mm !== my) return;
    if (err.type === 'unavailable-id') {
      // Someone else is hosting this bracket (or the id is still being released) → try joining
      my.attempts++;
      if (my.attempts > 4) setQStatus('Busy queue — retrying…');
      setTimeout(() => { if (mm === my) mmSearch(); }, 300 + Math.random() * 900);
    } else mmFail('Matchmaking error: ' + err.type);
  });
}

function mmTick() {
  const my = mm; if (!my) return;
  const players = Object.keys(lobbyPlayers).length;
  if (my.phase === 'host' && my.roomReady && players <= 1 && !my.probing && !my.startAt) {
    const next = my.bracket - my.widened - 1;
    if (next >= 0 && Date.now() - my.t0 > 10000 + my.widened * 8000) { my.widened++; mmWiden(next); }
  }
  if (my.phase === 'host' && my.startAt && Date.now() >= my.startAt) mmStartMatch();
  renderQueue();
}

async function mmWiden(b) {
  const my = mm; my.probing = true;
  setQStatus('Expanding search to ' + MM_BRACKETS[b].name + '…');
  const code = await mmProbe(b);
  my.probing = false;
  if (mm !== my) return;
  if (!code || Object.keys(lobbyPlayers).length > 1 || my.phase !== 'host') { setQStatus('Waiting for players…'); return; }
  // Abandon my empty room and join theirs
  mmTearDownHost();
  my.phase = 'joining';
  const ok = await joinRoom(code, { quick:true, statusEl:'q-status', timeout:6000 });
  if (mm !== my) return;
  if (ok) { my.phase = 'guest'; setQStatus('Waiting for the match to start…'); }
  else mmSearch();
}

function mmTearDownHost() {
  if (mm && mm.beacon) { try { mm.beacon.destroy(); } catch (e) {} mm.beacon = null; }
  guestConns.forEach(c => { try { c.close(); } catch (e) {} });
  guestConns = []; connMap.clear();
  if (codePeer) { try { codePeer.destroy(); } catch (e) {} codePeer = null; }
  isHost = false; lobbyPlayers = {}; roomCode = '';
  if (mm) { mm.roomReady = false; mm.startAt = 0; }
}

// Called by renderLobby() whenever the room roster changes
function mmOnLobbyChanged() {
  const my = mm; if (!my) return;
  const n = Object.keys(lobbyPlayers).length;
  if (my.phase === 'host') {
    if (n >= MM_MAX) { mmStartMatch(); return; }
    if (n >= 2 && !my.startAt) { my.startAt = Date.now() + MM_START_SEC * 1000; sfx('pickup'); setQStatus('Opponent found!'); }
    if (n < 2 && my.startAt)   { my.startAt = 0; setQStatus('Waiting for players…'); }
  }
  renderQueue();
}

function mmStartMatch() {
  const my = mm; if (!my || my.phase !== 'host') return;
  if (Object.keys(lobbyPlayers).length < 2) { my.startAt = 0; return; }
  my.phase = 'playing';
  mmStop(true);
  battleDiffSetting = 'mm'; maxRounds = 3; abilitiesEnabled = true;
  hostStart();
}

// Difficulty for a quick-match round: random pick from the room's average bracket
function mmRoundDiff() {
  const lv = Object.values(lobbyPlayers).map(p => p.xpLevel || 1);
  const avg = lv.length ? Math.round(lv.reduce((a, b) => a + b, 0) / lv.length) : 1;
  const d = MM_BRACKETS[bracketFor(avg)].diffs;
  return d[Math.floor(Math.random() * d.length)];
}

// Joined room vanished / was full → search again
function mmRetry() {
  const my = mm; if (!my) return;
  if (hostConn) { const c = hostConn; hostConn = null; try { c.close(); } catch (e) {} }
  lobbyPlayers = {};
  setQStatus('Room closed — searching again…');
  setTimeout(() => { if (mm === my) mmSearch(); }, 500 + Math.random() * 500);
}

function mmFail(msg) { pushToast(msg, 'warn'); cancelQuickMatch(); }

// keepSession=true when the match is starting (room stays alive, beacon goes)
function mmStop(keepSession) {
  if (!mm) return;
  clearInterval(mm.tickT);
  if (mm.beacon) { try { mm.beacon.destroy(); } catch (e) {} }
  mm = null;
}

function cancelQuickMatch() {
  mmStop();
  if (inBattleSession()) _destroyBattleSession();
  show('menu');
}
function queueAgain() {
  if (inBattleSession()) _destroyBattleSession();
  startQuickMatch();
}

function renderQueue() {
  if (!mm) return;
  const b = MM_BRACKETS[mm.bracket];
  document.getElementById('q-bracket').innerHTML = `${bracketIcon(mm.bracket)}${b.name} <span>${bracketRange(mm.bracket)}</span>`;
  const secs = Math.floor((Date.now() - mm.t0) / 1000);
  document.getElementById('q-time').innerText = fmt(secs);
  const range = document.getElementById('q-range');
  const lowest = Math.max(0, mm.bracket - mm.widened);
  range.innerText = lowest < mm.bracket ? 'Searching ' + MM_BRACKETS[lowest].name + ' – ' + b.name : 'Searching ' + b.name;
  const list = document.getElementById('q-players');
  const pids = Object.keys(lobbyPlayers);
  const slots = [];
  for (let i = 0; i < MM_MAX; i++) {
    const pid = pids[i];
    if (pid) {
      const p = lobbyPlayers[pid];
      slots.push(`<div class="q-slot filled">${renderAvatar(p.avatar, p.name, 44)}<div class="q-slot-name">${escapeHtml(p.name)}${pid === myId ? ' (you)' : ''}</div><div class="q-slot-lvl">${getLevelBadge(p.xpLevel || 1)}</div></div>`);
    } else if (i === 0 && !pids.length) {
      slots.push(`<div class="q-slot filled">${renderAvatar(getMyAvatar(), myName, 44)}<div class="q-slot-name">${escapeHtml(myName)} (you)</div><div class="q-slot-lvl">${getLevelBadge(myXpLevel())}</div></div>`);
    } else {
      slots.push(`<div class="q-slot"><div class="q-slot-empty">${ic('search')}</div><div class="q-slot-name">Searching</div></div>`);
    }
  }
  list.innerHTML = slots.join('');
  const cd = document.getElementById('q-countdown');
  if (mm.startAt) { cd.style.display = ''; cd.innerText = 'Starting in ' + Math.max(0, Math.ceil((mm.startAt - Date.now()) / 1000)) + '…'; }
  else cd.style.display = 'none';
}
