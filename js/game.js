// ══════════════════════════════════════════════════
// js/game.js — Maze generation, input, win, timer
// ══════════════════════════════════════════════════

// ── Entry points ──
function startFresh(diff) {
  level = 1;
  initialSeed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  startGame(diff, initialSeed);
}
function continueGame() {
  const s = loadSave();
  if (s.level && s.diff) {
    level      = s.level;
    initialSeed = s.soloSeed || (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0);
    startGame(s.diff, initialSeed);
  }
}

// ── In-game level badge ──
function updateInGameLevelBadge() {
  const xpLvl = getXpLevel(loadSave().xp || 0);
  const el = document.getElementById('lvl-badge');
  if (!el) return;
  let tier = 0;
  if      (xpLvl >= 5000) tier = 8;
  else if (xpLvl >= 1000) tier = 7;
  else if (xpLvl >= 500)  tier = 6;
  else if (xpLvl >= 200)  tier = 5;
  else if (xpLvl >= 100)  tier = 4;
  else if (xpLvl >= 50)   tier = 3;
  else if (xpLvl >= 25)   tier = 2;
  else if (xpLvl >= 10)   tier = 1;
  el.className = 'lvl-badge' + (tier > 0 ? ' badge-t' + tier : '');
  if (battleActive) {
    el.innerHTML = getLevelBadge(xpLvl);
  } else {
    const pc = level >= 50 ? '#a78bfa' : level >= 20 ? '#48dbfb' : level >= 10 ? '#2dff7f' : 'var(--dim)';
    el.innerHTML = `<span style="font-family:'DM Mono',monospace;font-size:11px;color:${pc};font-weight:700;">P${level}</span>` + getLevelBadge(xpLvl);
  }
}

// ── Game start ──
function startGame(diff, seed) {
  if (seed === undefined) seed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  currentDiff = diff; initialSeed = seed;
  const cfg = CONFIGS[diff]; rows = cfg.r; cols = cfg.c; baseNodes = cfg.n;
  if (!battleActive) writeSave({ level, diff, soloSeed: seed });
  // UI flags
  const inBattle = battleActive;
  document.getElementById('battle-pill').style.display     = inBattle ? 'block' : 'none';
  document.getElementById('battle-game-btn').style.display = inBattle ? 'none'  : 'block';
  document.getElementById('game-chat-btn').style.display   = inBattle ? 'flex'  : 'none';
  const rp = document.getElementById('round-pill');
  rp.style.display = inBattle ? 'block' : 'none';
  if (inBattle) rp.innerText = 'R' + battleRound + '/' + maxRounds;
  document.getElementById('diff-label').innerText = diff.toUpperCase();
  document.getElementById('win').classList.add('hidden');
  updateInGameLevelBadge();
  calcSize();
  if (inBattle) {
    showCountdown(3, () => { generate(); startTimer(); show('game'); });
  } else {
    show('game'); generate(); startTimer();
  }
}

// ── Countdown overlay ──
function showCountdown(from, onDone) {
  show('game');
  let overlay = document.getElementById('countdown-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'countdown-overlay';
    document.body.appendChild(overlay);
  }
  let n = from;
  const tick = () => {
    overlay.className = 'cd-pop';
    overlay.textContent = n > 0 ? n : 'GO!';
    if (n <= 0) { setTimeout(() => { overlay.className = 'cd-gone'; onDone(); }, 500); return; }
    n--;
    setTimeout(tick, 900);
  };
  tick();
}

function calcSize() {
  const mW = Math.min(window.innerWidth - 40, 440);
  const mH = Math.min(window.innerHeight - 210, 580);
  cellSize = Math.min(
    Math.floor((mW - GPAD * 2 - (cols - 1) * GAP) / cols),
    Math.floor((mH - GPAD * 2 - (rows - 1) * GAP) / rows),
    60
  );
}

// ── Seeded PRNG (32-bit Mulberry32) ──
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ s >>> 15, s | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ══════════════════════════════════════════════════
// PUZZLE GENERATOR  (clean simple random walk)
// ══════════════════════════════════════════════════
let obstacleSet = new Set();

