// ══════════════════════════════════════════════════
// js/abilities.js — In-match boosts: pickups on the board, 3-slot ability bar,
// self boosts (Hint, Dash, Time Stop, Shield) and attacks (Frost, Fog).
// ══════════════════════════════════════════════════

const ABILITIES = {
  hint:   { icon:'bulb', name:'Hint',      desc:'Shows the next cells of the solution',   self:true },
  dash:   { icon:'bolt', name:'Dash',      desc:'Auto-fills the next 4 correct cells',     self:true },
  stop:   { icon:'pause', name:'Time Stop', desc:'Pauses your timer for 5s',               self:true },
  shield: { icon:'shield', name:'Shield',    desc:'Blocks the next attack for 15s',          self:true, battle:true },
  frost:  { icon:'snow', name:'Frost',     desc:'Freezes every rival board for 2.5s',      attack:true, battle:true },
  fog:    { icon:'fog', name:'Fog',       desc:'Hides rival numbers for 4s',              attack:true, battle:true }
};
const SOLO_POOL   = ['hint', 'hint', 'dash', 'stop'];
const BATTLE_POOL = ['hint', 'dash', 'stop', 'shield', 'frost', 'frost', 'fog', 'fog'];
const MAX_SLOTS = 3;

// Boosts only exist in room matches with the "Power-ups" modifier on
function boostsActive() { return battleActive && abilitiesEnabled; }

// ── Place pickups on the solution path (deterministic from the board rng) ──
// Only in Power-ups matches: glowing orbs on the path, same spots for every racer,
// plus one free boost in your first slot when the round starts.
function placePickups(rng, path, nodeCells) {
  const pool = battleActive ? BATTLE_POOL : SOLO_POOL;
  const count = Math.max(2, Math.min(4, Math.floor(path.length / 9)));
  // Skip the first few cells so nobody gets a boost for free
  const cands = path.slice(4, -2).filter(c => !nodeCells.has(c));
  for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
  cands.slice(0, count).forEach(ci => {
    const kind = pool[Math.floor(rng() * pool.length)];
    pickupMap.set(ci, kind);
    const orb = document.createElement('div');
    orb.className = 'pickup pk-' + kind; orb.innerHTML = ic(ABILITIES[kind].icon);
    cells[ci].appendChild(orb);
  });
  // Everyone starts the round with the same free boost
  abilityInv = [pool[Math.floor(rng() * pool.length)]];
  renderAbilityBar(0);
}

function collectPickup(ci) {
  if (abilityInv.length >= MAX_SLOTS) {
    if (!cells[ci].dataset.fullWarned) { pushToast('Boost slots full — use one first', 'warn'); cells[ci].dataset.fullWarned = '1'; }
    return; // stays on the board; grab it later
  }
  const kind = pickupMap.get(ci);
  pickupMap.delete(ci);
  const orb = cells[ci].querySelector('.pickup');
  if (orb) { orb.classList.add('got'); setTimeout(() => orb.remove(), 350); }
  abilityInv.push(kind);
  renderAbilityBar(abilityInv.length - 1);
  sfx('pickup'); buzz(20);
  showReward({ icon: ABILITIES[kind].icon, tone: ABILITIES[kind].attack ? 'cyan' : 'gold', kicker: 'Boost found', title: ABILITIES[kind].name, sub: ABILITIES[kind].desc, quick: true });
}

// ── Ability bar UI ──
function renderAbilityBar(flashSlot) {
  const bar = document.getElementById('ability-bar'); if (!bar) return;
  const on = boostsActive();
  bar.classList.toggle('off', !on);
  bar.innerHTML = '';
  const inBag = bagTotal(usableKinds());
  for (let i = 0; i < MAX_SLOTS; i++) {
    const kind = abilityInv[i];
    const b = document.createElement('button');
    b.className = 'ab-slot' + (kind ? ' filled' : inBag ? ' has-bag' : '') + (kind && ABILITIES[kind].attack ? ' attack' : '') + (i === flashSlot ? ' pop' : '');
    b.innerHTML = kind
      ? `<span class="ab-icon">${ic(ABILITIES[kind].icon)}</span><span class="ab-key">${i + 1}</span>`
      : inBag
        ? `<span class="ab-empty">${ic('bag')}<b class="ab-count">${inBag}</b></span>`
        : `<span class="ab-empty">${ic('plus')}</span>`;
    b.title = kind ? ABILITIES[kind].desc : inBag ? 'Tap to use a boost from your bag' : 'Grab the glowing orbs on the board';
    b.onclick = () => kind ? useAbilitySlot(i) : inBag ? openBag() : null;
    bar.appendChild(b);
  }
}

