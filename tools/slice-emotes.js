#!/usr/bin/env node
// ══════════════════════════════════════════════════
// tools/slice-emotes.js — cut an emote sheet that has a dark, glowing, teal-tinted background
// (the kind image AIs produce when they ignore "transparent").
//
//   node tools/slice-emotes.js sheets/emotes.png            (uses the "emotes" pack for names/grid)
//   --pack emotes  --out ../assets/emotes  --dry  --force  --style badge|cut
//
// Works cell by cell (the sheet must follow the grid).
//   badge (default) – keeps each emote on its own glowing background as a rounded sticker tile
//                     (safe: nothing is lost, even when the character's accents match the glow)
//   cut             – tries to remove the teal background (green AND blue above red), flooding in
//                     from each cell's edges; only good when the accents are NOT the background's colour
// ══════════════════════════════════════════════════
const fs = require('fs'), path = require('path');
const sharp = require('sharp');
const args = { _: [] };
process.argv.slice(2).forEach((a, i, all) => { if (a.startsWith('--')) { const k = a.slice(2), n = all[i + 1]; args[k] = n && !n.startsWith('--') ? n : true; } else if (!String(all[i - 1] || '').startsWith('--') || all[i - 1] === '--dry' || all[i - 1] === '--force') args._.push(a); });
const ROOT = path.join(__dirname, '..');
const pack = JSON.parse(fs.readFileSync(path.join(__dirname, 'avatar-packs.json'), 'utf8'))[args.pack || 'emotes'];
const [COLS, ROWS] = pack.grid.split('x').map(Number);
const OUT = path.resolve(args.out || path.join(ROOT, 'assets', 'emotes'));
const SIZE = 256, FIT = 0.84;
const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

