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
  if (battleActive) {
    // In battle: show puzzle level (round) + XP level chip
    el.innerHTML = getLevelBadge(xpLvl);
  } else {
    // Solo: show puzzle level number in a coloured pill + XP chip
    const puzzleColor = level >= 50 ? '#a78bfa' : level >= 20 ? '#48dbfb' : level >= 10 ? '#2dff7f' : 'var(--dim)';
    el.innerHTML = `<span style="font-family:'DM Mono',monospace;font-size:11px;color:${puzzleColor};letter-spacing:1px;">P${level}</span>`
      + `&thinsp;` + getLevelBadge(xpLvl);
  }
}

function startGame(diff, seed) {
  if (seed === undefined) seed = (Math.random() * 1e6) | 0;
  currentDiff = diff; initialSeed = seed;
  const cfg = CONFIGS[diff]; rows = cfg.r; cols = cfg.c; baseNodes = cfg.n;
  show('game');
  document.getElementById('diff-label').innerText = diff.toUpperCase();
  updateInGameLevelBadge();
  document.getElementById('win').classList.add('hidden');
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
  calcSize(); generate(); startTimer();
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
// FIX: In battle mode use only battleSeed + battleRound*113 (no `level` offset)
// so all players get identical boards regardless of solo level history.
function generate() {
  const g = document.getElementById('grid');
  g.innerHTML = ''; cells = []; hiddenSet.clear(); pathIndices = []; solutionPath = []; clearSvg();
  g.style.cssText = `display:grid;background:var(--sf);border-radius:20px;padding:${GPAD}px;`
    + `box-shadow:0 0 0 1px var(--cb),0 24px 60px rgba(0,0,0,.5);position:relative;z-index:1;`
    + `grid-template-columns:repeat(${cols},${cellSize}px);gap:${GAP}px;`;
  for (let i = 0; i < rows * cols; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.style.cssText = `width:${cellSize}px;height:${cellSize}px;`;
    el.dataset.idx = i; g.appendChild(el); cells.push(el);
  }

  // Seed: battle mode uses only the synced battleSeed; solo uses initialSeed + level variation
  const baseSeed = battleActive
    ? (battleSeed + battleRound * 113)
    : (initialSeed + level * 7);

  let s = baseSeed, path = [], visited = new Set();
  let curr = Math.floor(seededRand(s++) * rows * cols);
  path.push(curr); visited.add(curr);
  const maxPath = Math.min(rows * cols, Math.max(Math.floor(rows * cols * 0.55) + level * 2, totalNodes * 3 + 10));
  for (let i = 0; i < 600; i++) {
    if (path.length >= maxPath) break;
    const adj = nbrs(curr).filter(n => !visited.has(n));
    if (!adj.length) break;
    curr = adj[Math.floor(seededRand(s++) * adj.length)];
    path.push(curr); visited.add(curr);
  }
  solvableCount = path.length;
  solutionPath = [...path];
  cells.forEach((c, i) => { if (!visited.has(i)) { c.classList.add('hidden-cell'); hiddenSet.add(i); } });
  totalNodes = Math.min(baseNodes + Math.floor(level / 3), 10);
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
