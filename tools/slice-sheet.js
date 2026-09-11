#!/usr/bin/env node
// ══════════════════════════════════════════════════
// tools/slice-sheet.js — turn one AI-generated sprite sheet into Locker items
//
//   node tools/slice-sheet.js <sheet.png> --pack critters
//   node tools/slice-sheet.js <sheet.png> --type icons --grid 6x4 --names "A,B,C" --lvl 3-60
//
// What it does
//   1. Removes the flat key background (magenta / green / any flat colour — auto-detected
//      from the image border) with soft edges and colour de-spill.
//   2. Finds every icon by shape, not by trusting the grid to be exact, and keeps detached
//      bits (sparkles, antennae) with the icon whose cell they sit in.
//   3. Centres each one on a transparent square PNG
//        icons  → 256×256, character fits inside the round avatar
//        frames → 256×256, ring scaled so its hole lines up with the avatar edge
//   4. Writes files to assets/avatars/, appends them to manifest.json (never duplicates),
//      and saves a <sheet>.preview.png next to the sheet so you can eyeball the result.
//
// Options
//   --pack <name>      use names / levels / grid / prefix from tools/avatar-packs.json
//   --type icons|frames   --grid 6x4   --names "A,B"   --lvl 3-60   --prefix cr-
//   --bg #FF00FF       force the key colour (default: detected from the border)
//   --tol 40,110       keying softness: below 40 = background, above 110 = solid
//   --size 256         output size in px
//   --out <dir>        output folder (default assets/avatars)
//   --force            overwrite existing files      --dry   preview only, write nothing
// ══════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
let sharp;
try { sharp = require('sharp'); }
catch (e) { console.error('sharp is missing — run:  cd tools && npm install'); process.exit(1); }

const ROOT = path.join(__dirname, '..');
const args = parseArgs(process.argv.slice(2));
if (!args._[0] || args.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(2, 27).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(args._[0] ? 0 : 1); }

const PACKS = JSON.parse(fs.readFileSync(path.join(__dirname, 'avatar-packs.json'), 'utf8'));
const pack  = args.pack ? PACKS[args.pack] : null;
if (args.pack && !pack) die(`unknown pack "${args.pack}" — packs: ${Object.keys(PACKS).join(', ')}`);

const TYPE   = args.type || (pack && pack.type) || 'icons';
const [COLS, ROWS] = String(args.grid || (pack && pack.grid) || '6x4').split(/x/i).map(Number);
const NAMES  = args.names ? String(args.names).split(',').map(s => s.trim()) : pack ? pack.items.map(i => i.name) : [];
const PREFIX = args.prefix != null ? String(args.prefix) : pack ? pack.prefix : (TYPE === 'frames' ? 'fx-' : 'ai-');
const SIZE   = parseInt(args.size) || 256;
const OUT    = path.resolve(args.out || path.join(ROOT, 'assets', 'avatars'));
const [T0, T1] = String(args.tol || '40,110').split(',').map(Number);
const N = COLS * ROWS;
const levels = (() => {
  if (pack && !args.lvl) return pack.items.map(i => i.lvl);
  const [a, b] = String(args.lvl || (TYPE === 'frames' ? '10-120' : '3-80')).split('-').map(Number);
  return Array.from({ length: N }, (_, i) => Math.round(a + (b - a) * i / Math.max(1, N - 1)));
})();
const AVATAR_IN_FRAME = 1 / 1.36;   // css: .ava-frame-img is 136% of the avatar

main().catch(e => die(e.stack || e.message));

