// ══════════════════════════════════════════════════
// js/terminal.js — Admin terminal
//   • Tab completion (cycles with Tab / Shift+Tab, longest-common-prefix first)
//   • Inline ghost suggestion (→ or Tab accepts) + tappable suggestion chips
//   • Command history (↑/↓, persisted), Ctrl+L clear, Ctrl+C cancel, Esc close
//   • Player-name completion with automatic quoting ("Racer 42")
// Admins (Google sign-in with an email listed in config.js adminEmails AND in the
// database /admins list) open it from the Admin button in the menu or Settings,
// with F2 / ` on a keyboard, or by long-pressing the MAZZIE logo or the timer.
// ══════════════════════════════════════════════════

const TERM_HIST_KEY = 'mazzie_term_hist';
let termHist = (() => { try { return JSON.parse(localStorage.getItem(TERM_HIST_KEY) || '[]'); } catch (e) { return []; } })();
let termHistIdx = -1, termDraft = '', termBooted = false, tabState = null;
let accountCache = [];   // admin: last fetched account list (for completion)
let onlineCache  = [];   // admin: last "online" result (for troll completion)

function adminOpen()  { if (isAdminUser()) openTerminal(); }
function adminClose() {
  document.getElementById('admin-term').classList.add('adm-hidden');
  document.getElementById('term-input').blur();
}
function termIsOpen() { return !document.getElementById('admin-term').classList.contains('adm-hidden'); }

function openTerminal() {
  document.getElementById('admin-term').classList.remove('adm-hidden');
  document.getElementById('term-mode').innerText = termMode();
  if (!termBooted) {
    termBooted = true;
    termPrint('┌─ MAZZIE admin shell ─────────────────────', 'acc');
    termPrint('│ Tab completes · → accepts ghost · ↑↓ history', 'dim');
    termPrint('│ type "help" to list commands, Esc to close', 'dim');
    termPrint('└──────────────────────────────────────────', 'acc');
  }
  if (!matchMedia('(pointer:coarse)').matches) setTimeout(() => document.getElementById('term-input').focus(), 30);
  termUpdateAssist();
  if (authMode() === 'secure') refreshAccountCache(true);
}
function termMode() {
  if (battleActive) return isHost ? 'BATTLE·HOST' : 'BATTLE·GUEST';
  if (isScreen('queue')) return 'QUEUE';
  if (inBattleSession()) return isHost ? 'LOBBY·HOST' : 'LOBBY·GUEST';
  return dailyMode ? 'DAILY' : 'SOLO';
}

// ── Output ──
function termPrint(text, cls) {
  const out = document.getElementById('term-out'); if (!out) return;
  String(text).split('\n').forEach(line => {
    const d = document.createElement('div');
    d.className = 'term-ln' + (cls ? ' ' + cls : '');
    d.textContent = line;
    out.appendChild(d);
  });
  while (out.childElementCount > 500) out.firstChild.remove();
  out.scrollTop = out.scrollHeight;
}
const tOk   = t => termPrint(t, 'ok');
const tWarn = t => termPrint(t, 'warn');
const tErr  = t => termPrint(t, 'err');
const tInfo = t => termPrint(t, 'info');
function adminLog(type, msg) {
  const ts = new Date().toTimeString().slice(0, 8);
  termPrint('[' + ts + '] ' + msg, type === 'ok' ? 'ok' : type === 'warn' ? 'warn' : 'dim');
}
function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

// ── Arg helpers ──
const H = (hint, vals, rest) => ({ hint, vals, rest });
const playerNames = () => Object.values(lobbyPlayers).map(p => p.name);
const playerArg   = (extra) => H('<player>', () => [...(extra || []), 'me', ...playerNames()]);
const NUM = h => H(h || '<n>');

function resolvePlayer(tok) {
  if (!tok) return null;
  const t = tok.toLowerCase();
  if (t === 'me' || t === 'self') return myId;
  const entries = Object.entries(lobbyPlayers);
  let hit = entries.find(([, p]) => p.name.toLowerCase() === t);
  if (!hit) hit = entries.find(([pid]) => pid.toLowerCase() === t || ('#' + pid.slice(-6)).toLowerCase() === t);
  if (!hit) { const pre = entries.filter(([, p]) => p.name.toLowerCase().startsWith(t)); if (pre.length === 1) hit = pre[0]; }
  return hit ? hit[0] : null;
}
function needInt(v, name) { const n = parseInt(v); if (isNaN(n)) throw new Error((name || 'value') + ' must be a number'); return n; }
function needHost()   { if (!isHost) throw new Error('only the room host can do that'); }
function needBattle() { if (!battleActive) throw new Error('no battle in progress'); }
function needSoloBoard() {
  if (battleActive) throw new Error('not available during a battle');
  if (!inGame() || !cells.length) { startGame(currentDiff || 'easy'); return false; }
  return true;
}
function pname(pid) { return (lobbyPlayers[pid] && lobbyPlayers[pid].name) || pid; }

