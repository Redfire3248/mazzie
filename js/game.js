// ══════════════════════════════════════════════════
// js/game.js — Puzzle generation, input, timer, win
// ══════════════════════════════════════════════════

// ── Entry points ──
function randSeed() { return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0; }

function startFresh(diff) {
  dailyMode = false; level = 1;
  initialSeed = randSeed();
  startGame(diff, initialSeed);
}
function continueGame() {
  const s = loadSave();
  if (s.level && s.diff) {
    dailyMode = false; level = s.level;
    initialSeed = s.soloSeed || randSeed();
    startGame(s.diff, initialSeed);
  }
}
// Daily challenge: same board for everyone on a given (UTC) day
function todayKey() { return new Date().toISOString().slice(0, 10); }
function startDaily() {
  const key = todayKey();
  let h = 2166136261;
  for (const ch of 'mazzie-daily-' + key) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  dailyMode = true; level = 9;
  startGame('hard', h >>> 0);
}

// ── In-game level badge ──
function updateInGameLevelBadge() {
  const xpLvl = myXpLevel();
  const el = document.getElementById('lvl-badge');
  if (!el) return;
  const tier = levelTier(xpLvl);
  el.className = 'lvl-badge' + (tier > 0 ? ' badge-t' + tier : '');
  if (battleActive) {
    el.innerHTML = getLevelBadge(xpLvl);
  } else if (dailyMode) {
    el.innerHTML = `<span class="lvl-badge-txt" style="color:var(--gold)">DAILY</span>` + getLevelBadge(xpLvl);
  } else {
    const pc = level >= 50 ? '#a78bfa' : level >= 20 ? '#48dbfb' : level >= 10 ? '#2dff7f' : 'var(--dim)';
    el.innerHTML = `<span class="lvl-badge-txt" style="color:${pc}">P${level}</span>` + getLevelBadge(xpLvl);
  }
}

// ── Game start ──
function startGame(diff, seed) {
  if (seed === undefined) seed = randSeed();
  currentDiff = diff; initialSeed = seed;
  const cfg = CONFIGS[diff]; rows = cfg.r; cols = cfg.c; baseNodes = cfg.n;
  if (!battleActive && !dailyMode) writeSave({ level, diff, soloSeed: seed });
  const inBattle = battleActive;
  document.getElementById('battle-pill').style.display     = inBattle ? 'block' : 'none';
  document.getElementById('game-chat-btn').style.display   = inBattle ? 'flex'  : 'none';
  const rp = document.getElementById('round-pill');
  rp.style.display = inBattle ? 'block' : 'none';
  if (inBattle) rp.innerText = 'R' + battleRound + '/' + maxRounds;
  document.getElementById('diff-label').innerText = dailyMode ? 'DAILY · ' + todayKey().slice(5) : diff.toUpperCase();
  document.getElementById('win').classList.add('hidden');
  updateInGameLevelBadge();
  abilityInv = []; renderAbilityBar();
  if (inBattle) {
    document.getElementById('grid').innerHTML = ''; clearSvg();
    showCountdown(3, () => { show('game'); calcSize(); generate(); startTimer(); });
  } else {
    show('game'); calcSize(); generate(); startTimer();
  }
}

// ── Countdown overlay (snappy: 3·2·1·GO in ~2s) ──
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
    overlay.className = '';
    void overlay.offsetWidth; // restart animation
    overlay.className = 'cd-pop';
    overlay.textContent = n > 0 ? n : 'GO!';
    sfx(n > 0 ? 'tick' : 'go');
    if (n <= 0) { setTimeout(() => { overlay.className = 'cd-gone'; }, 380); onDone(); return; }
    n--;
    setTimeout(tick, 560);
  };
  tick();
}