function generate() {
  const g = document.getElementById('grid');
  g.innerHTML = ''; cells = []; hiddenSet.clear(); pathIndices = [];
  solutionPath = []; obstacleSet = new Set(); clearSvg();
  g.style.cssText = `display:grid;background:var(--sf);border-radius:22px;padding:${GPAD}px;`
    + `box-shadow:0 0 0 1px var(--cb),0 0 0 1px rgba(255,255,255,.04) inset,0 32px 80px rgba(0,0,0,.65);`
    + `position:relative;z-index:1;grid-template-columns:repeat(${cols},${cellSize}px);gap:${GAP}px;`;
  for (let i = 0; i < rows * cols; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.style.cssText = `width:${cellSize}px;height:${cellSize}px;`;
    el.dataset.idx = i; g.appendChild(el); cells.push(el);
  }

  totalNodes = Math.min(baseNodes + Math.floor(level / 3), 10);

  // Seed: battle uses synced seed; solo uses crypto seed per level
  const seed = battleActive
    ? (battleSeed ^ (battleRound * 0x9e3779b9)) >>> 0
    : (initialSeed ^ (level  * 0x6c62272e)) >>> 0;

  const rng     = makeRng(seed);
  const total   = rows * cols;
  const minLen  = Math.max(totalNodes * 3, Math.floor(total * 0.50));
  const maxLen  = Math.floor(total * 0.82);

  // Simple random walk — start from a random cell, walk until done
  let path = [], visited = new Set();
  let curr = Math.floor(rng() * total);
  path.push(curr); visited.add(curr);

  for (let step = 0; step < 4000; step++) {
    if (path.length >= maxLen) break;
    const adj = nbrs(curr).filter(n => !visited.has(n));
    if (!adj.length) break;
    curr = adj[Math.floor(rng() * adj.length)];
    path.push(curr); visited.add(curr);
  }

  // If path is too short, restart from a corner for a longer walk
  if (path.length < minLen) {
    path = []; visited = new Set();
    curr = [0, cols - 1, (rows - 1) * cols, rows * cols - 1][Math.floor(rng() * 4)];
    path.push(curr); visited.add(curr);
    for (let step = 0; step < 8000; step++) {
      if (path.length >= maxLen) break;
      const adj = nbrs(curr).filter(n => !visited.has(n));
      if (!adj.length) break;
      curr = adj[Math.floor(rng() * adj.length)];
      path.push(curr); visited.add(curr);
    }
  }

  solvableCount = path.length;
  solutionPath  = [...path];
  const pathSet = new Set(path);

  // Hide off-path cells
  cells.forEach((c, i) => {
    if (!pathSet.has(i)) { c.classList.add('hidden-cell'); hiddenSet.add(i); }
  });

  // ── Obstacles (diff-scaled) ──
  const diffObs = { baby: 0, easy: 1, medium: 2, hard: 3, expert: 5 };
  const maxObs  = Math.min((diffObs[currentDiff] || 0) + Math.floor(level / 6), 7);

  if (maxObs > 0) {
    // Node positions — don't obstruct adjacent to them
    const nodePositions = new Set();
    for (let ni = 1; ni <= totalNodes; ni++) {
      const pi = Math.floor(((ni - 1) / (totalNodes - 1)) * (path.length - 1));
      nodePositions.add(path[pi]);
      nbrs(path[pi]).forEach(n => nodePositions.add(n));
    }
    // Candidates: hidden cells near path but not near nodes
    const cands = [];
    for (let i = 0; i < total; i++) {
      if (pathSet.has(i) || nodePositions.has(i)) continue;
      if (nbrs(i).some(n => pathSet.has(n))) cands.push(i);
    }
    // Shuffle and place
    for (let i = cands.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cands[i], cands[j]] = [cands[j], cands[i]];
    }
    let placed = 0;
    for (const idx of cands) {
      if (placed >= maxObs) break;
      obstacleSet.add(idx);
      cells[idx].classList.remove('hidden-cell');
      hiddenSet.delete(idx);
      cells[idx].classList.add('obstacle');
      cells[idx].dataset.obstacle = '1';
      placed++;
    }
  }

  // ── Place numbered nodes evenly along path ──
  for (let i = 1; i <= totalNodes; i++) {
    const pi  = Math.floor(((i - 1) / (totalNodes - 1)) * (path.length - 1));
    const el  = cells[path[pi]];
    el.dataset.num = i;
    el.innerHTML   = `<div class="node">${i}</div>`;
  }

  isDrawing = false; amSpectating = false;
  requestAnimationFrame(cachePos);
}

function cachePos() {
  const gr   = document.getElementById('grid').getBoundingClientRect();
  gLeft = gr.left + GPAD; gTop = gr.top + GPAD;
  const wrap = document.querySelector('.board-wrap').getBoundingClientRect();
  const svg  = document.getElementById('grid-svg');
  svg.style.cssText = `position:absolute;inset:0;pointer-events:none;z-index:2;overflow:visible;`
    + `width:${wrap.width}px;height:${wrap.height}px;`;
  svg.setAttribute('viewBox', `0 0 ${wrap.width} ${wrap.height}`);
}