// ══════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════
const CMDS = {
  help: { desc:'List commands, or details for one', args:[H('[command]', () => Object.keys(CMDS))],
    run(a) {
      if (a[0] && CMDS[a[0]]) {
        const c = CMDS[a[0]];
        tInfo(a[0] + ' — ' + c.desc);
        if (c.sub) Object.entries(c.sub).forEach(([k, s]) => termPrint('  ' + pad(a[0] + ' ' + k + ' ' + (s.args || []).map(x => x.hint).join(' '), 34) + (s.desc || ''), 'dim'));
        else termPrint('  usage: ' + a[0] + ' ' + (c.args || []).map(x => x.hint).join(' '), 'dim');
        return;
      }
      tInfo('Commands (Tab to complete):');
      Object.entries(CMDS).forEach(([k, c]) => termPrint('  ' + pad(k, 10) + c.desc, 'dim'));
    } },
  clear:   { desc:'Clear the screen (Ctrl+L)', run() { document.getElementById('term-out').innerHTML = ''; } },
  exit:    { desc:'Close the terminal (Esc)', run() { adminClose(); } },
  history: { desc:'Show command history', run() { termHist.slice(-20).forEach((h, i, arr) => termPrint(pad(termHist.length - arr.length + i + 1, 4) + h, 'dim')); } },
  echo:    { desc:'Print text', args:[H('<text>', null, true)], run(a) { termPrint(a.join(' ')); } },

  status: { desc:'Game status snapshot', run() {
    tInfo('mode     ' + termMode());
    tInfo('screen   ' + ([...document.querySelectorAll('.screen')].find(s => !s.classList.contains('hidden')) || {}).id);
    if (cells.length) {
      tInfo('board    ' + (currentDiff || '-') + ' · P' + level + ' · ' + rows + '×' + cols + ' · ' + totalNodes + ' nodes');
      tInfo('path     ' + pathIndices.length + '/' + solvableCount + ' cells · next node ' + (curHigh + 1));
      tInfo('timer    ' + fmtMs(timerMs) + (timerFrozen ? ' (frozen)' : ''));
      tInfo('seed     ' + (battleActive ? battleSeed + ' r' + battleRound : initialSeed));
    }
    tInfo('boosts   ' + (boostsActive() ? '[' + abilityInv.join(', ') + ']' : 'off'));
    if (inBattleSession()) tInfo('room     ' + (roomCode || '?') + ' · ' + Object.keys(lobbyPlayers).length + ' players · round ' + battleRound + '/' + maxRounds);
    tInfo('xp       LVL ' + myXpLevel() + ' · ' + (loadSave().xp || 0) + ' xp · ' + (loadSave().totalCleared || 0) + ' cleared');
  } },
  whoami: { desc:'Your account, sign-in and admin status', run() {
    const id = (currentAccount && currentAccount.id) || myId;
    tInfo(myName + '  account=' + id + '  admin=' + isAdminUser());
    if (_authUser) tInfo('signed in as ' + (_authUser.email || _authUser.uid) + (_authUser.emailVerified ? ' (verified)' : ''));
    tInfo('auth mode: ' + authMode());
  } },

  doctor: { desc:'Check why admin tools might be refused', async run() {
    const mode = authMode();
    tInfo('auth mode      ' + mode);
    if (mode !== 'secure') return tWarn('admin tools need secure mode (firebaseConfig.apiKey in config.js)');
    const u = _authUser;
    if (!u) return tErr('not signed in');
    const google = hasProvider(u, 'google.com');
    tInfo('signed in as   ' + (u.email || '(no email)') + (u.emailVerified ? ' · verified' : ' · NOT verified'));
    if (!google) tWarn('this account is not linked to Google — Settings → Google account → Link, using ' + ((CFG().adminEmails || [])[0] || 'your admin email'));
    tInfo('config admin   ' + (isAdminUser() ? 'yes (email is in config.js adminEmails)' : 'NO — email not in config.js adminEmails'));
    const key = String(u.email || '').toLowerCase().split('.').join(',');
    let dbAdmin = false;
    try { await dbGet('/admins'); dbAdmin = true; tOk('database admin yes'); }
    catch (e) {
      tErr('database admin NO — the database does not list you as an admin');
      termPrint('  fix: Firebase console → Realtime Database → Data → add child "admins"', 'dim');
      termPrint('       inside it add   ' + key + ' : true   (dots become commas)', 'dim');
    }
    if (!dbAdmin) return;
    const checks = [['/online', 'online list'], ['/broadcast', 'world messages'], ['/gifts/' + currentAccount.id, 'gift inbox']];
    let stale = false;
    for (const [p, what] of checks) {
      try { await dbGet(p); tOk('rules: ' + pad(what, 14) + 'ok'); }
      catch (e) { stale = true; tErr('rules: ' + pad(what, 14) + 'refused'); }
    }
    if (stale) {
      tWarn('your published database rules are out of date');
      termPrint('  fix: Firebase console → Realtime Database → Rules → paste database.rules.json from GitHub → Publish', 'dim');
    } else tOk('all good — trolls, broadcasts and gifts should work');
  } },
  broadcast: { desc:'Message EVERY online player', args:[H('<message…>', null, true)], async run(a) {
    needSecure(); const msg = a.join(' ').trim(); if (!msg) throw new Error('what should everyone see?');
    await adminBroadcast(msg); tOk('sent to everyone: ' + msg);
  } },
  online: { desc:'Who is playing right now', async run() {
    needSecure(); const list = await adminOnline();
    if (!list.length) return tInfo('nobody online in the last 2 minutes');
    termPrint(pad('NAME', 17) + pad('LVL', 6) + 'WHERE', 'dim');
    list.forEach(o => termPrint(pad(o.name, 17) + pad(o.lvl || '?', 6) + (o.where || '')));
    tInfo(list.length + ' online');
    onlineCache = list;
  } },
  troll: { desc:'Prank a player (or "all" online)', args:[H('<player|all>', () => ['all', ...new Set([...onlineCache.map(o => o.name), ...accountNames()])]), H('<effect>', () => Object.keys(TROLLS)), H('[text|number]', null, true)], async run(a) {
    needSecure();
    const kind = (a[1] || '').toLowerCase();
    if (!TROLLS[kind]) { tWarn('effects:'); Object.entries(TROLLS).forEach(([k, v]) => termPrint('  ' + pad(k, 11) + v.desc, 'dim')); return; }
    const extra = TROLLS[kind].text ? { text: a.slice(2).join(' ').slice(0, 160) } : TROLLS[kind].value ? { value: parseInt(a[2]) || 0 } : {};
    if (TROLLS[kind].text && !extra.text) throw new Error('add a message: troll <player> msg hello there');
    let targets;
    if ((a[0] || '').toLowerCase() === 'all') targets = (await adminOnline()).filter(o => o.id !== currentAccount.id);
    else { const hit = onlineCache.find(o => o.name.toLowerCase() === (a[0] || '').toLowerCase()); targets = [hit || await findAccount(a[0])]; }
    if (!targets.length) return tWarn('nobody to troll');
    await Promise.all(targets.map(x => adminTroll(x.id, kind, extra)));
    tOk(kind + ' → ' + targets.map(x => x.name).join(', ') + (targets.length === 1 && !onlineCache.some(o => o.id === targets[0].id) ? '  (fires if they are online in the next 3 min)' : ''));
  } },
  coins: { desc:'Your coins (admin)', sub:{
    add: { args:[NUM('<amount>')], desc:'Add coins to yourself', run(a) { addCoins(needInt(a[0], 'amount')); updateMenuProfile(); syncAccountToCloud(); tOk('coins = ' + getCoins()); } },
    set: { args:[NUM('<amount>')], desc:'Set your coins', run(a) { writeSave({ coins: Math.max(0, needInt(a[0], 'amount')) }); updateCoinUI(); syncAccountToCloud(); tOk('coins = ' + getCoins()); } }
  } },
  accounts: { desc:'List every account (admin)', args:[H('[search]')], async run(a) {
    needSecure();
    termPrint('loading…', 'dim');
    const list = await refreshAccountCache();
    const q = (a[0] || '').toLowerCase();
    const rows = list.filter(x => !q || x.name.toLowerCase().includes(q) || x.id.toLowerCase().includes(q) || x.google.toLowerCase().includes(q))
                     .sort((x, y) => y.lastSeen - x.lastSeen);
    termPrint(pad('NAME', 17) + pad('LVL', 5) + pad('CLEARS', 7) + pad('LAST SEEN', 11) + 'STATUS', 'dim');
    rows.forEach(x => {
      const st = [x.ban ? 'BANNED ' + ago(x.ban.until - Date.now(), true) : '', x.lockLeft ? 'LOCKED ' + fmtWait(x.lockLeft) : '',
                  x.google ? 'google' : '', x.legacy ? 'old-login' : ''].filter(Boolean).join(' · ') || 'ok';
      termPrint(pad(x.name, 17) + pad(x.lvl, 5) + pad(x.cleared, 7) + pad(x.lastSeen ? ago(Date.now() - x.lastSeen) : '-', 11) + st,
        x.ban || x.lockLeft ? 'warn' : '');
    });
    tInfo(rows.length + ' of ' + list.length + ' accounts' + (q ? ' matching "' + q + '"' : ''));
  } },
  account: { desc:'Inspect / moderate one account (admin)', sub:{
    info:     { args:[H('<name>', accountNames)], desc:'Full details', async run(a) {
      const x = await findAccount(a[0]);
      [['name', x.name], ['account id', x.id], ['level', x.lvl + ' (' + x.xp + ' xp)'], ['cleared', x.cleared],
       ['google', x.google || 'not linked'], ['created', x.createdAt ? new Date(x.createdAt).toLocaleString() : '-'],
       ['last seen', x.lastSeen ? new Date(x.lastSeen).toLocaleString() : '-'],
       ['ban', x.ban ? 'until ' + new Date(x.ban.until).toLocaleString() + (x.ban.reason ? ' — ' + x.ban.reason : '') : 'none'],
       ['pin lock', x.lockLeft ? fmtWait(x.lockLeft) + ' left' : 'none'], ['login', x.legacy ? 'old (upgrades on next sign-in)' : 'secure']]
        .forEach(([k, v]) => tInfo(pad(k, 11) + v));
    } },
    ban:      { args:[H('<name>', accountNames), H('<minutes>', ['15', '60', '1440', '10080']), H('[reason…]', null, true)], desc:'Ban for N minutes', async run(a) {
      const x = await findAccount(a[0]);
      const mins = needInt(a[1], 'minutes');
      if (mins <= 0) throw new Error('minutes must be > 0');
      const until = await adminBan(x.id, mins, a.slice(2).join(' '));
      tWarn('banned ' + x.name + ' until ' + new Date(until).toLocaleString());
      refreshAccountCache(true);
    } },
    setxp:    { args:[H('<name>', accountNames), H('<xp>', ['0']), H('[clears]')], desc:'Fix a cheater: set XP (and clears)', async run(a) {
      const x = await findAccount(a[0]);
      const xp = needInt(a[1], 'xp'); if (xp < 0) throw new Error('xp must be ≥ 0');
      const cl = a[2] != null ? needInt(a[2], 'clears') : null;
      await adminSetProgress(x.id, xp, cl);
      tOk(x.name + ' → ' + xp + ' xp (LVL ' + getXpLevel(xp) + ')' + (cl != null ? ', ' + cl + ' clears' : ''));
      termPrint('they may need to sign out and in again to see it', 'dim');
      refreshAccountCache(true);
    } },
    setlevel: { args:[H('<name>', accountNames), NUM('<level>')], desc:'Move a player to a puzzle level (live if online)', async run(a) {
      const x = await findAccount(a[0]); const n = Math.max(1, needInt(a[1], 'level'));
      await dbPatch('/accounts/' + x.id, { level: n });
      await adminTroll(x.id, 'level', { value: n }).catch(() => {});
      tOk(x.name + ' → level ' + n);
    } },
    coins:    { args:[H('<name>', accountNames), NUM('<amount>')], desc:'Gift (or remove, negative) coins', async run(a) {
      const x = await findAccount(a[0]); const n = needInt(a[1], 'amount');
      const acc = await dbGet('/accounts/' + x.id);
      const next = Math.max(0, (acc && acc.coins || 0) + n);
      await dbPatch('/accounts/' + x.id, { coins: next });
      if (n > 0) await adminTroll(x.id, 'gift', { value: n }).catch(() => {});
      tOk(x.name + ' now has ' + next + ' coins');
    } },
    unban:    { args:[H('<name>', accountNames)], desc:'Lift a ban', async run(a) { const x = await findAccount(a[0]); await adminUnban(x.id); tOk('unbanned ' + x.name); refreshAccountCache(true); } },
    unlock:   { args:[H('<name>', accountNames)], desc:'Clear the 5-wrong-PIN lock', async run(a) { const x = await findAccount(a[0]); await adminUnlock(x.nameLower); tOk('lock cleared for ' + x.name); refreshAccountCache(true); } },
    resetpin: { args:[H('<name>', accountNames)], desc:'Give a player a temporary PIN', async run(a) {
      const x = await findAccount(a[0]);
      const r = await adminResetPin(x.id);
      tOk('temporary PIN for ' + x.name + ':  ' + r.pin);
      termPrint('tell them to sign in with it, then change it in Settings', 'dim');
      if (r.hadGoogle) tWarn('their Google link was removed — they can re-link it in Settings');
      refreshAccountCache(true);
    } }
  } },
  players: { desc:'List players in the room', run() {
    const e = Object.entries(lobbyPlayers);
    if (!e.length) return tWarn('not in a room');
    termPrint(pad('NAME', 18) + pad('ID', 9) + pad('LVL', 6) + 'STATE', 'dim');
    e.forEach(([pid, p]) => {
      const st = quitPlayers.has(pid) ? 'quit' : finishOrder.find(f => f.id === pid) ? 'done' : progressState[pid] ? progressState[pid].pct + '%' : '-';
      termPrint(pad(p.name + (pid === myId ? '*' : ''), 18) + pad('#' + pid.slice(-6).toUpperCase(), 9) + pad(p.xpLevel || 1, 6) + (p.host ? 'host ' : '') + st + (pid === adminTargetId ? '  ◀ target' : ''));
    });
  } },

  level: { desc:'Change the solo puzzle level', sub:{
    set:  { args:[NUM()], desc:'Jump to level n', run(a) { level = Math.max(1, needInt(a[0], 'level')); soloRegen(); tOk('level → ' + level); } },
    clear:{ args:[NUM('[n]')], desc:'Clear a level (this one, or jump to n) with the solver', run(a) {
      if (a[0] != null) { level = Math.max(1, needInt(a[0], 'level')); soloRegen(); }
      else if (!inGame() || !cells.length) soloRegen();
      setTimeout(() => { try { adminAutoSolve(); tOk('clearing level ' + level + '…'); } catch (e) { tErr('error: ' + e.message); } }, 250);
    } },
    next: { desc:'Next level', run() { level++; soloRegen(); tOk('level → ' + level); } },
    prev: { desc:'Previous level', run() { level = Math.max(1, level - 1); soloRegen(); tOk('level → ' + level); } },
    skip: { args:[NUM()], desc:'Skip n levels', run(a) { level = Math.max(1, level + needInt(a[0] || 5)); soloRegen(); tOk('level → ' + level); } }
  } },
  xp: { desc:'Edit your XP', sub:{
    add:   { args:[NUM('<amount>')], desc:'Add XP', run(a) { const r = addXp(needInt(a[0], 'amount')); updateMenuProfile(); tOk('+' + a[0] + ' xp → LVL ' + r.newLvl); } },
    set:   { args:[NUM('<amount>')], desc:'Set XP', run(a) { writeSave({ xp:Math.max(0, needInt(a[0], 'amount')) }); updateMenuProfile(); tOk('xp = ' + a[0] + ' (LVL ' + myXpLevel() + ')'); } },
    reset: { desc:'Reset XP to 0', run() { writeSave({ xp:0 }); updateMenuProfile(); tWarn('xp reset'); } }
  } },
  clears: { desc:'Edit cleared-levels count', sub:{
    add: { args:[NUM()], desc:'Add clears', run(a) { const s = loadSave(); writeSave({ totalCleared:(s.totalCleared || 0) + needInt(a[0]) }); updateMenuProfile(); tOk('cleared = ' + loadSave().totalCleared); } },
    set: { args:[NUM()], desc:'Set clears', run(a) { writeSave({ totalCleared:Math.max(0, needInt(a[0])) }); updateMenuProfile(); tOk('cleared = ' + a[0]); } }
  } },
  timer: { desc:'Control the timer', sub:{
    freeze: { desc:'Freeze (everyone, if host)', run() { timerFrozen = true; if (isHost) broadcastAll({ type:'freeze' }); tWarn('timer frozen'); } },
    resume: { desc:'Resume', run() { timerFrozen = false; if (isHost) broadcastAll({ type:'unfreeze' }); tOk('timer resumed'); } },
    reset:  { desc:'Reset to 0', run() { setTimerSec(0); tOk('timer reset'); } },
    add:    { args:[NUM('<sec>')], desc:'Add seconds (negative ok)', run(a) { setTimerSec(timerMs / 1000 + needInt(a[0], 'sec')); tOk('timer → ' + fmtMs(timerMs)); } },
    set:    { args:[NUM('<sec>')], desc:'Set seconds', run(a) { setTimerSec(needInt(a[0], 'sec')); tOk('timer → ' + fmtMs(timerMs)); } }
  } },
  board: { desc:'Board tools', sub:{
    solve: { desc:'Animate the solution', run() { adminAutoSolve(); tOk('auto-solving…'); } },
    hint:  { desc:'Flash the full solution 4s', run() { if (!cells.length) throw new Error('no board'); drawHint(solutionPath, 4000, 'hint'); tOk('solution shown for 4s'); } },
    new:   { desc:'New random puzzle', run() { if (needSoloBoard()) { initialSeed = randSeed(); generate(); startTimer(); } tOk('new board'); } },
    clear: { desc:'Clear your path', run() { resetPath(); tOk('path cleared'); } },
    seed:  { desc:'Show the board seed', run() { tInfo('seed ' + (battleActive ? battleSeed + ' (round ' + battleRound + ')' : initialSeed) + ' · level ' + level); } }
  } },
  diff: { desc:'Set difficulty (solo restarts / host lobby)', args:[H('<difficulty>', () => [...DIFFS, 'random'])], run(a) {
    const d = (a[0] || '').toLowerCase();
    if (!DIFFS.includes(d) && d !== 'random') throw new Error('unknown difficulty — ' + DIFFS.join('|') + '|random');
    if (inBattleSession()) {
      needHost();
      const btn = [...document.querySelectorAll('.bdiff-btn')].find(b => b.dataset.diff === d);
      if (btn) pickDiff(btn, d); else { battleDiffSetting = d; broadcastLobbySettings(); }
      return tOk('room difficulty → ' + d);
    }
    if (d === 'random') throw new Error('random is for battle rooms');
    dailyMode = false; startGame(d); adminClose(); tOk('solo → ' + d);
  } },
  boost: { desc:'In-match boosts', sub:{
    give:  { args:[H('<kind>', () => Object.keys(ABILITIES)), playerArg()], desc:'Give a boost (to a player if host)', run(a) {
      const k = a[0]; if (!ABILITIES[k]) throw new Error('kinds: ' + Object.keys(ABILITIES).join(', '));
      const pid = a[1] ? resolvePlayer(a[1]) : myId;
      if (!pid) throw new Error('no such player: ' + a[1]);
      if (pid === myId) {
        if (abilityInv.length >= MAX_SLOTS) abilityInv.shift();
        abilityInv.push(k); renderAbilityBar(abilityInv.length - 1); return tOk('gave you ' + k);
      }
      needHost(); broadcastAll({ type:'grant_boost', id:pid, kind:k }); tOk('gave ' + k + ' → ' + pname(pid));
    } },
    fire:  { args:[H('<kind>', () => Object.keys(ABILITIES))], desc:'Use a boost right now', run(a) {
      if (!ABILITIES[a[0]]) throw new Error('kinds: ' + Object.keys(ABILITIES).join(', '));
      if (!inGame()) throw new Error('not in a game');
      tOk(useAbility(a[0]) ? 'fired ' + a[0] : 'could not fire ' + a[0] + ' here');
    } },
    list:  { desc:'Show your slots + all kinds', run() {
      tInfo('slots: [' + abilityInv.join(', ') + ']');
      Object.entries(ABILITIES).forEach(([k, v]) => termPrint('  ' + v.icon + ' ' + pad(k, 8) + v.desc + (v.battle ? ' (battle)' : ''), 'dim'));
    } },
    clear: { desc:'Empty your slots', run() { abilityInv = []; renderAbilityBar(); tOk('slots cleared'); } }
  } },
  battle: { desc:'Battle control', sub:{
    start:      { desc:'Start the match (host, lobby)', run() { needHost(); if (battleActive) throw new Error('already running'); hostStart(); adminClose(); } },
    skip:       { desc:'End the round now (host)', run() { needHost(); needBattle(); broadcastRoundResults(); tOk('round ended'); } },
    end:        { desc:'Jump to final standings (host)', run() { needHost(); needBattle(); hostShowFinal(); tOk('final standings'); } },
    win:        { desc:'Finish your board instantly', run() { if (!inGame()) throw new Error('not in a game'); onWin(); tOk('force win'); } },
    lose:       { desc:'Quit to menu', run() { goMenu(); tWarn('left to menu'); } },
    resetpaths: { desc:'Reset every path (host)', run() { resetPath(); if (isHost) broadcastAll({ type:'reset_path' }); tOk('all paths reset'); } },
    rounds:     { args:[NUM()], desc:'Set round count (host)', run(a) { needHost(); maxRounds = Math.max(1, Math.min(10, needInt(a[0]))); document.getElementById('rounds-disp').innerText = maxRounds; broadcastLobbySettings(); tOk('rounds = ' + maxRounds); } },
    boosts:     { args:[H('<on|off>', ['on', 'off'])], desc:'Toggle boosts (host)', run(a) { needHost(); abilitiesEnabled = a[0] !== 'off'; syncBoostToggle(); broadcastLobbySettings(); tOk('boosts ' + (abilitiesEnabled ? 'on' : 'off')); } }
  } },
  kick:     { desc:'Kick a player (host)', args:[H('<player>', playerNames)], run(a) {
    needHost(); const pid = resolvePlayer(a[0]); if (!pid) throw new Error('no such player'); if (pid === myId) throw new Error('cannot kick yourself');
    kickPlayer(pid); tWarn('kicked ' + pname(pid));
  } },
  freeze:   { desc:'Freeze a player or all (host)', args:[playerArg(['all'])], run(a) {
    needHost(); const t = (a[0] || 'all').toLowerCase();
    if (t === 'all') { broadcastAll({ type:'freeze' }); return tWarn('froze everyone'); }
    const pid = resolvePlayer(a[0]); if (!pid) throw new Error('no such player');
    if (pid === myId) timerFrozen = true; else broadcastAll({ type:'freeze', id:pid });
    tWarn('froze ' + pname(pid));
  } },
  unfreeze: { desc:'Unfreeze a player or all', args:[playerArg(['all'])], run(a) {
    const t = (a[0] || 'all').toLowerCase();
    timerFrozen = false;
    if (isHost) { const pid = t === 'all' ? null : resolvePlayer(a[0]); broadcastAll(pid ? { type:'unfreeze', id:pid } : { type:'unfreeze' }); }
    tOk('unfroze ' + t);
  } },
  grant:    { desc:'Grant XP to a player', args:[playerArg(), NUM('<xp>')], run(a) {
    const pid = resolvePlayer(a[0]); if (!pid) throw new Error('no such player');
    const amt = needInt(a[1] || 50, 'xp');
    if (pid === myId) { addXp(amt); updateMenuProfile(); }
    else { needHost(); broadcastAll({ type:'grant_xp', id:pid, amount:amt }); }
    tOk('granted ' + amt + ' xp → ' + pname(pid));
  } },
  target:   { desc:'Set default target player', args:[playerArg()], run(a) {
    const pid = resolvePlayer(a[0]); if (!pid) throw new Error('no such player'); adminTargetId = pid; tOk('target → ' + pname(pid));
  } },
  say:      { desc:'Announce to the room', args:[H('<message…>', null, true)], run(a) {
    const msg = a.join(' ').slice(0, 80); if (!msg) throw new Error('nothing to say');
    if (isHost) broadcastAll({ type:'announce', msg, by: myName, av: getMyAvatar() });
    addChatMsg('Admin: ' + msg, null, true); sfx('world'); showAvatarMessage('Announcement · ' + myName, msg, myName, getMyAvatar()); tOk('announced');
  } },
  crate:    { desc:'Crates', sub:{
    keys: { args:[NUM('<n>')], desc:'Give yourself crate keys', run(a) { addKeys(needInt(a[0], 'n')); syncAccountToCloud(); tOk('keys = ' + getKeys()); } },
    open: { args:[H('<crate>', () => Object.keys(CRATES))], desc:'Open a crate for free', run(a) {
      const id = (a[0] || 'basic').toLowerCase(); if (!CRATES[id]) throw new Error('crates: ' + Object.keys(CRATES).join(', '));
      adminClose(); if (!isScreen('store')) openStore(); openCrates(id, 1, { free: true }); } },
    gift: { args:[H('<player>', accountNames), H('<crate>', () => Object.keys(CRATES)), NUM('[count]'), H('[message…]', null, true)], desc:'Give a player free crates (admin crates too) — they open them from the Store', async run(a) {
      needSecure(); const x = await findAccount(a[0]);
      const id = (a[1] || 'basic').toLowerCase(); if (!CRATES[id]) throw new Error('crates: ' + Object.keys(CRATES).join(', '));
      const n = Math.max(1, Math.min(20, parseInt(a[2]) || 1));
      for (let i = 0; i < n; i++) await sendGift(id, x.name, a.slice(3).join(' '), true);
      tOk(n + ' × ' + CRATES[id].name + ' → ' + x.name);
    } },
    odds: { desc:'Show drop odds + pool sizes', run() {
      Object.entries(CRATES).forEach(([id, c]) => { const p = cratePool(c); tInfo(pad(id, 7) + c.price + 'c  ' + RAR_ORDER.filter(r => c.odds[r]).map(r => r + ' ' + c.odds[r] + '% (' + (p[r] || []).length + ')').join(' · ')); });
    } }
  } },
  cosmetic: { desc:'Admin cosmetics', sub:{
    list: { args:[H('[set]', ['icon', 'color', 'frame', 'trail', 'title', 'admin'])], desc:'List cosmetic ids', run(a) {
      const want = (a[0] || 'admin').toLowerCase();
      Object.entries(COSMETIC_SETS).forEach(([set, list]) => list.forEach(i => {
        if ((want === 'admin' && i.admin) || set === want) termPrint(pad(set, 7) + pad(i.id, 14) + pad(i.name, 14) + rarityOf(i).name, i.admin ? 'warn' : 'dim');
      }));
    } },
    give: { args:[H('<player>', accountNames), H('<set>', ['icon', 'color', 'frame', 'trail', 'title']), H('<id>', () => { const t = tokenize(document.getElementById('term-input').value).toks; const set = COSMETIC_SETS[(t[3] || {}).v]; return set ? set.map(i => i.id) : []; })],
      desc:'Give a player any cosmetic (admin ones too)', async run(a) {
      needSecure(); const x = await findAccount(a[0]);
      const set = (a[1] || '').toLowerCase(), item = COSMETIC_SETS[set] && _find(COSMETIC_SETS[set], a[2]);
      if (!item) throw new Error('unknown ' + set + ' id — try: cosmetic list ' + set);
      await dbPatch('/accounts/' + x.id + '/owned/' + set, { [item.id]: true });
      await adminTroll(x.id, 'cosmetic', { text: set + ':' + item.id }).catch(() => {});
      tOk('gave ' + item.name + ' (' + set + ') → ' + x.name);
    } },
    me: { args:[H('<set>', ['icon', 'color', 'frame', 'trail', 'title']), H('<id>')], desc:'Give yourself a cosmetic', run(a) {
      const set = (a[0] || '').toLowerCase(), item = COSMETIC_SETS[set] && _find(COSMETIC_SETS[set], a[1]);
      if (!item) throw new Error('unknown id'); grantItem(set, item.id); syncAccountToCloud(); tOk('you own ' + item.name);
    } }
  } },
  unlock:   { desc:'Cosmetics: unlock everything / relock', args:[H('<all|reset>', ['all', 'reset'])], run(a) {
    if (a[0] === 'reset') { writeSave({ unlockAll:false }); tWarn('cosmetics relocked'); }
    else { writeSave({ unlockAll:true }); tOk('every Locker item unlocked'); }
  } },
  daily:    { desc:"Start today's daily challenge", run() { if (inBattleSession()) throw new Error('leave the room first'); startDaily(true); adminClose(); } },
  queue:    { desc:'Quick-match control', sub:{
    start:  { desc:'Join the level-based queue', run() { startQuickMatch(); adminClose(); } },
    cancel: { desc:'Leave the queue', run() { cancelQuickMatch(); tOk('queue cancelled'); } },
    status: { desc:'Queue state', run() {
      if (!mm) return tInfo('not queued');
      tInfo('phase ' + mm.phase + ' · bracket ' + MM_BRACKETS[mm.bracket].name + ' · widened ' + mm.widened + ' · ' + Math.floor((Date.now() - mm.t0) / 1000) + 's · room ' + (roomCode || '-'));
    } }
  } },
  sound:    { desc:'Sound effects on/off', args:[H('<on|off>', ['on', 'off'])], run(a) { setSetting('sound', a[0] !== 'off'); syncSoundBtn(); tOk('sound ' + (a[0] !== 'off' ? 'on' : 'off')); } },
  haptics:  { desc:'Vibration on/off', args:[H('<on|off>', ['on', 'off'])], run(a) { setSetting('haptics', a[0] !== 'off'); tOk('haptics ' + (a[0] !== 'off' ? 'on' : 'off')); } },
  pin:      { desc:'Set a local admin PIN override', sub:{
    set: { args:[H('<digits>')], desc:'Store new PIN hash locally', run(a) {
      if (!/^\d{4,12}$/.test(a[0] || '')) throw new Error('PIN must be 4-12 digits');
      sha256(a[0]).then(h => { localStorage.setItem('mazzie_pin_hash', h); tOk('PIN hash stored locally — copy to config.js to make it permanent:'); termPrint(h, 'dim'); });
    } }
  } },
  wipe:     { desc:'Delete local save data', args:[H('--confirm', ['--confirm'])], run(a) {
    if (a[0] !== '--confirm') return tWarn('this deletes your local save. run: wipe --confirm');
    localStorage.removeItem('mazzie'); updateMenuProfile(); applyMyCosmetics(); tWarn('local save wiped');
  } }
};
const ALIASES = { cls:'clear', '?':'help', q:'exit', quit:'exit', lvl:'level', t:'timer', b:'board', ann:'say', announce:'say', users:'accounts', acc:'account' };