// ── Board sizing — use as much of the phone screen as possible ──
function calcSize() {
  const vv   = window.visualViewport;
  const vw   = vv ? vv.width  : window.innerWidth;
  const vh   = vv ? vv.height : window.innerHeight;
  const game = document.getElementById('game');
  let chrome = 190; // fallback: top bar + ability bar + bottom bar + paddings
  if (!game.classList.contains('hidden')) {
    const tb = game.querySelector('.top-bar').offsetHeight;
    const ab = document.getElementById('ability-bar').offsetHeight;
    const bb = game.querySelector('.bottom-bar').offsetHeight;
    const cs = getComputedStyle(game);
    chrome = tb + ab + bb + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + 34;
  }
  const mW = Math.min(vw - 20, 560);
  const mH = Math.min(vh - chrome, 720);
  cellSize = Math.max(22, Math.min(
    Math.floor((mW - GPAD * 2 - (cols - 1) * GAP) / cols),
    Math.floor((mH - GPAD * 2 - (rows - 1) * GAP) / rows),
    68
  ));
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
// PUZZLE GENERATOR  (seeded random walk)
// ══════════════════════════════════════════════════
function generate() {
  const g = document.getElementById('grid');
  g.innerHTML = ''; g.classList.remove('fogged', 'frosted');
  cells = []; hiddenSet.clear(); pathIndices = []; pathSet = new Set(); curHigh = 0;
  solutionPath = []; obstacleSet = new Set(); pickupMap = new Map();
  inputLockedUntil = 0; shieldUntil = 0; _headEl = null;
  initSvg();
  g.style.gridTemplateColumns = `repeat(${cols},${cellSize}px)`;
  g.style.padding = GPAD + 'px'; g.style.gap = GAP + 'px';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < rows * cols; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.style.width = el.style.height = cellSize + 'px';
    el.dataset.idx = i; frag.appendChild(el); cells.push(el);
  }
  g.appendChild(frag);

  totalNodes = Math.min(baseNodes + Math.floor(level / 3), 10);

  // Seed: battle uses synced seed; solo uses crypto seed per level
  const seed = battleActive
    ? (battleSeed ^ Math.imul(battleRound, 0x9e3779b9)) >>> 0
    : (initialSeed ^ Math.imul(level, 0x6c62272e)) >>> 0;

  const rng    = makeRng(seed);
  const total  = rows * cols;
  const minLen = Math.max(totalNodes * 3, Math.floor(total * 0.50));
  const maxLen = Math.floor(total * 0.82);

  const walk = (start, steps) => {
    const p = [start], v = new Set([start]); let c = start;
    for (let s = 0; s < steps && p.length < maxLen; s++) {
      const adj = nbrs(c).filter(n => !v.has(n));
      if (!adj.length) break;
      // Prefer the neighbour with the fewest free exits (Warnsdorff-ish) 60% of the time → longer walks
      let next;
      if (rng() < 0.6) {
        let best = Infinity, pool = [];
        adj.forEach(n => { const deg = nbrs(n).filter(m => !v.has(m)).length; if (deg < best) { best = deg; pool = [n]; } else if (deg === best) pool.push(n); });
        next = pool[Math.floor(rng() * pool.length)];
      } else next = adj[Math.floor(rng() * adj.length)];
      c = next; p.push(c); v.add(c);
    }
    return p;
  };
  let path = walk(Math.floor(rng() * total), 4000);
  for (let tries = 0; path.length < minLen && tries < 6; tries++) {
    const corner = [0, cols - 1, (rows - 1) * cols, rows * cols - 1][Math.floor(rng() * 4)];
    const p2 = walk(corner, 8000);
    if (p2.length > path.length) path = p2;
  }

  solvableCount = path.length;
  solutionPath  = [...path];
  const onPath = new Set(path);

  cells.forEach((c, i) => { if (!onPath.has(i)) { c.classList.add('hidden-cell'); hiddenSet.add(i); } });

  // ── Node positions ──
  const nodeCells = [];
  for (let i = 1; i <= totalNodes; i++) nodeCells.push(path[Math.floor(((i - 1) / (totalNodes - 1)) * (path.length - 1))]);

  // ── Obstacles (diff-scaled) ──
  const diffObs = { baby: 0, easy: 1, medium: 2, hard: 3, expert: 5 };
  const maxObs  = Math.min((diffObs[currentDiff] || 0) + Math.floor(level / 6), 7);
  if (maxObs > 0) {
    const nearNode = new Set();
    nodeCells.forEach(n => { nearNode.add(n); nbrs(n).forEach(m => nearNode.add(m)); });
    const cands = [];
    for (let i = 0; i < total; i++) {
      if (onPath.has(i) || nearNode.has(i)) continue;
      if (nbrs(i).some(n => onPath.has(n))) cands.push(i);
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    cands.slice(0, maxObs).forEach(idx => {
      obstacleSet.add(idx); hiddenSet.delete(idx);
      cells[idx].classList.remove('hidden-cell'); cells[idx].classList.add('obstacle');
    });
  }

  // ── Numbered nodes ──
  nodeCells.forEach((ci, k) => {
    cells[ci].dataset.num = k + 1;
    cells[ci].innerHTML   = `<div class="node">${k + 1}</div>`;
  });

  // ── Boost pickups (same seed → same spots for every racer) ──
  if (boostsActive()) placePickups(rng, path, new Set(nodeCells));

  isDrawing = false; amSpectating = false;
  updateFillBar();
  requestAnimationFrame(cachePos);
}

function cachePos() {
  const grid = document.getElementById('grid');
  const wrap = document.querySelector('.board-wrap');
  const gr = grid.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  gLeft = gr.left + GPAD; gTop = gr.top + GPAD;
  boardOffX = gr.left - wr.left + GPAD; boardOffY = gr.top - wr.top + GPAD;
  const svg = document.getElementById('grid-svg');
  svg.setAttribute('width', wr.width); svg.setAttribute('height', wr.height);
  svg.setAttribute('viewBox', `0 0 ${wr.width} ${wr.height}`);
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
// INPUT — pointer events, tap-to-extend, swipe interpolation
// ══════════════════════════════════════════════════
function cellAt(x, y) {
  const rx = x - gLeft, ry = y - gTop;
  if (rx < -GAP || ry < -GAP) return -1;
  const step = cellSize + GAP;
  const col = Math.floor((rx + GAP / 2) / step), row = Math.floor((ry + GAP / 2) / step);
  if (col < 0 || col >= cols || row < 0 || row >= rows) return -1;
  const idx = row * cols + col;
  if (hiddenSet.has(idx) || obstacleSet.has(idx)) return -1;
  return idx;
}
function inGame()    { return !document.getElementById('game').classList.contains('hidden'); }
function canPlay()   { return inGame() && !amSpectating && cells.length > 0 && performance.now() >= inputLockedUntil; }
function cellNum(i)  { return (cells[i] && parseInt(cells[i].dataset.num)) || 0; }
function headIdx()   { return pathIndices.length ? pathIndices[pathIndices.length - 1] : -1; }
function isAdj(a, b) {
  if (obstacleSet.has(a) || obstacleSet.has(b)) return false;
  return Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs(a % cols - b % cols) === 1;
}

// Can the path legally step from the current head onto `to`?
function canStep(to) {
  const h = headIdx();
  if (h < 0 || to < 0 || to >= cells.length || !isAdj(h, to)) return false;
  if (hiddenSet.has(to) || obstacleSet.has(to) || pathSet.has(to)) return false;
  const v = cellNum(to);
  if (v && v !== curHigh + 1) return false;
  // The final node only accepts the path once every other cell is covered
  if (v === totalNodes && pathIndices.length + 1 < solvableCount) return false;
  return true;
}

// Try to walk from head to `target`, filling in cells a fast swipe skipped.
function tryReach(target) {
  const h = headIdx(); if (h < 0) return false;
  const hr = Math.floor(h / cols), hc = h % cols, tr = Math.floor(target / cols), tc = target % cols;
  const dr = tr - hr, dc = tc - hc;
  if (Math.abs(dr) + Math.abs(dc) > 5) return false;
  const build = (horizFirst) => {
    const r = []; let cr = hr, cc = hc;
    const stepH = () => { while (cc !== tc) { cc += Math.sign(dc); r.push(cr * cols + cc); } };
    const stepV = () => { while (cr !== tr) { cr += Math.sign(dr); r.push(cr * cols + cc); } };
    if (horizFirst) { stepH(); stepV(); } else { stepV(); stepH(); }
    return r;
  };
  const routes = [build(Math.abs(dc) >= Math.abs(dr)), build(Math.abs(dc) < Math.abs(dr))];
  for (const route of routes) {
    let pushed = 0, ok = true;
    for (const c of route) {
      if (canStep(c)) { push(c, true); pushed++; if (checkWin()) return true; }
      else { ok = false; break; }
    }
    if (ok) { afterPathChange(); return true; }
    while (pushed-- > 0) pop(true);
  }
  afterPathChange();
  return false;
}

function onDown(e) {
  if (!e.isPrimary || !canPlay()) return;
  cachePos();
  const idx = cellAt(e.clientX, e.clientY);
  if (idx < 0) return;
  e.preventDefault();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
  _lastPt = { x: e.clientX, y: e.clientY };
  const h = headIdx();
  if (idx === h) { isDrawing = true; return; }
  if (pathIndices.length === 0 || cellNum(idx) === 1) {
    if (cellNum(idx) !== 1) { flashCell(idx); return; }
    resetPath(); isDrawing = true; push(idx);
  } else if (pathSet.has(idx)) {
    while (headIdx() !== idx) pop(true);
    afterPathChange(); isDrawing = true; sfx('back');
  } else {
    // Tap a cell near the head → extend straight to it
    isDrawing = true;
    if (!tryReach(idx)) flashCell(idx);
  }
}
// Fast swipes jump many pixels between events — walk the finger's line in small
// steps so every cell it actually crossed is visited, in order.
let _lastPt = null;
function onMove(e) {
  if (!isDrawing || !e.isPrimary) return;
  if (!canPlay()) { isDrawing = false; return; }
  e.preventDefault();
  const x = e.clientX, y = e.clientY;
  const from = _lastPt || { x, y };
  const n = Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) / (cellSize * 0.34)));
  for (let s = 1; s <= n && isDrawing; s++) moveTo(cellAt(from.x + (x - from.x) * s / n, from.y + (y - from.y) * s / n));
  _lastPt = { x, y };
}
function moveTo(idx) {
  if (idx < 0) return;
  const h = headIdx(); if (idx === h) return;
  const len = pathIndices.length;
  if (pathSet.has(idx)) {
    // Backtrack along your own path (fast backward swipes pop several cells)
    const pos = pathIndices.lastIndexOf(idx);
    if (len - pos <= 6) { while (headIdx() !== idx) pop(true); afterPathChange(); sfx('back'); }
    return;
  }
  tryReach(idx);
}
function onUp(e) { if (e && e.isPrimary === false) return; isDrawing = false; _lastPt = null; updateHead(); }