function nbrs(i) {
  const res = [], r = Math.floor(i / cols), c = i % cols;
  if (r > 0)         res.push(i - cols);
  if (r < rows - 1)  res.push(i + cols);
  if (c > 0)         res.push(i - 1);
  if (c < cols - 1)  res.push(i + 1);
  return res;
}

// ══════════════════════════════════════════════════
// INPUT
// ══════════════════════════════════════════════════
function cellAt(x, y) {
  const rx = x - gLeft, ry = y - gTop;
  if (rx < 0 || ry < 0) return -1;
  const step = cellSize + GAP;
  const col = Math.floor(rx / step), row = Math.floor(ry / step);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
  const idx = row * cols + col;
  if (hiddenSet.has(idx) || obstacleSet.has(idx) || idx >= cells.length) return -1;
  return idx;
}
function inGame() { return !document.getElementById('game').classList.contains('hidden'); }

function onDown(e) {
  if (!inGame() || amSpectating) return;
  const t = e.touches ? e.touches[0] : e;
  const idx = cellAt(t.clientX, t.clientY); if (idx < 0) return;
  if (pathIndices.length > 0 && idx === pathIndices[pathIndices.length - 1]) { isDrawing = true; return; }
  if (pathIndices.length === 0 || (pathIndices.includes(idx) && idx === pathIndices[0])) {
    resetPath();
    const v = parseInt(cells[idx].dataset.num) || 0; if (v && v !== 1) return;
    isDrawing = true; push(idx);
  } else if (pathIndices.includes(idx)) {
    while (pathIndices[pathIndices.length - 1] !== idx) pop();
    isDrawing = true;
  }
}
function onMove(e) {
  if (!isDrawing || !inGame() || amSpectating) return; e.preventDefault();
  const t = e.touches ? e.touches[0] : e;
  const idx = cellAt(t.clientX, t.clientY); if (idx < 0) return;
  const len = pathIndices.length;
  if (len >= 2 && idx === pathIndices[len - 2]) { pop(); return; }
  if (pathIndices.includes(idx)) return;
  if (!isAdj(pathIndices[len - 1], idx)) return;
  const val = parseInt(cells[idx].dataset.num) || 0, hi = highNode();
  if (val && val !== hi + 1) return;
  // Block final node until all path cells are covered
  if (val === totalNodes && (pathIndices.length + 1) < solvableCount) return;
  push(idx);
  if (val === totalNodes) onWin();
}
function onUp() { isDrawing = false; updateHead(); }

function push(i) {
  pathIndices.push(i); cells[i].classList.remove('path-head'); cells[i].classList.add('active');
  updateHead(); redrawPath();
}
function pop() {
  cells[pathIndices[pathIndices.length - 1]].classList.remove('path-head');
  const i = pathIndices.pop(); cells[i].classList.remove('active', 'path-head');
  updateHead(); redrawPath();
}
function updateHead() {
  cells.forEach(c => c.classList.remove('path-head'));
  if (pathIndices.length > 0 && !isDrawing) cells[pathIndices[pathIndices.length - 1]].classList.add('path-head');
}
function isAdj(a, b) {
  if (obstacleSet.has(a) || obstacleSet.has(b)) return false;
  return Math.abs(Math.floor(a/cols) - Math.floor(b/cols)) + Math.abs(a%cols - b%cols) === 1;
}
function highNode() {
  let h = 0; pathIndices.forEach(i => { const v = parseInt(cells[i].dataset.num) || 0; h = Math.max(h, v); }); return h;
}
function resetPath() {
  pathIndices.forEach(i => cells[i].classList.remove('active', 'path-head'));
  pathIndices = []; isDrawing = false; clearSvg();
}