// ── Account helpers (admin) ──
function needSecure() { if (authMode() !== 'secure') throw new Error('account tools need Firebase Auth set up (see FIREBASE_SETUP.md)'); if (!isAdminUser()) throw new Error('sign in with your admin Google account'); }
async function refreshAccountCache(quiet) {
  try { accountCache = await adminListAccounts(); }
  catch (e) { if (!quiet) throw new Error(e.message === 'DENIED' ? 'database refused — is your email in /admins?' : 'could not load accounts'); }
  return accountCache;
}
function accountNames() { return accountCache.map(x => x.name); }
async function findAccount(tok) {
  needSecure();
  if (!tok) throw new Error('which account?');
  if (!accountCache.length) await refreshAccountCache();
  const t = tok.toLowerCase();
  let hit = accountCache.find(x => x.name.toLowerCase() === t || x.id.toLowerCase() === t);
  if (!hit) { const pre = accountCache.filter(x => x.name.toLowerCase().startsWith(t)); if (pre.length === 1) hit = pre[0]; else if (pre.length > 1) throw new Error('ambiguous: ' + pre.map(x => x.name).join(', ')); }
  if (!hit) throw new Error('no account named "' + tok + '"');
  return hit;
}
function ago(ms, future) {
  const m = Math.round(ms / 60000);
  const s = m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd';
  return future ? s : (s === 'now' ? 'just now' : s + ' ago');
}