function push(i, batch) {
  pathIndices.push(i); pathSet.add(i);
  const v = cellNum(i);
  if (v > curHigh) curHigh = v;
  const el = cells[i];
  el.classList.add('active');
  if (v > 1) { el.classList.add('node-hit'); setTimeout(() => el.classList.remove('node-hit'), 350); sfx('node'); buzz(12); }
  else sfx('step');
  if (pickupMap.has(i)) collectPickup(i);
  if (!batch) afterPathChange();
}
function pop(batch) {
  const i = pathIndices.pop(); if (i === undefined) return;
  pathSet.delete(i);
  cells[i].classList.remove('active', 'path-head');
  if (cellNum(i) === curHigh) curHigh = Math.max(0, curHigh - 1);
  if (!batch) afterPathChange();
}
function undoStep() { if (!canPlay() || pathIndices.length === 0) return; pop(); sfx('back'); }

function afterPathChange() { updateHead(); redrawPath(); updateFillBar(); queueProgress(); }
function checkWin() {
  if (pathIndices.length === solvableCount && cellNum(headIdx()) === totalNodes) { afterPathChange(); onWin(); return true; }
  return false;
}
let _headEl = null;
function updateHead() {
  if (_headEl) _headEl.classList.remove('path-head');
  _headEl = null;
  const h = headIdx();
  if (h >= 0) { _headEl = cells[h]; _headEl.classList.add('path-head'); }
}
function resetPath() {
  pathIndices.forEach(i => cells[i] && cells[i].classList.remove('active', 'path-head'));
  pathIndices = []; pathSet = new Set(); curHigh = 0; isDrawing = false; _headEl = null;
  redrawPath(); updateFillBar(); queueProgress();
}
function flashCell(idx) {
  const el = cells[idx]; if (!el) return;
  el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  sfx('err');
}

