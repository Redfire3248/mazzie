// ══════════════════════════════════════════════════
// js/game.js — Maze generation, input, win, timer
// ══════════════════════════════════════════════════

// ── Entry points ──
function startFresh(diff) { level = 1; startGame(diff); }
function continueGame() {
  const s = loadSave();
  if (s.level && s.diff) { level = s.level; startGame(s.diff); }
}

// ── Update the in-game top-bar level badge ──
function updateInGameLevelBadge() {
  const xpLvl = getXpLevel(loadSave().xp || 0);
  const el = document.getElementById('lvl-badge');
  if (!el) return;

  // Determine glow tier from XP level for the container box
  let badgeTier = 0;
  if      (xpLvl >= 5000) badgeTier = 8;
  else if (xpLvl >= 1000) badgeTier = 7;
  else if (xpLvl >= 500)  badgeTier = 6;
  else if (xpLvl >= 200)  badgeTier = 5;
  else if (xpLvl >= 100)  badgeTier = 4;
  else if (xpLvl >= 50)   badgeTier = 3;
  else if (xpLvl >= 25)   badgeTier = 2;
  else if (xpLvl >= 10)   badgeTier = 1;

  // Remove all tier classes then add current
  el.className = 'lvl-badge';
  if (badgeTier > 0) el.classList.add('badge-t' + badgeTier);

  if (battleActive) {
    el.innerHTML = getLevelBadge(xpLvl);
  } else {
    const puzzleColor = level >= 50 ? '#a78bfa' : level >= 20 ? '#48dbfb' : level >= 10 ? '#2dff7f' : 'var(--dim)';
    el.innerHTML = `<span style="font-family:'DM Mono',monospace;font-size:11px;color:${puzzleColor};letter-spacing:1px;font-weight:700;">P${level}</span>`
      + getLevelBadge(xpLvl);
  }
}

function startGame(diff, seed) {
  if (seed === undefined) seed = (Math.random() * 1e6) | 0;
  currentDiff = diff; initialSeed = seed;
  const cfg = CONFIGS[diff]; rows = cfg.r; cols = cfg.c; baseNodes = cfg.n;
  if (!battleActive) writeSave({ level, diff });
  if (battleActive) {
    document.getElementById('battle-pill').style.display   = 'block';
    document.getElementById('battle-game-btn').style.display = 'none';
    document.getElementById('game-chat-btn').style.display  = 'flex';
    const rp = document.getElementById('round-pill');
    rp.style.display = 'block';
    rp.innerText = 'R' + battleRound + '/' + maxRounds;
  } else {
    document.getElementById('battle-pill').style.display   = 'none';
    document.getElementById('battle-game-btn').style.display = 'block';
    document.getElementById('game-chat-btn').style.display  = 'none';
  }
  document.getElementById('diff-label').innerText = diff.toUpperCase();
  document.getElementById('win').classList.add('hidden');
  updateInGameLevelBadge();
  calcSize();

  if (battleActive) {
    // 3-second countdown before puzzle appears in battle mode
    showCountdown(3, () => { generate(); startTimer(); show('game'); });
  } else {
    show('game'); generate(); startTimer();
  }
}