(async () => {
  const file = path.resolve(args._[0] || path.join(__dirname, 'sheets', 'emotes.png'));
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, cw = Math.floor(W / COLS), ch = Math.floor(H / ROWS);
  // How "background" a pixel looks (0 = definitely character, 1 = definitely background)
  const bgLike = (r, g, b) => { const t = Math.min(g, b) - r; if (r > 26 || t < 1) return 0; return Math.min(1, t / 6) * Math.min(1, (28 - r) / 12); };
  if (!args.dry) fs.mkdirSync(OUT, { recursive: true });
  const made = [], tiles = [];
  const style = args.style || 'badge';
  if (style === 'badge') {
    // Rounded-square mask with a soft edge; a little inset so neighbouring cells never bleed in
    const inset = Math.round(cw * 0.03), r = Math.round(cw * 0.26);
    const mask = Buffer.from(`<svg width="${cw}" height="${ch}"><defs><filter id="f"><feGaussianBlur stdDeviation="3"/></filter></defs>
      <rect x="${inset}" y="${inset}" width="${cw - inset * 2}" height="${ch - inset * 2}" rx="${r}" fill="#fff" filter="url(#f)"/></svg>`);
    for (let c = 0; c < COLS * ROWS; c++) {
      const ox = (c % COLS) * cw, oy = Math.floor(c / COLS) * ch;
      const name = (pack.items[c] || { name: 'Emote ' + (c + 1) }).name;
      const tile = await sharp(file).extract({ left: ox, top: oy, width: cw, height: ch })
        .composite([{ input: mask, blend: 'dest-in' }]).resize(SIZE, SIZE, { kernel: 'lanczos3' })
        .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 }).toBuffer();
      const idStr = (pack.prefix + slug(name)).slice(0, 32), fileName = idStr + '.png';
      if (!args.dry) { const dest = path.join(OUT, fileName); if (fs.existsSync(dest) && !args.force) console.warn('  ! ' + fileName + ' exists (use --force)'); else fs.writeFileSync(dest, tile); }
      made.push({ id: idStr, name, file: fileName }); tiles.push(tile);
    }
  }
  for (let c = 0; style === 'cut' && c < COLS * ROWS; c++) {
    const ox = (c % COLS) * cw, oy = Math.floor(c / COLS) * ch;
    const n = cw * ch, a = new Float32Array(n).fill(1), seen = new Uint8Array(n), q = new Int32Array(n);
    const P = (x, y) => { const i = ((oy + y) * W + (ox + x)) * 4; return bgLike(data[i], data[i + 1], data[i + 2]); };
    let qh = 0, qt = 0;
    const seed = (x, y) => { const p = y * cw + x; if (!seen[p] && P(x, y) > 0.3) { seen[p] = 1; q[qt++] = p; } };
    for (let x = 0; x < cw; x++) { seed(x, 0); seed(x, ch - 1); }
    for (let y = 0; y < ch; y++) { seed(0, y); seed(cw - 1, y); }
    while (qh < qt) {
      const p = q[qh++], x = p % cw, y = (p / cw) | 0, v = P(x, y);
      a[p] = Math.max(0, 1 - v * 1.5);
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
        if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
        const np = ny * cw + nx; if (seen[np]) continue;
        if (P(nx, ny) > 0.12) { seen[np] = 1; q[qt++] = np; }
      }
    }
    // Drop specks: keep solid components ≥ 0.4% of the cell (the mascot + its props)
    const lab = new Int32Array(n); let id = 0; const sizes = [0];
    for (let p = 0; p < n; p++) {
      if (a[p] < 0.5 || lab[p]) continue;
      id++; sizes[id] = 0; const st = [p]; lab[p] = id;
      while (st.length) { const s = st.pop(); sizes[id]++; const x = s % cw;
        for (const t of [x > 0 ? s - 1 : -1, x < cw - 1 ? s + 1 : -1, s - cw, s + cw]) if (t >= 0 && t < n && !lab[t] && a[t] >= 0.5) { lab[t] = id; st.push(t); } }
    }
    const minKeep = n * 0.004;
    // soft edge pixels (0 < a < .5) belong to whatever solid neighbour they touch
    let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
    const rgba = Buffer.alloc(n * 4);
    for (let p = 0; p < n; p++) {
      let keep = a[p] >= 0.5 ? sizes[lab[p]] >= minKeep : false;
      if (!keep && a[p] > 0 && a[p] < 0.5) { const x = p % cw; for (const t of [p - 1, p + 1, p - cw, p + cw]) if (t >= 0 && t < n && Math.abs((t % cw) - x) <= 1 && a[t] >= 0.5 && sizes[lab[t]] >= minKeep) { keep = true; break; } }
      if (!keep) continue;
      const x = p % cw, y = (p / cw) | 0, i = ((oy + y) * W + (ox + x)) * 4;
      rgba[p * 4] = data[i]; rgba[p * 4 + 1] = data[i + 1]; rgba[p * 4 + 2] = data[i + 2]; rgba[p * 4 + 3] = Math.round(a[p] * 255);
      if (a[p] >= 0.5) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    const name = (pack.items[c] || { name: 'Emote ' + (c + 1) }).name;
    if (x1 < 0) { console.warn('  ! ' + name + ': nothing found'); continue; }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const crop = await sharp(rgba, { raw: { width: cw, height: ch, channels: 4 } }).extract({ left: x0, top: y0, width: bw, height: bh }).png().toBuffer();
    const sc = Math.min(SIZE * FIT / bw, SIZE * FIT / bh);
    const rw = Math.round(bw * sc), rh = Math.round(bh * sc);
    const resized = await sharp(crop).resize(rw, rh, { kernel: 'lanczos3' }).png().toBuffer();
    const png = await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: resized, left: Math.round((SIZE - rw) / 2), top: Math.round((SIZE - rh) / 2) }])
      .png({ compressionLevel: 9, palette: true, quality: 92, effort: 10 }).toBuffer();
    const idStr = (pack.prefix + slug(name)).slice(0, 32), fileName = idStr + '.png';
    if (!args.dry) { const dest = path.join(OUT, fileName); if (fs.existsSync(dest) && !args.force) console.warn('  ! ' + fileName + ' exists (use --force)'); else fs.writeFileSync(dest, png); }
    made.push({ id: idStr, name, file: fileName }); tiles.push(png);
  }
  if (!args.dry) fs.writeFileSync(path.join(OUT, 'emotes.json'), JSON.stringify({ emotes: made }, null, 2) + '\n');
  // Preview on the game's dark background
  const T = 128, cols = COLS, rows = Math.ceil(tiles.length / cols);
  const comps = await Promise.all(tiles.map(async (t, i) => ({ input: await sharp(t).resize(T, T).png().toBuffer(), left: (i % cols) * (T + 12) + 12, top: Math.floor(i / cols) * (T + 12) + 12 })));
  const prev = file.replace(/\.[a-z]+$/i, '') + '.preview.png';
  await sharp({ create: { width: cols * (T + 12) + 12, height: rows * (T + 12) + 12, channels: 4, background: { r: 17, g: 17, b: 27, alpha: 1 } } }).composite(comps).png().toFile(prev);
  console.log(made.length + '/' + COLS * ROWS + ' emotes → ' + (args.dry ? '(dry run)' : OUT) + '\npreview: ' + prev);
})();