// ── Keyboard: arrows / WASD extend, Backspace undoes, 1-3 fire boosts ──
document.addEventListener('keydown', e => {
  if (!inGame() || amSpectating) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (!document.getElementById('admin-term').classList.contains('adm-hidden')) return;
  const dir = { ArrowUp:-cols, KeyW:-cols, ArrowDown:cols, KeyS:cols, ArrowLeft:-1, KeyA:-1, ArrowRight:1, KeyD:1 }[e.code];
  if (dir !== undefined) {
    e.preventDefault(); if (!canPlay()) return;
    const h = headIdx();
    if (h < 0) { const one = cells.findIndex(c => c.dataset.num === '1'); if (one >= 0) push(one); return; }
    if ((dir === 1 || dir === -1) && Math.floor((h + dir) / cols) !== Math.floor(h / cols)) return;
    const t = h + dir;
    if (pathIndices.length >= 2 && t === pathIndices[pathIndices.length - 2]) { pop(); sfx('back'); return; }
    if (canStep(t)) { push(t, true); if (!checkWin()) afterPathChange(); }
    else flashCell(h);
  } else if (e.code === 'Backspace') { e.preventDefault(); undoStep(); }
  else if (e.code === 'KeyR') { resetPath(); }
  else if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') useAbilitySlot(+e.code.slice(-1) - 1);
});

