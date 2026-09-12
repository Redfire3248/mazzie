// ══════════════════════════════════════════════════
// js/puzzle.js — Level generator (pure: no DOM, so tools/level-test.js can run it in Node)
//
// A puzzle is one hidden path that visits cells in order:
//   1. seeded random walk (Warnsdorff-ish, so walks stay long) → the solution path
//   2. cells off the path are hidden; numbered nodes are spread evenly along it
//   3. a few obstacles are dropped next to the path (never on it, never next to a node)
// Same seed + same level → exactly the same board (battles rely on this).
// ══════════════════════════════════════════════════

// Seeded PRNG (32-bit Mulberry32)
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ s >>> 15, s | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const OBSTACLES_BY_DIFF = { baby: 0, easy: 1, medium: 2, hard: 3, expert: 5 };

// ── Puzzle pieces: extra rules the player can switch on (solo picker / room modifiers) ──
//   portal  two linked cells; stepping on one comes out the other (the path jumps there)
//   oneway  a cell you may only enter from the side the solution uses
//   locks   a locked cell that opens only once you have stepped on its key
const PIECES = ['portal', 'oneway', 'locks'];
const cleanPieces = list => (Array.isArray(list) ? list : []).filter(k => PIECES.includes(k));

// → { path, nodeCells, obstacles, totalNodes, rng }
function buildPuzzle({ rows, cols, baseNodes, level, diff, seed, pieces }) {
  const total = rows * cols;
  const nb = i => {
    const res = [], r = Math.floor(i / cols), c = i % cols;
    if (r > 0) res.push(i - cols);
    if (r < rows - 1) res.push(i + cols);
    if (c > 0) res.push(i - 1);
    if (c < cols - 1) res.push(i + 1);
    return res;
  };
  // More numbers as levels go up, but never more than the board can space out (≥ 3 cells per number)
  const totalNodes = Math.min(baseNodes + Math.floor(level / 3), 10, Math.max(baseNodes, Math.floor(total * 0.82 / 3)));
  const rng    = makeRng(seed);
  const minLen = Math.max(totalNodes * 3, Math.floor(total * 0.50));
  const maxLen = Math.floor(total * 0.82);

  const walk = (start, steps) => {
    const p = [start], v = new Set([start]); let c = start;
    for (let s = 0; s < steps && p.length < maxLen; s++) {
      const adj = nb(c).filter(n => !v.has(n));
      if (!adj.length) break;
      // Prefer the neighbour with the fewest free exits 60% of the time → longer walks
      let next;
      if (rng() < 0.6) {
        let best = Infinity, pool = [];
        adj.forEach(n => { const deg = nb(n).filter(m => !v.has(m)).length; if (deg < best) { best = deg; pool = [n]; } else if (deg === best) pool.push(n); });
        next = pool[Math.floor(rng() * pool.length)];
      } else next = adj[Math.floor(rng() * adj.length)];
      c = next; p.push(c); v.add(c);
    }
    return p;
  };
  let path = walk(Math.floor(rng() * total), 4000);
  // Short walk? retry from corners (best for long snakes) and random cells, keep the longest
  for (let tries = 0; path.length < minLen && tries < 14; tries++) {
    const corner = tries % 2 ? Math.floor(rng() * total) : [0, cols - 1, (rows - 1) * cols, rows * cols - 1][Math.floor(rng() * 4)];
    const p2 = walk(corner, 8000);
    if (p2.length > path.length) path = p2;
  }
  // ── Pieces ──
  const man = (a, b) => Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs(a % cols - b % cols);
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const want = new Set(cleanPieces(pieces));

  // Portals: cut a chunk out of the walk — the two loose ends become a linked pair,
  // so the solution now has to hop across the board. Cut cells just become hidden.
  const portals = [];
  if (want.has('portal')) {
    const many = path.length >= 34 ? 2 : 1;
    for (let p = 0; p < many && path.length >= 16; p++) {
      for (let t = 0; t < 60; t++) {
        const n = path.length;
        const i = 3 + Math.floor(rng() * Math.max(1, n - 12));
        const cut = 2 + Math.floor(rng() * Math.max(1, Math.min(7, Math.floor(n * 0.18))));
        const j = i + cut + 1;
        if (j > n - 4) continue;
        const a = path[i], b = path[j];
        if (man(a, b) < 3) continue;                                  // must be a real jump
        if (n - cut < totalNodes * 3) continue;                       // keep room to space the numbers
        if (portals.some(pr => pr.includes(a) || pr.includes(b))) continue;
        const drop = path.slice(i + 1, j);
        if (drop.some(c => portals.some(pr => pr.includes(c)))) continue;   // never cut away an earlier portal
        path.splice(i + 1, cut);
        portals.push([a, b]);
        break;
      }
    }
  }
  const onPath = new Set(path);

  // Numbered nodes spread evenly along the path (1 = start, last = end)
  const portalCells = new Set(portals.flat());
  const nodePos = [];
  for (let i = 1; i <= totalNodes; i++) nodePos.push(Math.floor(((i - 1) / (totalNodes - 1)) * (path.length - 1)));
  // A number on a portal cell reads as one thing doing two jobs — nudge it one step along the path
  const freeAt = p => p > 0 && p < path.length - 1 && !portalCells.has(path[p]);
  for (let k = 1; k < nodePos.length - 1; k++) {
    if (!portalCells.has(path[nodePos[k]])) continue;
    let moved = false;
    for (let d = 1; d <= 4 && !moved; d++) {
      for (const p of [nodePos[k] + d, nodePos[k] - d]) {
        if (p <= nodePos[k - 1] || p >= nodePos[k + 1] || !freeAt(p)) continue;
        nodePos[k] = p; moved = true; break;
      }
    }
    // No gap either side? push a neighbour along to make one
    if (!moved) {
      const up = nodePos[k] + 1, dn = nodePos[k] - 1;
      if (freeAt(up) && nodePos[k + 1] > up && nodePos[k + 1] - 1 > up) { nodePos[k] = up; moved = true; }
      else if (freeAt(up) && k + 1 < nodePos.length - 1 && nodePos[k + 2] > nodePos[k + 1] + 1) { nodePos[k + 1]++; nodePos[k] = up; moved = true; }
      else if (freeAt(dn) && k - 1 > 0 && nodePos[k - 1] - 1 > nodePos[k - 2]) { nodePos[k - 1]--; nodePos[k] = dn; moved = true; }
    }
  }
  const nodeCells = nodePos.map(p => path[p]);

  // One-way cells: only enterable from the side the solution came from
  const nodeSet = new Set(nodeCells), taken = new Set(portals.flat());
  const oneways = [];
  if (want.has('oneway')) {
    const cands = [];
    for (let i = 2; i < path.length - 1; i++) {
      if (nodeSet.has(path[i]) || taken.has(path[i]) || taken.has(path[i - 1])) continue;
      if (man(path[i - 1], path[i]) !== 1) continue;                   // never straight after a portal hop
      cands.push(i);
    }
    const max = Math.min(4, 1 + Math.floor(level / 7));
    for (const i of shuffle(cands)) {
      if (oneways.length >= max) break;
      if (oneways.some(o => Math.abs(o.at - i) < 3)) continue;
      oneways.push({ at: i, cell: path[i], from: path[i - 1] });
      taken.add(path[i]);
    }
  }

  // Locks: a cell that stays shut until you have stepped on its key (always earlier on the path)
  const locks = [];
  if (want.has('locks')) {
    const free = i => !nodeSet.has(path[i]) && !taken.has(path[i]);
    const many = path.length >= 30 ? 2 : 1;
    for (let p = 0; p < many; p++) {
      for (let t = 0; t < 60; t++) {
        const li = 6 + Math.floor(rng() * Math.max(1, path.length - 7));
        const ki = 1 + Math.floor(rng() * Math.max(1, li - 4));
        if (li >= path.length || ki > li - 4) continue;
        if (!free(li) || !free(ki)) continue;
        locks.push({ lock: path[li], key: path[ki] });
        taken.add(path[li]); taken.add(path[ki]);
        break;
      }
    }
  }

  // Obstacles: beside the path, never on it, never touching a node
  const obstacles = [];
  const maxObs = Math.min((OBSTACLES_BY_DIFF[diff] || 0) + Math.floor(level / 6), 7);
  if (maxObs > 0) {
    const nearNode = new Set();
    nodeCells.forEach(n => { nearNode.add(n); nb(n).forEach(m => nearNode.add(m)); });
    const cands = [];
    for (let i = 0; i < total; i++) {
      if (onPath.has(i) || nearNode.has(i)) continue;
      if (nb(i).some(n => onPath.has(n))) cands.push(i);
    }
    for (let i = cands.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [cands[i], cands[j]] = [cands[j], cands[i]]; }
    obstacles.push(...cands.slice(0, maxObs));
  }
  return { path, nodeCells, obstacles, totalNodes, rng, portals, oneways: oneways.map(o => ({ cell: o.cell, from: o.from })), locks };
}