// Regenerate a solo board at the current level
function soloRegen() {
  if (battleActive) throw new Error('not available during a battle');
  writeSave({ level, diff:currentDiff || 'easy' });
  if (!inGame() || !cells.length) { startGame(currentDiff || 'easy'); return; }
  updateInGameLevelBadge(); generate(); startTimer();
}
function adminAutoSolve() {
  if (!inGame() || !solutionPath.length || amSpectating) throw new Error('no board to solve');
  resetPath(); push(solutionPath[0]);
  let i = 1;
  const iv = setInterval(() => {
    if (!inGame() || amSpectating || i >= solutionPath.length) { clearInterval(iv); return; }
    push(solutionPath[i++], true);
    if (checkWin()) { clearInterval(iv); return; }
    afterPathChange();
  }, 30);
}

// ══════════════════════════════════════════════════
// PARSING + COMPLETION
// ══════════════════════════════════════════════════
function tokenize(s) {
  const toks = []; let cur = null, q = null;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) { if (ch === q) q = null; else cur.v += ch; continue; }
    if (ch === '"' || ch === "'") { if (!cur) cur = { v:'', start:i }; q = ch; continue; }
    if (/\s/.test(ch)) { if (cur) { toks.push(cur); cur = null; } continue; }
    if (!cur) cur = { v:'', start:i };
    cur.v += ch;
  }
  const endsInToken = !!cur;
  if (cur) toks.push(cur);
  return { toks, endsInToken };
}
const resolveName = n => { n = (n || '').toLowerCase(); return ALIASES[n] || n; };