async function main() {
  const file = path.resolve(args._[0]);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const bg = args.bg ? hexRgb(args.bg) : borderColour(data, W, H);
  // Background removal mode:
  //   alpha  – the sheet is already transparent: just use it
  //   global – a chroma key (magenta/green/blue): remove that colour everywhere (needed for frame holes)
  //   flood  – white/black/grey background: remove only background connected to the outside, like a
  //            paint bucket, so white eyes and faces inside characters are kept
  const borderAlpha = borderColour(data, W, H, 3);
  const chroma = Math.max(...bg) - Math.min(...bg) > 120;   // strongly coloured = a key colour
  const MODE = args.mode || (borderAlpha < 16 ? 'alpha' : (chroma || TYPE === 'frames') ? 'global' : 'flood');
  log(`sheet ${W}×${H} · background rgb(${bg.join(',')}) · mode ${MODE} · grid ${COLS}×${ROWS} · ${TYPE}`);
  if (MODE === 'flood' && TYPE === 'frames') warn('frames need a colour key background (magenta/green) — ring holes will not be cut out');

  // ── 1. remove the background (soft edge + un-mix the background colour from edge pixels) ──
  const px = Buffer.from(data);
  const solid = new Uint8Array(W * H);
  const dist = i => Math.sqrt((px[i] - bg[0]) ** 2 + (px[i + 1] - bg[1]) ** 2 + (px[i + 2] - bg[2]) ** 2);
  let reach = null;
  if (MODE === 'flood') {                       // mark background pixels reachable from the border
    reach = new Uint8Array(W * H);
    const q = new Int32Array(W * H); let qh = 0, qt = 0;
    const seed = p => { if (!reach[p] && dist(p * 4) < T1) { reach[p] = 1; q[qt++] = p; } };
    for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
    while (qh < qt) {
      const p = q[qh++], x = p % W;
      if (dist(p * 4) >= T0) continue;           // soft edge pixels are reached but don't spread further
      if (x > 0) seed(p - 1); if (x < W - 1) seed(p + 1); if (p >= W) seed(p - W); if (p < W * (H - 1)) seed(p + W);
    }
  }
  for (let i = 0, p = 0; p < W * H; p++, i += 4) {
    let a;
    if (MODE === 'alpha') a = px[i + 3] / 255;
    else if (MODE === 'flood' && !reach[p]) a = px[i + 3] / 255;
    else a = Math.min(1, Math.max(0, (dist(i) - T0) / (T1 - T0))) * (px[i + 3] / 255);
    if (a <= 0) { px[i] = px[i + 1] = px[i + 2] = px[i + 3] = 0; continue; }
    if (a < 1 && MODE !== 'alpha') for (let c = 0; c < 3; c++) px[i + c] = clamp255((px[i + c] - (1 - a) * bg[c]) / a);
    px[i + 3] = Math.round(a * 255);
    if (a > 0.35) solid[p] = 1;
  }

  // ── 2. find shapes: dilate so an icon's parts join, then label connected regions ──
  const cellW = W / COLS, cellH = H / ROWS;
  const grow  = Math.max(2, Math.round(Math.min(cellW, cellH) * 0.035));
  const joined = dilate(solid, W, H, grow);
  const { labels, count } = label(joined, W, H);
  const stats = Array.from({ length: count + 1 }, () => ({ n: 0, sx: 0, sy: 0, x0: W, y0: H, x1: -1, y1: -1 }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const p = y * W + x; if (!px[p * 4 + 3]) continue;
    const s = stats[labels[p]]; if (!labels[p]) continue;
    s.n++; s.sx += x; s.sy += y;
    if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x; if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
  }
  // Blobs wider/taller than ~1.25 cells are two neighbours glued together by the gap-filling:
  // re-split those with NO gap filling so close-but-separate icons come apart again.
  let nextId = count;
  stats.forEach((s, id) => {
    if (!id || !s.n) return;
    if ((s.x1 - s.x0) < cellW * 1.25 && (s.y1 - s.y0) < cellH * 1.25) return;
    const sub = new Int32Array(W * H), stack = [];
    for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
      const p0 = y * W + x;
      if (labels[p0] !== id || !solid[p0] || sub[p0]) continue;
      const nid = ++nextId; stats[nid] = { n: 0, sx: 0, sy: 0, x0: W, y0: H, x1: -1, y1: -1 };
      sub[p0] = nid; stack.push(p0);
      while (stack.length) {
        const p = stack.pop(), px0 = p % W, py0 = (p / W) | 0;
        for (const q of [px0 > 0 ? p - 1 : -1, px0 < W - 1 ? p + 1 : -1, p - W, p + W])
          if (q >= 0 && q < W * H && labels[q] === id && solid[q] && !sub[q]) { sub[q] = nid; stack.push(q); }
      }
    }
    // move every pixel of the old blob onto its sub-blob (soft edge pixels go to the nearest one)
    for (let y = s.y0; y <= s.y1; y++) for (let x = s.x0; x <= s.x1; x++) {
      const p = y * W + x; if (labels[p] !== id) continue;
      let nid = sub[p];
      if (!nid) for (let r = 1; r <= 3 && !nid; r++) for (const q of [p - r, p + r, p - r * W, p + r * W]) if (q >= 0 && q < W * H && sub[q]) { nid = sub[q]; break; }
      labels[p] = nid || 0;
      if (nid && px[p * 4 + 3]) { const t = stats[nid]; t.n++; t.sx += x; t.sy += y; if (x < t.x0) t.x0 = x; if (x > t.x1) t.x1 = x; if (y < t.y0) t.y0 = y; if (y > t.y1) t.y1 = y; }
    }
    s.n = 0;   // retired
  });

  const minArea = cellW * cellH * 0.004;
  const cells = Array.from({ length: N }, () => []);
  let specks = 0;
  stats.forEach((s, id) => {
    if (!id || !s || !s.n) return;
    const col = Math.min(COLS - 1, Math.max(0, Math.floor(s.sx / s.n / cellW)));
    const row = Math.min(ROWS - 1, Math.max(0, Math.floor(s.sy / s.n / cellH)));
    if (s.n < minArea) {
      // small bits (sparkles, antenna tips) join the icon in their cell; true specks on empty cells are dropped
      if (s.n < minArea * 0.15) { specks++; return; }
    }
    cells[row * COLS + col].push(id);
  });

  // ── 3. cut each cell's shapes out and centre them ──
  if (!args.dry) fs.mkdirSync(OUT, { recursive: true });
  const made = [], tiles = [];
  for (let c = 0; c < N; c++) {
    const name = (NAMES[c] || `${TYPE === 'frames' ? 'Frame' : 'Icon'} ${c + 1}`).slice(0, 14);
    const ids = cells[c];
    if (!ids.length) { warn(`cell ${c + 1} (${name}) is empty — skipped`); continue; }
    const set = new Set(ids);
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    ids.forEach(i => { const s = stats[i]; x0 = Math.min(x0, s.x0); y0 = Math.min(y0, s.y0); x1 = Math.max(x1, s.x1); y1 = Math.max(y1, s.y1); });
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const crop = Buffer.alloc(bw * bh * 4);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const p = (y + y0) * W + (x + x0);
      if (!set.has(labels[p])) continue;
      px.copy(crop, (y * bw + x) * 4, p * 4, p * 4 + 4);
    }
    if (ids.length > 1 && TYPE === 'icons') log(`  ${name}: joined ${ids.length} pieces`);
    if ((x0 < (c % COLS) * cellW - cellW * 0.15) || (x1 > (c % COLS + 1) * cellW + cellW * 0.15))
      warn(`${name} spills far outside its cell — check the preview`);

    let scale, left, top;
    if (TYPE === 'frames') {
      const hole = innerRadius(crop, bw, bh);
      scale = hole > Math.min(bw, bh) * 0.15 ? (SIZE * AVATAR_IN_FRAME / 2) / hole : SIZE / Math.max(bw, bh);
      if (Math.max(bw, bh) * scale > SIZE) {
        const want = scale; scale = SIZE / Math.max(bw, bh);
        if (scale < want * 0.8) warn(`${name}: very wide ornaments — the ring will overlap the avatar edge a bit`);
      }
    } else {
      const fit = SIZE * 0.76;   // leaves room so corners stay inside the round avatar
      scale = Math.min(fit / bw, fit / bh);
    }
    const rw = Math.max(1, Math.round(bw * scale)), rh = Math.max(1, Math.round(bh * scale));
    left = Math.round((SIZE - rw) / 2); top = Math.round((SIZE - rh) / 2);
    const resized = await sharp(crop, { raw: { width: bw, height: bh, channels: 4 } }).resize(rw, rh, { kernel: 'lanczos3' }).png().toBuffer();
    const png = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: resized, left, top }]).png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 }).toBuffer();

    const id = (PREFIX + slug(name)).slice(0, 32);
    const fileName = id + '.png';
    const dest = path.join(OUT, fileName);
    if (!args.dry) {
      if (fs.existsSync(dest) && !args.force) warn(`${fileName} exists — kept the old one (use --force to replace)`);
      else fs.writeFileSync(dest, png);
    }
    made.push({ id, name, file: fileName, lvl: levels[c] || 1 });
    tiles.push(png);
  }

  // ── 4. manifest + preview ──
  if (!args.dry && !args['no-manifest']) {
    const mf = path.join(OUT, 'manifest.json');
    const m = fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : {};
    const key = TYPE === 'frames' ? 'frames' : 'icons';
    m.icons = m.icons || []; m.frames = m.frames || [];
    let added = 0;
    made.forEach(e => { if (!m[key].some(x => x.id === e.id)) { m[key].push(e); added++; } });
    fs.writeFileSync(mf, JSON.stringify(m, null, 2) + '\n');
    log(`manifest: +${added} ${key} (${m[key].length} total)`);
  }
  const prev = file.replace(/\.[a-z]+$/i, '') + '.preview.png';
  await preview(tiles, made, prev);
  log(`${made.length}/${N} ${TYPE} → ${args.dry ? '(dry run, nothing written)' : OUT}${specks ? ` · ignored ${specks} tiny specks` : ''}`);
  log(`preview: ${prev}`);
}