function useAbilitySlot(i) {
  const kind = abilityInv[i];
  if (!kind || !canPlay()) return;
  if (useAbility(kind)) { abilityInv.splice(i, 1); renderAbilityBar(); }
}

// Returns true if the ability was consumed
function useAbility(kind) {
  const a = ABILITIES[kind]; if (!a) return false;
  const now = performance.now();
  sfx('ability'); buzz(15);
  switch (kind) {
    case 'hint': {
      const k = matchedPrefix();
      if (k < pathIndices.length) {
        // You went off-track: mark where it went wrong
        const wrong = cells[pathIndices[k]]; wrong.classList.add('wrong'); setTimeout(() => wrong.classList.remove('wrong'), 1600);
      }
      const from = Math.max(0, k - 1);
      drawHint(solutionPath.slice(from, Math.min(solutionPath.length, k + 7)), 3200, 'hint');
      pushToast('Follow the dashed line', 'info', 'bulb');
      return true;
    }
    case 'dash': {
      const k = matchedPrefix();
      while (pathIndices.length > k) pop(true);
      if (pathIndices.length === 0) push(solutionPath[0], true);
      let n = 0;
      while (n < 4 && pathIndices.length < solutionPath.length) {
        const next = solutionPath[pathIndices.length];
        if (!canStep(next)) break;
        push(next, true); n++;
        if (checkWin()) return true;
      }
      afterPathChange();
      document.getElementById('grid').classList.add('dashing');
      setTimeout(() => document.getElementById('grid').classList.remove('dashing'), 400);
      return true;
    }
    case 'stop':
      selfFreezeUntil = Math.max(selfFreezeUntil, now) + 5000;
      pushToast('Timer paused 5s', 'info', 'pause');
      return true;
    case 'shield':
      if (!battleActive) return false;
      shieldUntil = now + 15000;
      document.getElementById('game').classList.add('shielded');
      setTimeout(() => { if (performance.now() >= shieldUntil) document.getElementById('game').classList.remove('shielded'); }, 15050);
      pushToast('Shield up for 15s', 'acc', 'shield');
      return true;
    case 'frost':
    case 'fog':
      if (!battleActive) return false;
      sendAttack(kind);
      pushToast(a.name + ' sent', 'acc', a.icon);
      return true;
  }
  return false;
}

// Length of your path that still matches the generated solution
function matchedPrefix() {
  let k = 0;
  while (k < pathIndices.length && pathIndices[k] === solutionPath[k]) k++;
  return k;
}

// ── Networking for attacks ──
function sendAttack(kind) {
  const msg = { type:'ability', id:myId, name:myName, kind };
  if (isHost) relayAttack(msg);
  else if (hostConn && hostConn.open) hostConn.send(msg);
}
// Host: forward to everybody else (and apply to self if someone else fired it)
function relayAttack(msg) {
  if (!battleActive || !abilitiesEnabled || !ABILITIES[msg.kind] || !ABILITIES[msg.kind].attack) return;
  const out = { type:'ability_hit', from:msg.id, fromName:cleanName(msg.name), kind:msg.kind };
  broadcastAll(out);
  if (msg.id !== myId) receiveAttack(out);
  adminLog('info', out.fromName + ' used ' + msg.kind);
}
function receiveAttack(d) {
  if (d.from === myId || !battleActive || amSpectating || !ABILITIES[d.kind]) return;
  const now = performance.now();
  const who = d.fromName || 'A rival';
  if (now < shieldUntil) {
    shieldUntil = 0; document.getElementById('game').classList.remove('shielded');
    pushToast('Shield blocked ' + ABILITIES[d.kind].name + ' from ' + d.fromName, 'acc', 'shieldOk');
    sfx('pickup'); return;
  }
  sfx('hit'); buzz([40, 30, 40]);
  const grid = document.getElementById('grid');
  if (d.kind === 'frost') {
    inputLockedUntil = now + 2500; isDrawing = false;
    grid.classList.add('frosted');
    pushToast('Frozen by ' + d.fromName, 'warn', 'snow');
  } else if (d.kind === 'fog') {
    grid.classList.add('fogged');
    clearTimeout(window._fogT);
    window._fogT = setTimeout(() => grid.classList.remove('fogged'), 4000);
    pushToast(d.fromName + ' fogged your board', 'warn', 'fog');
  }
  addChatMsg(who + ' used ' + ABILITIES[d.kind].name, null, true);
}