// What can go at token position idx?
function specAt(values, idx) {
  if (idx === 0) return { cands:Object.keys(CMDS), hint:'<command>' };
  const cmd = CMDS[resolveName(values[0])]; if (!cmd) return { cands:[] };
  let args = cmd.args, off = 1;
  if (cmd.sub) {
    if (idx === 1) return { cands:Object.keys(cmd.sub), hint:'<' + Object.keys(cmd.sub).join('|') + '>' };
    const sub = cmd.sub[(values[1] || '').toLowerCase()]; if (!sub) return { cands:[] };
    args = sub.args; off = 2;
  }
  if (!args || !args.length) return { cands:[] };
  let i = idx - off;
  if (i >= args.length) { if (args[args.length - 1].rest) i = args.length - 1; else return { cands:[] }; }
  const spec = args[i];
  const vals = typeof spec.vals === 'function' ? spec.vals() : (spec.vals || []);
  return { cands:vals, hint:spec.hint };
}
const quoteIfNeeded = v => /\s/.test(v) ? '"' + v + '"' : v;

function computeCompletion(text) {
  const { toks, endsInToken } = tokenize(text);
  const idx         = endsInToken ? toks.length - 1 : toks.length;
  const partial     = endsInToken ? toks[toks.length - 1].v : '';
  const replaceFrom = endsInToken ? toks[toks.length - 1].start : text.length;
  const { cands, hint } = specAt(toks.map(t => t.v), idx);
  const p = partial.toLowerCase();
  const seen = new Set();
  const matches = cands.filter(c => { const k = c.toLowerCase(); if (seen.has(k) || !k.startsWith(p)) return false; seen.add(k); return true; });
  return { matches, partial, replaceFrom, hint, idx, toks };
}
function lcp(list) {
  if (!list.length) return '';
  let pre = list[0];
  for (const s of list) { let i = 0; while (i < pre.length && i < s.length && pre[i].toLowerCase() === s[i].toLowerCase()) i++; pre = pre.slice(0, i); }
  return pre;
}

