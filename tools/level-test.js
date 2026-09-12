// Level generator tests: runs js/puzzle.js (the real generator) outside the browser
// on thousands of seeds for every difficulty and many levels.   node tools/level-test.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
const ctx = vm.createContext({ Math, console });
const { CONFIGS, buildPuzzle, PIECES } = vm.runInContext(read('state.js') + '\n' + read('puzzle.js') + '\n;({ CONFIGS, buildPuzzle, PIECES })', ctx);
// Every puzzle runs twice: plain, and with all three puzzle pieces switched on
const PIECE_SETS = [[], ['portal', 'oneway', 'locks']];

const LEVELS = [...Array(60).keys()].map(i => i + 1).concat([75, 100, 150, 200, 300, 500, 1000]);
const SEEDS_PER = +process.argv[2] || 150;
let checked = 0, failures = [];
const stats = {};
const fail = (what, info) => { if (failures.length < 25) failures.push(what + '  ' + JSON.stringify(info)); else failures.length++; };

// Replays a path through the SAME rules the game uses for a player's moves (game.js canStep)
function playerCanFinish(p, rows, cols) {
  const portal = new Map(); (p.portals || []).forEach(([a, b]) => { portal.set(a, b); portal.set(b, a); });
  const oneway = new Map((p.oneways || []).map(o => [o.cell, o.from]));
  const lockKey = new Map((p.locks || []).map(l => [l.lock, l.key]));
  const hidden = new Set(), onPath = new Set(p.path), obst = new Set(p.obstacles);
  for (let i = 0; i < rows * cols; i++) if (!onPath.has(i) && !obst.has(i)) hidden.add(i);
  const num = new Map(p.nodeCells.map((c, k) => [c, k + 1]));
  const adj = (a, b) => !obst.has(a) && !obst.has(b) && Math.abs(Math.floor(a / cols) - Math.floor(b / cols)) + Math.abs(a % cols - b % cols) === 1;
  const visited = new Set();
  let high = 0;
  for (let k = 0; k < p.path.length; k++) {
    const to = p.path[k];
    if (k === 0) { if (num.get(to) !== 1) return 'path does not start on node 1'; visited.add(to); high = 1; continue; }
    const h = p.path[k - 1];
    if (!adj(h, to) && portal.get(h) !== to) return 'step ' + k + ' not adjacent (and not a portal hop)';
    if (oneway.has(to) && oneway.get(to) !== h) return 'step ' + k + ' enters a one-way cell from the wrong side';
    if (lockKey.has(to) && !visited.has(lockKey.get(to))) return 'step ' + k + ' enters a locked cell before its key';
    if (hidden.has(to) || obst.has(to) || visited.has(to)) return 'step ' + k + ' onto blocked/visited cell';
    const v = num.get(to) || 0;
    if (v && v !== high + 1) return 'node ' + v + ' reached out of order';
    if (v === p.totalNodes && k + 1 < p.path.length) return 'last node reached before covering every cell';
    if (v > high) high = v;
    visited.add(to);
  }
  if (high !== p.totalNodes) return 'finished without reaching the last node';
  return null;
}