// ── helpers ──
// Median colour of the image border — or, with `channel`, the median of just that channel (3 = alpha)
function borderColour(d, W, H, channel) {
  const ch = [[], [], [], []];
  const take = (x, y) => { const i = (y * W + x) * 4; for (let c = 0; c < 4; c++) ch[c].push(d[i + c]); };
  for (let x = 0; x < W; x += 3) { take(x, 1); take(x, H - 2); }
  for (let y = 0; y < H; y += 3) { take(1, y); take(W - 2, y); }
  const med = a => a.sort((p, q) => p - q)[a.length >> 1];
  return channel != null ? med(ch[channel]) : [med(ch[0]), med(ch[1]), med(ch[2])];
}
function dilate(m, W, H, r) {
  const t = new Uint8Array(W * H), o = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { let c = 0; const row = y * W;
    for (let x = 0; x < Math.min(r, W); x++) c += m[row + x];
    for (let x = 0; x < W; x++) { if (x + r < W) c += m[row + x + r]; if (x - r - 1 >= 0) c -= m[row + x - r - 1]; t[row + x] = c > 0 ? 1 : 0; } }
  for (let x = 0; x < W; x++) { let c = 0;
    for (let y = 0; y < Math.min(r, H); y++) c += t[y * W + x];
    for (let y = 0; y < H; y++) { if (y + r < H) c += t[(y + r) * W + x]; if (y - r - 1 >= 0) c -= t[(y - r - 1) * W + x]; o[y * W + x] = c > 0 ? 1 : 0; } }
  return o;
}
function label(m, W, H) {
  const labels = new Int32Array(W * H), stack = new Int32Array(W * H);
  let count = 0;
  for (let s = 0; s < W * H; s++) {
    if (!m[s] || labels[s]) continue;
    count++; let sp = 0; stack[sp++] = s; labels[s] = count;
    while (sp) {
      const p = stack[--sp], x = p % W;
      const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W];
      for (const q of nb) if (q >= 0 && q < W * H && m[q] && !labels[q]) { labels[q] = count; stack[sp++] = q; }
    }
  }
  return { labels, count };
}
// Radius of the empty hole in a ring: median first-hit distance over 90 rays from the centre
function innerRadius(buf, w, h) {
  const cx = w / 2, cy = h / 2, max = Math.min(w, h) / 2, hits = [];
  for (let k = 0; k < 90; k++) {
    const a = k / 90 * Math.PI * 2, dx = Math.cos(a), dy = Math.sin(a);
    for (let r = 0; r < max; r += 0.5) {
      const x = Math.round(cx + dx * r), y = Math.round(cy + dy * r);
      if (x < 0 || y < 0 || x >= w || y >= h) break;
      if (buf[(y * w + x) * 4 + 3] > 64) { hits.push(r); break; }
    }
  }
  if (!hits.length) return 0;
  hits.sort((p, q) => p - q);
  return hits[hits.length >> 1];
}
async function preview(tiles, made, dest) {
  if (!tiles.length) return;
  const T = 128, pad = 18, cols = Math.min(COLS, tiles.length), rows = Math.ceil(tiles.length / cols);
  const layers = [];
  for (let i = 0; i < tiles.length; i++) {
    const x = pad + (i % cols) * (T + pad), y = pad + Math.floor(i / cols) * (T + pad + 14);
    // a mint avatar circle behind icons (like in the game); frames get a grey avatar in the hole
    const disc = TYPE === 'frames' ? Math.round(T * AVATAR_IN_FRAME) : T;
    const circle = Buffer.from(`<svg width="${T}" height="${T}"><circle cx="${T / 2}" cy="${T / 2}" r="${disc / 2}" fill="${TYPE === 'frames' ? '#3a3a52' : '#2dff7f'}"/></svg>`);
    layers.push({ input: circle, left: x, top: y });
    layers.push({ input: await sharp(tiles[i]).resize(T, T).toBuffer(), left: x, top: y });
    const label = Buffer.from(`<svg width="${T}" height="14"><text x="${T / 2}" y="11" font-family="Consolas,monospace" font-size="11" fill="#9aa" text-anchor="middle">${esc(made[i].name)} · ${made[i].lvl}</text></svg>`);
    layers.push({ input: label, left: x, top: y + T + 1 });
  }
  await sharp({ create: { width: pad + cols * (T + pad), height: pad + rows * (T + pad + 14), channels: 4, background: '#11111b' } })
    .composite(layers).png().toFile(dest);
}
function parseArgs(a) {
  const o = { _: [] };
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) { const k = a[i].slice(2); const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true; o[k] = v; }
    else o._.push(a[i]);
  }
  return o;
}
function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item'; }
function hexRgb(h) { const s = String(h).replace('#', ''); return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16)); }
function clamp255(v) { return v < 0 ? 0 : v > 255 ? 255 : Math.round(v); }
function esc(s) { return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
function log(m)  { console.log(m); }
function warn(m) { console.log('  ! ' + m); }
function die(m)  { console.error('error: ' + m); process.exit(1); }