function termSetValue(v) {
  const inp = document.getElementById('term-input');
  inp.value = v;
  inp.setSelectionRange(v.length, v.length);
  inp.scrollLeft = inp.scrollWidth;
}

function termTab(reverse) {
  const inp = document.getElementById('term-input');
  if (tabState && inp.value === tabState.last) {
    const n = tabState.matches.length;
    tabState.i = (tabState.i + (reverse ? -1 : 1) + n) % n;
    tabState.last = tabState.prefix + quoteIfNeeded(tabState.matches[tabState.i]);
    termSetValue(tabState.last);
    termUpdateAssist(true);
    return;
  }
  const c = computeCompletion(inp.value);
  const prefix = inp.value.slice(0, c.replaceFrom);
  if (!c.matches.length) { termBell(); termUpdateAssist(); return; }
  if (c.matches.length === 1) {
    tabState = null;
    termSetValue(prefix + quoteIfNeeded(c.matches[0]) + ' ');
  } else {
    const common = lcp(c.matches);
    if (common.length > c.partial.length) { tabState = null; termSetValue(prefix + common); }
    else {
      tabState = { prefix, matches:c.matches, i:reverse ? c.matches.length - 1 : 0 };
      tabState.last = prefix + quoteIfNeeded(c.matches[tabState.i]);
      termSetValue(tabState.last);
    }
  }
  termUpdateAssist(!!tabState);
}
function termBell() {
  const f = document.querySelector('.term-line');
  f.classList.remove('bell'); void f.offsetWidth; f.classList.add('bell');
}