function cellCenter(idx) {
  const col = idx % cols, row = Math.floor(idx / cols);
  const wrap = document.querySelector('.board-wrap').getBoundingClientRect();
  const gr   = document.getElementById('grid').getBoundingClientRect();
  return {
    x: (gr.left - wrap.left) + GPAD + col * (cellSize + GAP) + cellSize / 2,
    y: (gr.top  - wrap.top)  + GPAD + row * (cellSize + GAP) + cellSize / 2
  };
}
function redrawPath() {
  const svg = document.getElementById('grid-svg'); svg.innerHTML = '';
  if (pathIndices.length < 2) return;
  const pts = pathIndices.map(cellCenter);
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x},${pts[i].y}`;
  // Soft glow layer
  const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  glow.setAttribute('d', d); glow.setAttribute('stroke', 'var(--acc)');
  glow.setAttribute('stroke-width', '10'); glow.setAttribute('stroke-linecap', 'round');
  glow.setAttribute('stroke-linejoin', 'round'); glow.setAttribute('fill', 'none');
  glow.setAttribute('opacity', '0.14'); svg.appendChild(glow);
  // Main line
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', d); line.setAttribute('stroke', 'var(--acc)');
  line.setAttribute('stroke-width', '3.5'); line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round'); line.setAttribute('fill', 'none');
  line.setAttribute('opacity', '0.7'); svg.appendChild(line);
}
function clearSvg() { document.getElementById('grid-svg').innerHTML = ''; }

// ── Event listeners ──
document.addEventListener('mousedown',  onDown);
document.addEventListener('mousemove',  onMove);
document.addEventListener('mouseup',    onUp);
document.addEventListener('touchstart', onDown, { passive: false });
document.addEventListener('touchmove',  onMove, { passive: false });
document.addEventListener('touchend',   onUp);

// ══════════════════════════════════════════════════
// TIMER
// ══════════════════════════════════════════════════
function startTimer() {
  clearInterval(timerInt); elapsedSec = 0; timerFrozen = false;
  document.getElementById('timer').innerText = '00:00';
  timerInt = setInterval(() => {
    if (timerFrozen) return;
    elapsedSec++;
    document.getElementById('timer').innerText = fmt(elapsedSec);
    if (battleActive && !amSpectating) broadcastProgress();
  }, 1000);
}
function stopTimer() { clearInterval(timerInt); }
function fmt(s) { return String(s / 60 | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }

function broadcastProgress() {
  const pct = solvableCount > 0 ? Math.round((pathIndices.length / solvableCount) * 100) : 0;
  const msg = { type: 'progress', id: myId, pct, path: [...pathIndices] };
  if (isHost) { progressState[myId] = { pct, done: false, path: [...pathIndices] }; broadcastAll(msg); }
  else if (hostConn && hostConn.open) hostConn.send(msg);
}

// ══════════════════════════════════════════════════
// WIN
// ══════════════════════════════════════════════════
function onWin() {
  isDrawing = false; stopTimer();
  const sec = elapsedSec, time = fmt(sec);
  if (battleActive) {
    amSpectating = true; spawnParticles();
    addXp(DIFF_XP[battleDiff] || 20);
    if (isHost) { hostRegisterFinish(sec, time); showSpectateScreen(time); }
    else {
      const cleared = loadSave().totalCleared || 0;
      if (hostConn && hostConn.open)
        hostConn.send({ type: 'done', id: myId, name: myName, sec, time,
          rankName: getRank(cleared).name, xpLvl: getXpLevel(loadSave().xp || 0) });
      showSpectateScreen(time);
    }
  } else {
    const s = loadSave();
    writeSave({ totalCleared: (s.totalCleared || 0) + 1, level: level + 1, diff: currentDiff });
    const xpRes = addXp(DIFF_XP[currentDiff] || 20);
    updateMenuProfile();
    document.getElementById('win-time').innerText = 'TIME  ' + time;
    document.getElementById('win-xp-row').innerHTML = `<span class="xp-gain">+${xpRes.gained} XP ⬡</span>`;
    const nb = document.getElementById('next-btn');
    nb.classList.remove('ready'); nb.style.display = 'block';
    setTimeout(() => nb.classList.add('ready'), 1000);
    show('win'); spawnParticles();
    syncAccountToCloud().catch(() => {});
  }
}

function nextLevel() {
  level++;
  initialSeed = crypto.getRandomValues(new Uint32Array(1))[0] >>> 0;
  writeSave({ level, diff: currentDiff, soloSeed: initialSeed });
  updateInGameLevelBadge();
  document.getElementById('continue-btn').classList.remove('hidden');
  document.getElementById('continue-info').innerText = currentDiff.toUpperCase() + ' · LVL ' + level;
  document.getElementById('win').classList.add('hidden');
  show('game'); generate(); startTimer();
}

// ── Resize ──
window.addEventListener('resize', () => {
  if (!document.getElementById('game').classList.contains('hidden')) {
    calcSize();
    document.getElementById('grid').style.gridTemplateColumns = `repeat(${cols},${cellSize}px)`;
    cells.forEach(c => c.style.cssText = `width:${cellSize}px;height:${cellSize}px;`);
    requestAnimationFrame(cachePos);
  }
});