// ── Path drawing (one persistent SVG, geometry cached) ──
const SVGNS = 'http://www.w3.org/2000/svg';
function initSvg() {
  const svg = document.getElementById('grid-svg');
  svg.innerHTML = `<defs><linearGradient id="rainbow-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff4d6a"/><stop offset=".25" stop-color="#ffd700"/><stop offset=".5" stop-color="#2dff7f"/>
      <stop offset=".75" stop-color="#4dfffe"/><stop offset="1" stop-color="#c084fc"/></linearGradient></defs>
    <path id="p-glow" class="p-glow"/><path id="p-line" class="p-line"/><g id="p-hint"></g>`;
}
function cellCenter(idx) {
  const col = idx % cols, row = Math.floor(idx / cols);
  return { x: boardOffX + col * (cellSize + GAP) + cellSize / 2, y: boardOffY + row * (cellSize + GAP) + cellSize / 2 };
}
function pathD(list) {
  if (list.length < 2) return '';
  let d = '';
  list.forEach((idx, i) => { const p = cellCenter(idx); d += (i ? ' L' : 'M') + p.x + ',' + p.y; });
  return d;
}
let _drawQueued = false;
function redrawPath() {
  if (_drawQueued) return; _drawQueued = true;
  requestAnimationFrame(() => {
    _drawQueued = false;
    const d = pathD(pathIndices);
    const g = document.getElementById('p-glow'), l = document.getElementById('p-line');
    if (g) g.setAttribute('d', d);
    if (l) l.setAttribute('d', d);
  });
}
function clearSvg() { const h = document.getElementById('p-hint'); if (h) h.innerHTML = ''; }
function drawHint(list, ms, cls) {
  const layer = document.getElementById('p-hint'); if (!layer || list.length < 2) return;
  const el = document.createElementNS(SVGNS, 'path');
  el.setAttribute('d', pathD(list)); el.setAttribute('class', 'p-hintline ' + (cls || ''));
  layer.appendChild(el);
  setTimeout(() => el.remove(), ms || 3000);
}

// ── Fill progress bar under the top bar ──
function updateFillBar() {
  const bar = document.getElementById('fill-bar'); if (!bar) return;
  const pct = solvableCount ? (pathIndices.length / solvableCount) * 100 : 0;
  bar.style.width = pct + '%';
  const lbl = document.getElementById('fill-txt');
  if (lbl) lbl.innerText = solvableCount ? (solvableCount - pathIndices.length) + ' left' : '';
}