// Ghost text + suggestion chips
function termUpdateAssist(keepChips) {
  const inp   = document.getElementById('term-input');
  const ghost = document.getElementById('term-ghost');
  const sug   = document.getElementById('term-suggest');
  const text  = inp.value;
  const c     = computeCompletion(text);
  const prefix = text.slice(0, c.replaceFrom);

  // Ghost: first match rendered after what you've typed
  let rest = '';
  if (c.matches.length && (c.partial || c.idx > 0 || text.length)) {
    const full = prefix + quoteIfNeeded(c.matches[0]);
    if (full.toLowerCase().startsWith(text.toLowerCase()) && full.length > text.length) rest = full.slice(text.length);
  } else if (!c.matches.length && c.hint && !c.partial && text.length) {
    rest = c.hint;
  }
  const overflow = inp.scrollWidth > inp.clientWidth + 2;
  ghost.innerHTML = overflow ? '' : `<span class="gt-typed">${escapeHtml(text)}</span><span class="gt-rest">${escapeHtml(rest)}</span>`;

  // Chips
  const list = (keepChips && tabState) ? tabState.matches : c.matches;
  sug.innerHTML = '';
  if (c.hint && !c.matches.length) {
    const h = document.createElement('span'); h.className = 'term-hint'; h.textContent = c.hint; sug.appendChild(h);
  }
  list.slice(0, 40).forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'term-chip' + (tabState && keepChips && i === tabState.i ? ' sel' : '');
    b.textContent = m;
    const cmdDesc = c.idx === 0 && CMDS[m] ? CMDS[m].desc : '';
    if (cmdDesc) b.title = cmdDesc;
    b.onpointerdown = e => e.preventDefault(); // keep the keyboard open on phones
    b.onclick = () => {
      tabState = null;
      termSetValue(prefix + quoteIfNeeded(m) + ' ');
      termUpdateAssist();
      if (!matchMedia('(pointer:coarse)').matches) inp.focus();
    };
    sug.appendChild(b);
  });
}