for (const [diff, cfg] of Object.entries(CONFIGS)) {
  const st = stats[diff] = { boards: 0, minLen: Infinity, maxLen: 0, sumCover: 0, short: 0, obstacles: 0, nodes: new Set() };
  for (const level of LEVELS) {
    for (let s = 0; s < SEEDS_PER; s++) {
      const seed = (Math.imul(s + 1, 2654435761) ^ Math.imul(level, 0x6c62272e)) >>> 0;
     for (const pieces of PIECE_SETS) {
      const args = { rows: cfg.r, cols: cfg.c, baseNodes: cfg.n, level, diff, seed, pieces };
      const p = buildPuzzle(args);
      checked++; if (!pieces.length) st.boards++;
      const total = cfg.r * cfg.c, info = { diff, level, seed, pieces: pieces.join('+') || 'none' };

      // 1. Determinism (battles give everyone the same seed)
      const again = buildPuzzle(args);
      if (JSON.stringify(again.path) !== JSON.stringify(p.path) || JSON.stringify(again.obstacles) !== JSON.stringify(p.obstacles)) fail('not deterministic', info);
      // 2. Path: unique cells, inside the board
      if (new Set(p.path).size !== p.path.length) fail('path repeats a cell', info);
      if (p.path.some(c => c < 0 || c >= total)) fail('path leaves the board', info);
      // 3. Nodes: right count, all different, in order along the path, first/last at the ends
      if (p.nodeCells.length !== p.totalNodes) fail('wrong node count', info);
      if (new Set(p.nodeCells).size !== p.nodeCells.length) fail('two numbers on one cell', { ...info, len: p.path.length, nodes: p.totalNodes });
      const pos = p.nodeCells.map(c => p.path.indexOf(c));
      if (pos.some((x, i) => i && x <= pos[i - 1])) fail('numbers out of order', info);
      if (pos[0] !== 0 || pos[pos.length - 1] !== p.path.length - 1) fail('first/last number not at the path ends', info);
      // 4. Obstacles never on the path or touching a number
      const onPath = new Set(p.path);
      if (p.obstacles.some(o => onPath.has(o))) fail('obstacle on the path', info);
      if (new Set(p.obstacles).size !== p.obstacles.length) fail('duplicate obstacle', info);
      // 5. A player following the game's own rules can finish it
      const why = playerCanFinish(p, cfg.r, cfg.c);
      if (why) fail('unsolvable: ' + why, info);
      // 6. Pieces sit where they should
      const idx = new Map(p.path.map((c, i) => [c, i]));
      if (!pieces.length && (p.portals.length || p.oneways.length || p.locks.length)) fail('pieces appeared while switched off', info);
      p.portals.forEach(([a, b]) => {
        if (!idx.has(a) || !idx.has(b)) fail('portal off the path', info);
        else if (Math.abs(idx.get(a) - idx.get(b)) !== 1) fail('portal ends are not consecutive on the path', info);
        if (Math.abs(Math.floor(a / cfg.c) - Math.floor(b / cfg.c)) + Math.abs(a % cfg.c - b % cfg.c) < 3) fail('portal hop too short', info);
      });
      p.oneways.forEach(o => {
        if (idx.get(o.cell) !== idx.get(o.from) + 1) fail('one-way entry side is not the solution step', info);
        if (p.nodeCells.includes(o.cell)) fail('one-way on a numbered cell', info);
      });
      p.locks.forEach(l => {
        if (!(idx.get(l.key) < idx.get(l.lock))) fail('key comes after its lock', info);
        if (p.nodeCells.includes(l.lock) || p.nodeCells.includes(l.key)) fail('lock/key on a numbered cell', info);
      });

      if (!pieces.length) { st.minLen = Math.min(st.minLen, p.path.length); st.maxLen = Math.max(st.maxLen, p.path.length);
      st.sumCover += p.path.length / total; st.obstacles += p.obstacles.length; st.nodes.add(p.totalNodes); }
      const want = Math.max(p.totalNodes * 3, Math.floor(total * 0.5));
      if (!pieces.length && p.path.length < Math.min(want, Math.floor(total * 0.82))) st.short++;
     }
    }
  }
}

console.log('Level generator — ' + checked.toLocaleString() + ' puzzles (' + LEVELS.length + ' levels × ' + SEEDS_PER + ' seeds × 5 difficulties)\n');
console.log('difficulty  board   path length   avg cover   shorter than target   avg obstacles   numbers');
for (const [d, st] of Object.entries(stats)) {
  const cfg = CONFIGS[d];
  console.log(d.padEnd(11) + ' ' + (cfg.r + '×' + cfg.c).padEnd(7) + ' ' + (st.minLen + '–' + st.maxLen).padEnd(13) + ' ' + (Math.round(st.sumCover / st.boards * 100) + '%').padEnd(11) + ' '
    + ((st.short / st.boards * 100).toFixed(1) + '%').padEnd(21) + ' ' + (st.obstacles / st.boards).toFixed(1).padEnd(15) + ' ' + [...st.nodes].sort((a, b) => a - b).join(','));
}
console.log();
if (failures.length) { console.log(failures.length + ' FAILURES'); failures.slice(0, 25).forEach(f => console.log('  ' + f)); process.exit(1); }
console.log('All checks passed: every puzzle is deterministic, has a clean path, ordered numbers, no blocking obstacles, and can be finished.');