// ── Event listeners ──
(function bindBoard() {
  const wrap = document.querySelector('.board-wrap');
  wrap.addEventListener('pointerdown', onDown);
  wrap.addEventListener('pointermove', onMove, { passive: false });
  wrap.addEventListener('pointerup', onUp);
  wrap.addEventListener('pointercancel', onUp);
  wrap.addEventListener('contextmenu', e => e.preventDefault());
})();

// ══════════════════════════════════════════════════
// TIMER — 100 ms resolution, pausable
// ══════════════════════════════════════════════════
let _timerLast = 0;
function startTimer() {
  clearInterval(timerInt); timerMs = 0; elapsedSec = 0; timerFrozen = false; selfFreezeUntil = 0;
  _timerLast = performance.now();
  renderTimer();
  timerInt = setInterval(tickTimer, 100);
}
function tickTimer() {
  const now = performance.now(), dt = now - _timerLast; _timerLast = now;
  const el = document.getElementById('timer');
  const frozen = timerFrozen || now < selfFreezeUntil;
  el.classList.toggle('frozen', frozen);
  document.getElementById('grid').classList.toggle('frosted', now < inputLockedUntil);
  if (frozen) return;
  timerMs += dt; elapsedSec = Math.floor(timerMs / 1000);
  renderTimer();
}
function renderTimer() {
  document.getElementById('timer').innerHTML = fmt(elapsedSec) + '<small>.' + Math.floor((timerMs % 1000) / 100) + '</small>';
}
function setTimerSec(s) { timerMs = Math.max(0, s) * 1000; elapsedSec = Math.floor(timerMs / 1000); renderTimer(); }
function stopTimer() { clearInterval(timerInt); }
function fmt(s) { s = Math.max(0, Math.floor(s)); return String(s / 60 | 0).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function fmtMs(ms) { const s = Math.floor(ms / 1000); return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0') + '.' + Math.floor((ms % 1000) / 100); }

// ── Battle progress: sent on change, throttled (fast spectating) ──
let _progTimer = null, _progLast = 0;
function queueProgress() {
  if (!battleActive || amSpectating) return;
  if (_progTimer) return;
  const wait = Math.max(0, 180 - (performance.now() - _progLast));
  _progTimer = setTimeout(() => { _progTimer = null; _progLast = performance.now(); broadcastProgress(); }, wait);
}
function broadcastProgress() {
  if (!battleActive || amSpectating) return;
  const pct = solvableCount > 0 ? Math.round((pathIndices.length / solvableCount) * 100) : 0;
  const msg = { type: 'progress', id: myId, pct, path: [...pathIndices] };
  if (isHost) { progressState[myId] = { pct, done: false, path: [...pathIndices] }; broadcastAll(msg); }
  else if (hostConn && hostConn.open) hostConn.send(msg);
}

// ══════════════════════════════════════════════════
// WIN
// ══════════════════════════════════════════════════
function onWin() {
  if (!inGame() || amSpectating) return;
  isDrawing = false; stopTimer();
  const ms = Math.round(timerMs), sec = Math.round(ms / 100) / 10, time = fmtMs(ms);
  sfx('win'); buzz([20, 40, 30]);
  const grid = document.getElementById('grid');
  grid.classList.add('solved');
  setTimeout(() => grid.classList.remove('solved'), 700);

  if (battleActive) {
    amSpectating = true; spawnParticles();
    addXp(DIFF_XP[battleDiff] || 20);
    if (isHost) { hostRegisterFinish(sec, time); showSpectateScreen(time); }
    else {
      if (hostConn && hostConn.open)
        hostConn.send({ type: 'done', id: myId, name: myName, sec, time, path: [...pathIndices],
          rankName: getRank(loadSave().totalCleared || 0).name, xpLvl: myXpLevel() });
      showSpectateScreen(time);
    }
    return;
  }

  // ── Solo / daily ──
  const s = loadSave();
  const base  = DIFF_XP[currentDiff] || 20;
  const par   = solvableCount * 1.1;               // seconds
  const speed = Math.max(0, Math.min(base, Math.round(base * (1 - sec / par))));
  let bonusTxt = speed > 0 ? `<span class="xp-bonus">${ic('bolt')}+${speed} speed</span>` : '';
  let total = base + speed;
  let bestHtml = '';

  if (dailyMode) {
    const daily = s.daily || {};
    const prev = daily[todayKey()];
    const isNew = !prev || ms < prev;
    if (isNew) { daily[todayKey()] = ms; writeSave({ daily }); }
    if (!prev) { total += 50; bonusTxt += `<span class="xp-bonus">${ic('calendar')}+50 daily</span>`; }
    bestHtml = isNew ? '<div class="win-best new">' + ic('star') + 'New daily best</div>' : `<div class="win-best">Daily best ${fmtMs(prev)}</div>`;
    writeSave({ totalCleared: (s.totalCleared || 0) + 1 });
  } else {
    writeSave({ totalCleared: (s.totalCleared || 0) + 1, level: level + 1, diff: currentDiff });
    const prevBest = getBest(currentDiff);
    const isNew = recordBest(currentDiff, ms);
    bestHtml = isNew ? '<div class="win-best new">' + ic('star') + 'New ' + currentDiff + ' best</div>'
                     : `<div class="win-best">Best ${fmtMs(prevBest)}</div>`;
  }
  const xpRes = addXp(total);
  updateMenuProfile();
  document.getElementById('win-time').innerText = time;
  document.getElementById('win-xp-row').innerHTML = `<span class="xp-gain">+${xpRes.gained} XP</span>${bonusTxt}`;
  document.getElementById('win-best').innerHTML = bestHtml;
  const nb = document.getElementById('next-btn');
  nb.style.display = dailyMode ? 'none' : 'block';
  nb.classList.remove('ready');
  setTimeout(() => nb.classList.add('ready'), 250);
  document.getElementById('auto-next-row').style.display = dailyMode ? 'none' : 'flex';
  syncAutoNextToggle();
  setTimeout(() => { show('win'); spawnParticles(); }, 260);
  syncAccountToCloud().catch(() => {});
  if (!dailyMode && getSetting('autoNext', false)) {
    clearTimeout(window._autoNextT);
    window._autoNextT = setTimeout(() => { if (!document.getElementById('win').classList.contains('hidden')) nextLevel(); }, 1500);
  }
}

function nextLevel() {
  clearTimeout(window._autoNextT);
  if (dailyMode) { goMenu(); return; }
  level++;
  initialSeed = randSeed();
  writeSave({ level, diff: currentDiff, soloSeed: initialSeed });
  updateInGameLevelBadge();
  _setupContinueBtn();
  document.getElementById('win').classList.add('hidden');
  abilityInv = []; renderAbilityBar();
  show('game'); calcSize(); generate(); startTimer();
}

function toggleAutoNext() { setSetting('autoNext', !getSetting('autoNext', false)); syncAutoNextToggle(); }
function syncAutoNextToggle() {
  const on = getSetting('autoNext', false);
  const el = document.getElementById('auto-next-toggle');
  if (el) { el.classList.toggle('on', on); el.innerText = on ? 'ON' : 'OFF'; }
}

// Space / Enter on the win screen → next level (fast replays)
document.addEventListener('keydown', e => {
  if (document.getElementById('win').classList.contains('hidden')) return;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); nextLevel(); }
});

// ── Resize / rotate: rescale board and re-align the path line ──
let _rsT = null;
function onViewportResize() {
  clearTimeout(_rsT);
  _rsT = setTimeout(() => {
    if (!inGame() || !cells.length) return;
    calcSize();
    document.getElementById('grid').style.gridTemplateColumns = `repeat(${cols},${cellSize}px)`;
    cells.forEach(c => { c.style.width = c.style.height = cellSize + 'px'; });
    requestAnimationFrame(() => { cachePos(); redrawPath(); });
  }, 60);
}
window.addEventListener('resize', onViewportResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewportResize);