// ── Execute ──
// Friendlier errors: DENIED means the database refused, so point at the doctor
function termFail(e) {
  const m = (e && e.message) || String(e);
  if (m === 'DENIED' || /database refused/.test(m)) { tErr('error: the database refused this'); termPrint('  run "doctor" to see why (usually: rules not published, or your email missing from /admins)', 'dim'); }
  else tErr('error: ' + m);
}
function termRun(line) {
  const raw = line.trim();
  termPrint('$ ' + raw, 'cmd');
  if (!raw) return;
  if (termHist[termHist.length - 1] !== raw) { termHist.push(raw); termHist = termHist.slice(-60); try { localStorage.setItem(TERM_HIST_KEY, JSON.stringify(termHist)); } catch (e) {} }
  termHistIdx = -1;
  const vals = tokenize(raw).toks.map(t => t.v);
  const name = resolveName(vals[0]);
  const cmd = CMDS[name];
  if (!cmd) {
    const near = Object.keys(CMDS).filter(k => k.startsWith(name.slice(0, 2)));
    return tErr('command not found: ' + vals[0] + (near.length ? '  — did you mean ' + near.join(', ') + '?' : '  — try "help"'));
  }
  try {
    if (cmd.sub) {
      const sub = cmd.sub[(vals[1] || '').toLowerCase()];
      if (!sub) return tWarn('usage: ' + name + ' <' + Object.keys(cmd.sub).join('|') + '>   (help ' + name + ')');
      const res = sub.run(vals.slice(2));
      if (res && res.then) res.catch(termFail);
    } else {
      const res = cmd.run(vals.slice(1));
      if (res && res.then) res.catch(termFail);
    }
  } catch (e) { termFail(e); }
  document.getElementById('term-mode').innerText = termMode();
}

// ── Keyboard handling inside the input ──
document.getElementById('term-input').addEventListener('keydown', e => {
  const inp = e.target;
  if (e.key === 'Tab')    { e.preventDefault(); termTab(e.shiftKey); return; }
  if (e.key === 'Enter')  { e.preventDefault(); const v = inp.value; termSetValue(''); tabState = null; termRun(v); termUpdateAssist(); return; }
  if (e.key === 'Escape') { e.preventDefault(); adminClose(); return; }
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); termHistory(e.key === 'ArrowUp' ? -1 : 1); return; }
  if (e.key === 'ArrowRight' && inp.selectionStart === inp.value.length) {
    const rest = document.querySelector('#term-ghost .gt-rest');
    const c = computeCompletion(inp.value);
    if (rest && rest.textContent && c.matches.length) { e.preventDefault(); termSetValue(inp.value + rest.textContent); termUpdateAssist(); }
    return;
  }
  if (e.ctrlKey && e.key.toLowerCase() === 'l') { e.preventDefault(); CMDS.clear.run(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'c' && inp.selectionStart === inp.selectionEnd) { e.preventDefault(); termPrint('$ ' + inp.value + '^C', 'dim'); termSetValue(''); termUpdateAssist(); return; }
  if (e.ctrlKey && e.key.toLowerCase() === 'u') { e.preventDefault(); termSetValue(''); termUpdateAssist(); }
});
document.getElementById('term-input').addEventListener('input', () => { tabState = null; termUpdateAssist(); });

function termHistory(dir) {
  if (!termHist.length) return;
  const inp = document.getElementById('term-input');
  if (termHistIdx === -1) { if (dir > 0) return; termDraft = inp.value; termHistIdx = termHist.length; }
  termHistIdx += dir;
  if (termHistIdx >= termHist.length) { termHistIdx = -1; termSetValue(termDraft); }
  else { termHistIdx = Math.max(0, termHistIdx); termSetValue(termHist[termHistIdx]); }
  tabState = null; termUpdateAssist();
}

// On-screen keys for phones (no Tab key on mobile keyboards)
function termKey(k) {
  const inp = document.getElementById('term-input');
  if (k === 'tab')   termTab(false);
  if (k === 'up')    termHistory(-1);
  if (k === 'down')  termHistory(1);
  if (k === 'clear') { termSetValue(''); tabState = null; termUpdateAssist(); }
  if (k === 'enter') { const v = inp.value; termSetValue(''); tabState = null; termRun(v); termUpdateAssist(); }
}
function termToggleSize() {
  const t = document.getElementById('admin-term');
  const tall = t.classList.toggle('tall');
  try { localStorage.setItem('mz_term_tall', tall ? '1' : ''); } catch (e) {}
  document.getElementById('term-size').innerHTML = ic(tall ? 'collapse' : 'expand');
}
try { if (localStorage.getItem('mz_term_tall')) document.getElementById('admin-term').classList.add('tall'); } catch (e) {}
function termFocus(e) {
  if (e.target.closest('button') || e.target.closest('.term-out')) return;
  document.getElementById('term-input').focus();
}

// ── Global open/close: F2 or ` (admins only, silent for everyone else) ──
document.addEventListener('keydown', e => {
  const isToggle = e.key === 'F2' || (e.key === '`' && !(document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName) && document.activeElement.id !== 'term-input'));
  if (!isToggle) return;
  if (!isAdminUser()) return;
  e.preventDefault();
  termIsOpen() ? adminClose() : openTerminal();
});
// Phones: long-press the logo (menu) or the timer (in game)
onLongPress(document.querySelector('#menu .logo'), 900, adminOpen);
onLongPress(document.getElementById('timer'), 900, adminOpen);