// ── Pre-game countdown overlay ──
function showCountdown(from, onDone) {
  show('game'); // show game screen behind countdown
  let overlay = document.getElementById('countdown-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'countdown-overlay';
    document.body.appendChild(overlay);
  }
  overlay.className = '';
  let n = from;
  const tick = () => {
    overlay.textContent = n;
    overlay.classList.add('pop');
    if (n <= 0) {
      setTimeout(() => { overlay.className = 'gone'; onDone(); }, 350);
      return;
    }
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

function seededRand(s) {
  let t = (s += 0x6D2B79F5) | 0;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
}

// ── Board generation ──
function pathIsAmbiguous(path) {
  // Returns true if any two non-consecutive path cells are grid-adjacent
  // (would create a "shortcut" making the puzzle unsolvable or ambiguous)
  const posMap = new Map(path.map((cell, i) => [cell, i]));
  for (let i = 0; i < path.length; i++) {
    for (const n of nbrs(path[i])) {
      if (!posMap.has(n)) continue;          // hidden cell — fine
      const diff = Math.abs(posMap.get(n) - i);
      if (diff !== 1) return true;           // shortcut found!
    }
  }
  return false;
}

function buildPath(baseSeed) {
  // Generate a non-ambiguous random walk; retry up to 40× per call
  for (let attempt = 0; attempt < 40; attempt++) {
    let s = baseSeed + attempt * 999983;
    const path = [], visited = new Set();
    let curr = Math.floor(seededRand(s++) * rows * cols);
    path.push(curr); visited.add(curr);
    // Target: 55–80% of grid, always at least 2× the node count + padding
    const minPath = Math.max(totalNodes * 3, Math.floor(rows * cols * 0.45));
    const maxPath = Math.floor(rows * cols * 0.80);
    for (let step = 0; step < 1200; step++) {
      if (path.length >= maxPath) break;
      const adj = nbrs(curr).filter(n => !visited.has(n));
      if (!adj.length) break;
      curr = adj[Math.floor(seededRand(s++) * adj.length)];
      path.push(curr); visited.add(curr);
    }
    if (path.length < minPath) continue;    // too short, retry
    if (pathIsAmbiguous(path)) continue;    // shortcut detected, retry
    return path;
  }
  // Fallback: straight horizontal snake (always unambiguous)
  const path = [];
  for (let r = 0; r < rows; r++) {
    const rowCells = [];
    for (let c = 0; c < cols; c++) rowCells.push(r * cols + c);
    path.push(...(r % 2 === 0 ? rowCells : rowCells.reverse()));
  }
  return path.slice(0, Math.floor(path.length * 0.7));
}

function generate() {
  const g = document.getElementById('grid');
  g.innerHTML = ''; cells = []; hiddenSet.clear(); pathIndices = []; solutionPath = []; clearSvg();
  g.style.cssText = `display:grid;background:var(--sf);border-radius:22px;padding:${GPAD}px;`
    + `box-shadow:0 0 0 1px var(--cb),0 0 0 1px rgba(255,255,255,.03) inset,0 28px 70px rgba(0,0,0,.6);`
    + `position:relative;z-index:1;grid-template-columns:repeat(${cols},${cellSize}px);gap:${GAP}px;`;
  for (let i = 0; i < rows * cols; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.style.cssText = `width:${cellSize}px;height:${cellSize}px;`;
    el.dataset.idx = i; g.appendChild(el); cells.push(el);
  }

  totalNodes = Math.min(baseNodes + Math.floor(level / 3), 10);

  const baseSeed = battleActive
    ? (battleSeed + battleRound * 113)
    : (initialSeed + level * 7);

  const path = buildPath(baseSeed);
  solvableCount = path.length;
  solutionPath  = [...path];

  const visited = new Set(path);
  cells.forEach((c, i) => { if (!visited.has(i)) { c.classList.add('hidden-cell'); hiddenSet.add(i); } });

  // Place nodes evenly along path
  for (let i = 1; i <= totalNodes; i++) {
    const pIdx = Math.floor(((i - 1) / (totalNodes - 1)) * (path.length - 1));
    const el = cells[path[pIdx]]; el.dataset.num = i;
    el.innerHTML = `<div class="node">${i}</div>`;
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

// ── Input ──
function cellAt(x, y) {
  const rx = x - gLeft, ry = y - gTop; if (rx < 0 || ry < 0) return -1;
  const step = cellSize + GAP;
  const col = Math.floor(rx / step), row = Math.floor(ry / step);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
  const idx = row * cols + col;
  return (!hiddenSet.has(idx) && idx < cells.length) ? idx : -1;
}
function inGame() { return !document.getElementById('game').classList.contains('hidden'); }

function onDown(e) {
  if (!inGame() || amSpectating) return;
  const t = e.touches ? e.touches[0] : e;
  const idx = cellAt(t.clientX, t.clientY);
  if (idx < 0) return;
  if (pathIndices.length > 0 && idx === pathIndices[pathIndices.length - 1]) { isDrawing = true; return; }
  if (pathIndices.length === 0 || (pathIndices.includes(idx) && idx === pathIndices[0])) {
    resetPath(); const v = parseInt(cells[idx].dataset.num) || 0; if (v && v !== 1) return;
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
  // HARD BLOCK: last node is physically unreachable until all cells are covered
  if (val === totalNodes && (pathIndices.length + 1) < solvableCount) return;
  push(idx);
  if (val === totalNodes) onWin();
}
function onUp() { isDrawing = false; updateHead(); }

function push(i)  { pathIndices.push(i); cells[i].classList.remove('path-head'); cells[i].classList.add('active'); updateHead(); redrawPath(); }
function pop()    { cells[pathIndices[pathIndices.length-1]].classList.remove('path-head'); const i = pathIndices.pop(); cells[i].classList.remove('active','path-head'); updateHead(); redrawPath(); }
function updateHead() { cells.forEach(c => c.classList.remove('path-head')); if (pathIndices.length > 0 && !isDrawing) cells[pathIndices[pathIndices.length-1]].classList.add('path-head'); }
function isAdj(a, b)  { return Math.abs(Math.floor(a/cols) - Math.floor(b/cols)) + Math.abs(a%cols - b%cols) === 1; }
function highNode()   { let h = 0; pathIndices.forEach(i => { const v = parseInt(cells[i].dataset.num) || 0; h = Math.max(h,v); }); return h; }
function resetPath()  { pathIndices.forEach(i => cells[i].classList.remove('active','path-head')); pathIndices = []; isDrawing = false; clearSvg(); }

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
  let d = `M${pts[0].x},${pts[0].y}`; for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x},${pts[i].y}`;
  // Glow layer
  const glow = document.createElementNS('http://www.w3.org/2000/svg','path');
  glow.setAttribute('d', d); glow.setAttribute('stroke','#2dff7f'); glow.setAttribute('stroke-width','9');
  glow.setAttribute('stroke-linecap','round'); glow.setAttribute('stroke-linejoin','round');
  glow.setAttribute('fill','none'); glow.setAttribute('opacity','0.18'); svg.appendChild(glow);
  // Main line
  const el = document.createElementNS('http://www.w3.org/2000/svg','path');
  el.setAttribute('d', d); el.setAttribute('stroke','#2dff7f'); el.setAttribute('stroke-width','4');
  el.setAttribute('stroke-linecap','round'); el.setAttribute('stroke-linejoin','round');
  el.setAttribute('fill','none'); el.setAttribute('opacity','0.65'); svg.appendChild(el);
}
function clearSvg() { document.getElementById('grid-svg').innerHTML = ''; }

// ── Input listeners ──
document.addEventListener('mousedown',  onDown);
document.addEventListener('mousemove',  onMove);
document.addEventListener('mouseup',    onUp);
document.addEventListener('touchstart', onDown, { passive: false });
document.addEventListener('touchmove',  onMove, { passive: false });
document.addEventListener('touchend',   onUp);

// ── Timer ──
function startTimer() {
  clearInterval(timerInt); elapsedSec = 0; timerFrozen = false;
  timerInt = setInterval(() => {
    if (timerFrozen) return;
    elapsedSec++;
    document.getElementById('timer').innerText = fmt(elapsedSec);
    if (battleActive && !amSpectating) broadcastProgress();
  }, 1000);
}
function stopTimer() { clearInterval(timerInt); }
function fmt(s) { return String(s/60|0).padStart(2,'0') + ':' + String(s%60).padStart(2,'0'); }

// ── Cell fill progress bar (shown in game top-bar) ──
function updateFillBar() {
  const pct = solvableCount > 0 ? Math.round((pathIndices.length / solvableCount) * 100) : 0;
  let bar = document.getElementById('fill-bar-inner');
  if (bar) {
    bar.style.width = pct + '%';
    // Turn gold when all filled
    bar.style.background = pct >= 100 ? 'var(--gold)' : 'var(--acc)';
  }
}

function broadcastProgress() {
  const pct = solvableCount > 0 ? Math.round((pathIndices.length / solvableCount) * 100) : 0;
  const msg  = { type:'progress', id:myId, pct, path:[...pathIndices] };
  if (isHost) { progressState[myId] = { pct, done:false, path:[...pathIndices] }; broadcastAll(msg); }
  else if (hostConn && hostConn.open) hostConn.send(msg);
}

// ── Win ──
function onWin() {
  isDrawing = false; stopTimer();
  const sec = elapsedSec, time = fmt(sec);

  if (battleActive) {
    amSpectating = true;
    spawnParticles();
    const xpGain = DIFF_XP[battleDiff] || 20;
    addXp(xpGain);
    if (isHost) {
      hostRegisterFinish(sec, time);
      showSpectateScreen(time);
    } else {
      const cleared = loadSave().totalCleared || 0;
      if (hostConn && hostConn.open)
        hostConn.send({ type:'done', id:myId, name:myName, sec, time,
          rankName:getRank(cleared).name, xpLvl:getXpLevel(loadSave().xp||0) });
      showSpectateScreen(time);
    }
  } else {
    const s = loadSave();
    const newCleared = (s.totalCleared || 0) + 1;
    writeSave({ totalCleared: newCleared, level: level + 1, diff: currentDiff });
    const xpRes = addXp(DIFF_XP[currentDiff] || 20);
    updateMenuProfile();
    document.getElementById('win-time').innerText = 'TIME  ' + time;
    const xrow = document.getElementById('win-xp-row');
    xrow.innerHTML = `<span class="xp-gain">+${xpRes.gained} XP ⬡</span>`;
    const nb = document.getElementById('next-btn');
    nb.classList.remove('ready'); nb.style.display = 'block';
    setTimeout(() => nb.classList.add('ready'), 1100);
    show('win'); spawnParticles();
    syncAccountToCloud().catch(() => {});
  }
}

function nextLevel() {
  level++;
  writeSave({ level, diff: currentDiff });
  updateInGameLevelBadge();
  document.getElementById('continue-btn').classList.remove('hidden');
  document.getElementById('continue-info').innerText = currentDiff.toUpperCase() + ' · LVL ' + level;
  document.getElementById('win').classList.add('hidden');
  show('game'); generate(); startTimer();
}

// ── Window resize ──
window.addEventListener('resize', () => {
  if (!document.getElementById('game').classList.contains('hidden')) {
    calcSize();
    const g = document.getElementById('grid');
    g.style.gridTemplateColumns = `repeat(${cols},${cellSize}px)`;
    cells.forEach(c => c.style.cssText = `width:${cellSize}px;height:${cellSize}px;`);
    requestAnimationFrame(cachePos);
  }
});
