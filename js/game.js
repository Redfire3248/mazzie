// ══════════════════════════════════════════════════
// js/game.js — Puzzle generation, input, timer, win
// ══════════════════════════════════════════════════

// ── Entry points ──
function randSeed() { return crypto.getRandomValues(new Uint32Array(1))[0] >>> 0; }

// ══════════════════════════════════════════════════
// MODIFIERS IN SOLO — the same list rooms use, minus the ones that need other players
// ══════════════════════════════════════════════════
const SOLO_MODS = ['portal', 'oneway', 'locks', 'ghost', 'fog', 'oneshot', 'rush'];
const cleanSolo = l => (Array.isArray(l) ? l : []).filter(k => SOLO_MODS.includes(k));
function soloMods() { try { return cleanSolo(JSON.parse(localStorage.getItem('mz_pieces') || '[]')); } catch (e) { return []; } }
function setSoloMods(list) { try { localStorage.setItem('mz_pieces', JSON.stringify(cleanSolo(list))); } catch (e) {} }
// What is switched on for the board in front of you (the daily is the same for everyone, so it takes none)
function activeMods() { return battleActive ? cleanMods(battleMods) : dailyMode ? [] : soloMods(); }
function modOn(k)     { return activeMods().includes(k); }
function activePieces() { return cleanPieces(activeMods()); }

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
function startDaily(force) {
  const key = todayKey();
  const daily = loadSave().daily || {};
  const done = daily[key];
  if (key in daily && !force) {
    sfx('err'); buzz(20);
    pushToast(`Daily done in ${fmtMs(done)} — next one in ${untilTomorrow()}`, 'info', 'calendar');
    return;
  }
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
    const pc = level >= 50 ? 'var(--xp)' : level >= 20 ? 'var(--cyan)' : level >= 10 ? 'var(--acc)' : 'var(--dim)';
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
  document.getElementById('game-emote-btn').style.display  = inBattle ? 'flex'  : 'none';
  const rp = document.getElementById('round-pill');
  rp.style.display = inBattle ? 'block' : 'none';
  if (inBattle) rp.innerText = 'R' + battleRound + '/' + maxRounds;
  document.getElementById('diff-label').innerText = dailyMode ? 'DAILY · ' + todayKey().slice(5) : diff.toUpperCase();
  document.getElementById('win').classList.add('hidden');
  updateInGameLevelBadge(); updateMyGameAvatar();
  abilityInv = []; renderAbilityBar();
  applyMods(activeMods());
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

// (Seeded PRNG + the puzzle generator itself live in js/puzzle.js)

// ══════════════════════════════════════════════════
// PUZZLE GENERATOR  (seeded random walk)
// ══════════════════════════════════════════════════
let _boardId = 0;   // bumps with every new board (stale timers from an old board check it)
function generate() {
  _boardId++;
  const g = document.getElementById('grid');
  g.innerHTML = ''; g.classList.remove('fogged', 'frosted');
  cells = []; hiddenSet.clear(); pathIndices = []; pathSet = new Set(); curHigh = 0;
  solutionPath = []; obstacleSet = new Set(); pickupMap = new Map();
  portalMap = new Map(); onewayFrom = new Map(); lockPairs = [];
  inputLockedUntil = 0; shieldUntil = 0; _headEl = null;
  initSvg();
  g.style.gridTemplateColumns = `repeat(${cols},${cellSize}px)`;
  g.style.setProperty('--cs', cellSize + 'px');   // number size follows the cell size
  g.style.padding = GPAD + 'px'; g.style.gap = GAP + 'px';
  const frag = document.createDocumentFragment();
  for (let i = 0; i < rows * cols; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.style.width = el.style.height = cellSize + 'px';
    el.dataset.idx = i; frag.appendChild(el); cells.push(el);
  }
  g.appendChild(frag);

  // Seed: battle uses synced seed; solo uses crypto seed per level
  const seed = battleActive
    ? (battleSeed ^ Math.imul(battleRound, 0x9e3779b9)) >>> 0
    : (initialSeed ^ Math.imul(level, 0x6c62272e)) >>> 0;
  const pz = buildPuzzle({ rows, cols, baseNodes, level, diff: currentDiff, seed, pieces: activePieces() });   // js/puzzle.js
  const path = pz.path, nodeCells = pz.nodeCells, rng = pz.rng;
  totalNodes    = pz.totalNodes;
  solvableCount = path.length;
  solutionPath  = [...path];
  const onPath = new Set(path);
  cells.forEach((c, i) => { if (!onPath.has(i)) { c.classList.add('hidden-cell'); hiddenSet.add(i); } });
  pz.obstacles.forEach(idx => {
    obstacleSet.add(idx); hiddenSet.delete(idx);
    cells[idx].classList.remove('hidden-cell'); cells[idx].classList.add('obstacle');
  });

  // ── Numbered nodes ──
  nodeCells.forEach((ci, k) => {
    cells[ci].dataset.num = k + 1;
    cells[ci].innerHTML   = `<div class="node">${k + 1}</div>`;
  });

  // ── Puzzle pieces ──
  buildPieces(pz);

  // ── Boost pickups (same seed → same spots for every racer) ──
  if (boostsActive()) placePickups(rng, path, new Set(nodeCells));

  isDrawing = false; amSpectating = false;
  updateFillBar(); markNextNode();
  requestAnimationFrame(() => { cachePos(); drawPortalLinks(); });
  explainPieces();
}

function cachePos() {
  const grid = document.getElementById('grid');
  const wrap = document.querySelector('.board-wrap');
  const gr = grid.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  // Use layout positions (not the on-screen box) — a troll may be rotating or shrinking the board.
  // The board-wrap transforms around its centre, which stays put, so its layout box is centred there.
  const cx = wr.left + wr.width / 2, cy = wr.top + wr.height / 2;
  gLeft = cx - wrap.offsetWidth / 2 + grid.offsetLeft + GPAD;
  gTop  = cy - wrap.offsetHeight / 2 + grid.offsetTop + GPAD;
  boardOffX = grid.offsetLeft + GPAD; boardOffY = grid.offsetTop + GPAD;
  const svg = document.getElementById('grid-svg');
  svg.setAttribute('width', wrap.offsetWidth); svg.setAttribute('height', wrap.offsetHeight);
  svg.setAttribute('viewBox', `0 0 ${wrap.offsetWidth} ${wrap.offsetHeight}`);
  svg.style.setProperty('--cs', cellSize + 'px');   // trail thickness follows the cell size
  const g = document.getElementById('trail-grad');
  if (g) { g.setAttribute('x1', boardOffX); g.setAttribute('y1', boardOffY); g.setAttribute('x2', boardOffX + grid.offsetWidth); g.setAttribute('y2', boardOffY + grid.offsetHeight); paintTrailGradient(); }
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
function unTroll(x, y) {
  const wrap = document.querySelector('.board-wrap');
  const tf = wrap && getComputedStyle(wrap).transform;
  if (!tf || tf === 'none') return unMod(x, y);
  const r = wrap.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const p = new DOMMatrix(tf).inverse().transformPoint(new DOMPoint(x - cx, y - cy));
  return unMod(cx + p.x, cy + p.y);
}
// Modifiers turn the board itself (#grid) around its own centre — undo that too
function unMod(x, y) {
  const grid = document.getElementById('grid');
  const tf = grid && getComputedStyle(grid).transform;
  if (!tf || tf === 'none') return [x, y];
  const gx = gLeft - GPAD + grid.offsetWidth / 2, gy = gTop - GPAD + grid.offsetHeight / 2;
  const p = new DOMMatrix(tf).inverse().transformPoint(new DOMPoint(x - gx, y - gy));
  return [gx + p.x, gy + p.y];
}
function cellAt(x, y) {
  [x, y] = unTroll(x, y);
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

// Portals count as neighbours; everything else still has to be next door
function isLinked(a, b) { return isAdj(a, b) || (portalMap.get(a) === b && !obstacleSet.has(b)); }
const gridAdj = (a, b) => Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs(a % cols - b % cols) === 1;
function lockKeyOf(c) { const p = lockPairs.find(x => x.lock === c); return p ? p.key : -1; }

// Can the path legally step from the current head onto `to`?
function canStep(to) {
  const h = headIdx();
  if (h < 0 || to < 0 || to >= cells.length || !isLinked(h, to)) return false;
  if (onewayFrom.has(to) && onewayFrom.get(to) !== h) return false;          // one-way: wrong side
  const key = lockKeyOf(to);
  if (key >= 0 && !pathSet.has(key)) return false;                            // locked: key not taken yet
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
  // Portal hop: the twin is across the board, so step straight onto it
  if (portalMap.get(h) === target) {
    if (!canStep(target)) return false;
    portalHopFx(h, target);
    push(target, true); if (checkWin()) return true;
    sfx('ability'); afterPathChange(); return true;
  }
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
  else sfxStep(pathIndices.length);
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

function afterPathChange() { updateHead(); redrawPath(); updateFillBar(); queueProgress(); markNextNode(); refreshLocks(); }
// Locked cells open the moment their key is on your trail (and shut again if you back over it)
function refreshLocks() {
  lockPairs.forEach(p => {
    const open = pathSet.has(p.key);
    if (cells[p.lock]) cells[p.lock].classList.toggle('shut', !open);
    if (cells[p.key])  cells[p.key].classList.toggle('taken', open);
  });
}
// Fog modifier: only the next number stays readable
function markNextNode() {
  document.querySelectorAll('#grid .cell.next-node').forEach(c => c.classList.remove('next-node'));
  const nx = cells.find(c => parseInt(c.dataset.num) === curHigh + 1);
  if (nx) nx.classList.add('next-node');
}
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
  // One Shot: a wrong move costs you the whole path
  if (modOn('oneshot') && pathIndices.length > 1) {
    resetPath(); buzz([30, 20, 30]);
    pushToast('One Shot — path wiped', 'warn', 'target');
    const g = document.getElementById('grid');
    g.classList.remove('oneshot-hit'); void g.offsetWidth; g.classList.add('oneshot-hit');
  }
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
// Trail = neon tube: blurred glow + coloured body + bright core (+ travelling sparks / head crackle)
function initSvg() {
  const svg = document.getElementById('grid-svg');
  svg.innerHTML = `<defs>
      <linearGradient id="trail-grad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="400" y2="400"></linearGradient>
      <filter id="trail-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>
    </defs>
    <path id="p-glow" class="p-glow"/><path id="p-line" class="p-line"/><path id="p-core" class="p-core"/>
    <path id="p-flow" class="p-flow"/>
    <g id="p-head" class="p-head"><circle r="1"/><path d="M-1.8 0H1.8M0 -1.8V1.8M-1.2 -1.2L1.2 1.2M1.2 -1.2L-1.2 1.2"/></g>
    <g id="p-links"></g>
    <g id="p-hint"></g>`;
  paintTrailGradient();
}
function paintTrailGradient() {
  const g = document.getElementById('trail-grad'); if (!g || typeof currentTrail === 'undefined') return;
  const cx = (+g.getAttribute('x1') + +g.getAttribute('x2')) / 2, cy = (+g.getAttribute('y1') + +g.getAttribute('y2')) / 2;
  const spin = currentTrail.spin ? `<animateTransform attributeName="gradientTransform" type="rotate" from="0 ${cx} ${cy}" to="360 ${cx} ${cy}" dur="4s" repeatCount="indefinite"/>` : '';
  g.innerHTML = trailStops(currentTrail) + spin;
}
function cellCenter(idx) {
  const col = idx % cols, row = Math.floor(idx / cols);
  return { x: boardOffX + col * (cellSize + GAP) + cellSize / 2, y: boardOffY + row * (cellSize + GAP) + cellSize / 2 };
}
function pathD(list) {
  if (list.length < 2) return '';
  let d = '';
  list.forEach((idx, i) => { const p = cellCenter(idx); d += (i && gridAdj(list[i - 1], idx) ? ' L' : (i ? ' M' : 'M')) + p.x + ',' + p.y; });
  return d;
}
let _drawQueued = false;
function redrawPath() {
  if (_drawQueued) return; _drawQueued = true;
  requestAnimationFrame(() => {
    _drawQueued = false;
    const d = pathD(pathIndices);
    ['p-glow', 'p-line', 'p-core', 'p-flow'].forEach(id => { const el = document.getElementById(id); if (el) el.setAttribute('d', d); });
    const head = document.getElementById('p-head');
    if (head) {
      const h = headIdx();
      if (h >= 0 && pathIndices.length > 1) { const p = cellCenter(h); head.setAttribute('transform', `translate(${p.x},${p.y}) scale(${cellSize * 0.2})`); head.style.display = ''; }
      else head.style.display = 'none';
    }
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
  startRush();
  _timerLast = performance.now();
  renderTimer();
  timerInt = setInterval(tickTimer, 100);
}
function tickTimer() {
  const now = performance.now(), dt = now - _timerLast; _timerLast = now;
  tickRush(dt);
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
  showWinnerLook();
  const ms = Math.round(timerMs), sec = Math.round(ms / 100) / 10, time = fmtMs(ms);
  sfx('win'); buzz([20, 40, 30]);
  const grid = document.getElementById('grid');
  grid.classList.add('solved');
  setTimeout(() => grid.classList.remove('solved'), 700);

  if (battleActive) {
    amSpectating = true; spawnParticles();
    addXp(DIFF_XP[battleDiff] || 20);
    addCoins(Math.ceil(coinsForWin(battleDiff) / 2));
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

  const firstDaily = dailyMode && !(s.daily || {})[todayKey()];
  if (dailyMode) {
    // One daily per day: the first clear counts, then it locks until tomorrow (startDaily)
    const daily = { ...(s.daily || {}) };
    daily[todayKey()] = ms; writeSave({ daily });
    total += 50; bonusTxt += `<span class="xp-bonus">${ic('calendar')}+50 daily</span>`;
    bestHtml = '<div class="win-best new">' + ic('calendar') + 'Daily done · next in ' + untilTomorrow() + '</div>';
    writeSave({ totalCleared: (s.totalCleared || 0) + 1 });
    updateDailyBtn();
  } else {
    writeSave({ totalCleared: (s.totalCleared || 0) + 1, level: level + 1, diff: currentDiff });
    const prevBest = getBest(currentDiff);
    const isNew = recordBest(currentDiff, ms);
    bestHtml = isNew ? '<div class="win-best new">' + ic('star') + 'New ' + currentDiff + ' best</div>'
                     : `<div class="win-best">Best ${fmtMs(prevBest)}</div>`;
  }
  const xpRes = addXp(total);
  const coinsWon = coinsForWin(currentDiff, speed) + (firstDaily ? 20 : 0);
  addCoins(coinsWon);
  updateMenuProfile();
  document.getElementById('win-time').innerText = time;
  document.getElementById('win-xp-row').innerHTML = `<span class="xp-gain">+${xpRes.gained} XP</span><span class="coin-gain">${coinHtml('+' + coinsWon)}</span>${bonusTxt}`;
  document.getElementById('win-best').innerHTML = bestHtml;
  const nb = document.getElementById('next-btn');
  nb.style.display = dailyMode ? 'none' : 'block';
  nb.classList.remove('ready');
  setTimeout(() => nb.classList.add('ready'), 250);
  document.getElementById('auto-next-row').style.display = dailyMode ? 'none' : 'flex';
  syncAutoNextToggle();
  const bid = _boardId;                              // only if this board is still the current one
  setTimeout(() => { if (bid !== _boardId) return; show('win'); spawnParticles(); }, 260);
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
    document.getElementById('grid').style.setProperty('--cs', cellSize + 'px');
    cells.forEach(c => { c.style.width = c.style.height = cellSize + 'px'; });
    requestAnimationFrame(() => { cachePos(); redrawPath(); drawPortalLinks(); });
  }, 60);
}
window.addEventListener('resize', onViewportResize);
if (window.visualViewport) window.visualViewport.addEventListener('resize', onViewportResize);

// ══════════════════════════════════════════════════
// PUZZLE PIECES — draw them on the board (rules live in canStep / tryReach)
// ══════════════════════════════════════════════════
const PORTAL_TINTS = ['#c084fc', '#48dbfb'];
function dirOf(from, to) {
  if (to === from - cols) return 'up';
  if (to === from + cols) return 'down';
  return to === from - 1 ? 'left' : 'right';
}
function buildPieces(pz) {
  (pz.portals || []).forEach((pair, k) => {
    const [a, b] = pair;
    portalMap.set(a, b); portalMap.set(b, a);
    pair.forEach(c => {
      const el = cells[c]; if (!el) return;
      el.classList.add('portal');
      el.style.setProperty('--pt', PORTAL_TINTS[k % PORTAL_TINTS.length]);
      if (!el.dataset.num) el.innerHTML = '<div class="pc-mark">' + ic('orb') + '</div>';
    });
  });
  (pz.oneways || []).forEach(o => {
    onewayFrom.set(o.cell, o.from);
    const el = cells[o.cell]; if (!el) return;
    el.classList.add('oneway');
    el.dataset.ow = dirOf(o.from, o.cell);
  });
  (pz.locks || []).forEach(p => {
    lockPairs.push(p);
    if (cells[p.lock]) { cells[p.lock].classList.add('lock-cell', 'shut'); if (!cells[p.lock].dataset.num) cells[p.lock].innerHTML = '<div class="pc-mark">' + ic('lock') + '</div>'; }
    if (cells[p.key])  { cells[p.key].classList.add('key-cell');           if (!cells[p.key].dataset.num)  cells[p.key].innerHTML  = '<div class="pc-mark">' + ic('key')  + '</div>'; }
  });
}

// ── Your avatar on the board and on the win card ──
function updateMyGameAvatar() {
  const el = document.getElementById('tb-ava'); if (!el) return;
  el.innerHTML = renderAvatar(getMyAvatar(), myName, 26);
}
function showWinnerLook() {
  const ava = document.getElementById('win-ava'), who = document.getElementById('win-who');
  if (ava) ava.innerHTML = renderAvatar(getMyAvatar(), myName, 74);
  if (who) {
    const t = titleHtml(getMyAvatar());
    who.innerHTML = '<b>' + escapeHtml(myName) + '</b>' + rankChip(myRank()) + (t ? '<span class="win-title-txt">' + t + '</span>' : '');
  }
}

// ══════════════════════════════════════════════════
// RUSH — a countdown per board; run out and your path is wiped (the clock keeps running)
// ══════════════════════════════════════════════════
let rushLeft = 0, rushLimit = 0;
function startRush() {
  const pill = document.getElementById('rush-pill');
  rushLimit = Math.max(12, Math.round(solvableCount * 1.6));
  rushLeft = rushLimit;
  if (pill) { pill.style.display = modOn('rush') ? 'flex' : 'none'; pill.classList.remove('low'); }
  paintRush();
}
function paintRush() {
  const pill = document.getElementById('rush-pill'); if (!pill || !modOn('rush')) return;
  pill.innerHTML = ic('clock') + Math.max(0, Math.ceil(rushLeft)) + 's';
  pill.classList.toggle('low', rushLeft <= 5);
}
function tickRush(dt) {
  if (!modOn('rush') || !inGame() || amSpectating || timerFrozen) return;
  rushLeft -= dt / 1000;
  if (rushLeft <= 0) {
    rushLeft = rushLimit;
    if (pathIndices.length) { resetPath(); sfx('err'); buzz([40, 30, 40]); pushToast('Out of time — path wiped', 'warn', 'clock'); }
  }
  paintRush();
}

// ══════════════════════════════════════════════════
// PORTAL LINKS — a dashed line joins the twins so you can see where a hop lands
// ══════════════════════════════════════════════════
function drawPortalLinks() {
  const layer = document.getElementById('p-links'); if (!layer) return;
  layer.innerHTML = '';
  const done = new Set();
  portalMap.forEach((b, a) => {
    if (done.has(a) || done.has(b)) return;
    done.add(a); done.add(b);
    const p = cellCenter(a), q = cellCenter(b);
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    const off = Math.hypot(q.x - p.x, q.y - p.y) * 0.18;           // bow the line so it never hides the grid lines
    const el = document.createElementNS(SVGNS, 'path');
    el.setAttribute('d', `M${p.x},${p.y} Q${mx - (q.y - p.y) * 0.18},${my + (q.x - p.x) * 0.18} ${q.x},${q.y}`);
    el.setAttribute('class', 'pt-link');
    el.setAttribute('stroke', cells[a].style.getPropertyValue('--pt') || '#c084fc');
    layer.appendChild(el);
  });
}
// The hop itself: both ends flash and the link lights up
function portalHopFx(from, to) {
  [from, to].forEach(c => { const el = cells[c]; if (!el) return; el.classList.remove('pt-hop'); void el.offsetWidth; el.classList.add('pt-hop'); setTimeout(() => el.classList.remove('pt-hop'), 500); });
  const layer = document.getElementById('p-links'); if (!layer) return;
  layer.classList.add('lit'); setTimeout(() => layer.classList.remove('lit'), 500);
}

// ══════════════════════════════════════════════════
// "WHAT IS THIS?" — each piece explains itself the first time you meet it
// ══════════════════════════════════════════════════
function explainPieces() {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('mz_seen_mods') || '[]'); } catch (e) {}
  const here = activeMods().filter(k => MODIFIERS[k] && !seen.includes(k));
  if (!here.length) return;
  here.forEach((k, i) => setTimeout(() => pushToast(MODIFIERS[k].name + ' — ' + MODIFIERS[k].desc, 'info', MODIFIERS[k].icon), 900 + i * 1400));
  try { localStorage.setItem('mz_seen_mods', JSON.stringify([...seen, ...here])); } catch (e) {}
}

// ══════════════════════════════════════════════════
// MODIFIER SHEET (solo) — pick what changes about your boards
// ══════════════════════════════════════════════════
const MOD_GROUPS = [
  { lbl: 'Board pieces', sub: 'change the puzzle itself', keys: ['portal', 'oneway', 'locks'] },
  { lbl: 'Twists',       sub: 'change what you can see',   keys: ['ghost', 'fog'] },
  { lbl: 'Rules',        sub: 'change what a mistake costs', keys: ['oneshot', 'rush'] }
];
function openModsSheet() {
  const el = document.getElementById('mods-sheet'); if (!el) return;
  renderModsSheet();
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.classList.add('in'));
  sfx('tap');
}
function closeModsSheet() {
  const el = document.getElementById('mods-sheet'); if (!el) return;
  el.classList.remove('in');
  setTimeout(() => el.classList.add('hidden'), 200);
  updateModsBtn();
}
function renderModsSheet() {
  const on = soloMods();
  document.getElementById('mods-sheet-body').innerHTML = MOD_GROUPS.map(g => `
    <div class="ms-group">
      <div class="ms-group-lbl">${escapeHtml(g.lbl)}<small>${escapeHtml(g.sub)}</small></div>
      ${g.keys.map(k => {
        const m = MODIFIERS[k]; if (!m) return '';
        return `<button class="ms-card${on.includes(k) ? ' on' : ''}" onclick="toggleSoloMod('${k}')">
          <span class="ms-ic">${ic(m.icon)}</span>
          <span class="ms-txt"><b>${escapeHtml(m.name)}</b><small>${escapeHtml(m.desc)}</small></span>
          <span class="ms-sw"><i></i></span>
        </button>`;
      }).join('')}
    </div>`).join('')
    + `<div class="ms-foot">${ic('info')}These only change your own boards. In a room the host picks them for everyone.</div>`;
}
function toggleSoloMod(k) {
  const cur = soloMods(), on = !cur.includes(k);
  setSoloMods(on ? [...cur, k] : cur.filter(x => x !== k));
  renderModsSheet(); updateModsBtn(); sfx(on ? 'node' : 'back');
}
function clearSoloMods() { setSoloMods([]); renderModsSheet(); updateModsBtn(); sfx('back'); }
function updateModsBtn() {
  const sub = document.getElementById('mods-btn-sub'); if (!sub) return;
  const on = soloMods();
  sub.innerHTML = on.length
    ? on.map(k => `<span class="mb-chip">${ic(MODIFIERS[k].icon)}${escapeHtml(MODIFIERS[k].short || MODIFIERS[k].name)}</span>`).join('')
    : '<span class="mb-off">Plain boards — tap to add a twist</span>';
  const btn = document.getElementById('mods-btn');
  if (btn) btn.classList.toggle('on', !!on.length);
}
