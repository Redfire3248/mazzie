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

// → { path, nodeCells, obstacles, totalNodes, rng }
function buildPuzzle({ rows, cols, baseNodes, level, diff, seed }) {
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
  const onPath = new Set(path);

  // Numbered nodes spread evenly along the path (1 = start, last = end)
  const nodeCells = [];
  for (let i = 1; i <= totalNodes; i++) nodeCells.push(path[Math.floor(((i - 1) / (totalNodes - 1)) * (path.length - 1))]);

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
  return { path, nodeCells, obstacles, totalNodes, rng };
}
