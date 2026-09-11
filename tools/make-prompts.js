// Generates assets/avatars/PROMPTS.md from tools/avatar-packs.json
// (so the order in every prompt always matches what the slicer names each cell)
const fs = require('fs'), path = require('path');
const packs = JSON.parse(fs.readFileSync(path.join(__dirname, 'avatar-packs.json'), 'utf8'));
const KEYNAME = { '#FF00FF': 'pure magenta #FF00FF', '#00FF00': 'pure green #00FF00', '#0000FF': 'pure blue #0000FF' };
const AVOID   = { '#FF00FF': 'magenta, hot pink or purple-pink', '#00FF00': 'bright green or lime', '#0000FF': 'pure bright blue' };

const layout = (cols, rows) => `LAYOUT (most important — follow exactly):
- One single image, 1536 × 1024 pixels, landscape 3:2.
- An invisible grid of exactly ${cols} columns × ${rows} rows = ${cols * rows} equal square cells, each 256 × 256 px.
- Do NOT draw the grid: no lines, borders, boxes, tiles, cards or panels behind the items.
- Exactly ONE item per cell, centred horizontally and vertically in its cell.
- Every item fills about 65% of its cell and never touches or crosses the cell edge.
  Keep an empty gap of at least 40 px between neighbouring items.
- All ${cols * rows} items are the same size and sit on the same baseline.
- Fill the cells left→right, top→bottom in exactly the order listed below. Do not skip, repeat or add items.`;

const background = key => `BACKGROUND (critical):
- Transparent background: export as a PNG with a real alpha channel. Nothing behind the items.
- If you cannot make it transparent, use ONE perfectly flat solid ${KEYNAME[key] || key} instead,
  and never use ${AVOID[key] || 'that colour'} inside the items.
- No gradient, texture, vignette, floor, shadow, reflection, glow or haze around the items.`;

const styles = {
  game: `STYLE (identical for every character):
- Cute, chunky, flat vector mascot heads (head + shoulders at most), facing the viewer,
  symmetrical, big friendly eyes.
- Use ONLY these 4 colours, on every character:
    black #0B0B14      main body / silhouette
    white #F6F6FB      eyes, teeth, face patches, bright highlights
    grey  #6B6B80      shading, second fur tone, soft shadow shapes
    neon blue #33CCFF  1–2 signature features that identify the character
                       (collar, scarf, stripes, inner ears, gem, glowing eyes, markings)
- Simple cel shading: grey shapes on the shadow side, small white highlights on the top-left.
  Same light direction on all characters.
- Big readable shapes that still read at 48 px: no thin lines, no tiny details.
- Hard clean edges: no gradients, no glow, no 3D, no drop shadows, no texture, no other colours.`,
  colour: `STYLE — full-colour stickers:
- Cute, chunky, flat vector mascot heads (head + shoulders at most), facing the viewer, symmetrical.
- Bright friendly colours with simple cel shading (one shadow tone max), thick dark navy #0B0B14 outline
  of the same weight on every character.
- Big readable shapes that still read at 48 px: no thin lines or tiny details.
- Hard clean edges, no soft gradients, no drop shadows, no texture.`
};
const noText = `ABSOLUTELY NO text, letters, numbers, labels, captions, signatures or watermarks anywhere.`;

let md = `# Avatar art prompts (24 per image)

Each prompt makes **one image containing 24 items** in a 6 × 4 grid. Claude (or you) turns the
sheet into 24 ready-to-use Locker items with one command. The names and unlock levels come from
\`tools/avatar-packs.json\`, in the same order as the list in each prompt.

## How to use

1. Copy a prompt below into an image generator.
   - **ChatGPT / GPT-image (best at grids):** ask for a *1536 × 1024 landscape* image.
   - **Midjourney:** paste the prompt, then add \`--ar 3:2 --style raw --no text, letters, watermark\`.
     Grids are looser there, and the slicer copes with that.
2. Check the result: 24 items, flat background, nothing touching. If not, click regenerate (see Troubleshooting).
3. Download as **PNG** (not JPG, and no upscaling or cropping). Put it in \`tools/sheets/\`, for example \`tools/sheets/critters.png\`.
4. Slice it:
   \`\`\`
   cd tools
   npm install            (first time only)
   node slice-sheet.js sheets/critters.png --pack critters
   \`\`\`
   Or just tell Claude: *"slice tools/sheets/critters.png as the critters pack"*.
5. Look at \`tools/sheets/critters.preview.png\`, then run \`push.bat\`. The items show up in the Locker.

**One prompt per pack.** Every prompt uses the "Mazzie ink" style: dark characters that match the
game's built-in avatars and look right on any avatar colour the player picks.

**Free ChatGPT tip:** you only get a few images a day, so paste the whole prompt exactly as written.
If the first result has 24 good items in the right order, keep it. Small spacing wobbles don't
matter, because the slicer fixes them.

---
`;

for (const [name, p] of Object.entries(packs)) {
  const [cols, rows] = p.grid.split('x').map(Number);
  const list = p.items.map((it, i) => `${String(i + 1).padStart(2)}. ${it.name} — ${it.look}`).join('\n');
  if (p.type === 'icons') {
    md += `
## Icons · ${name} pack

\`\`\`
Create a sprite sheet of ${cols * rows} game avatar icons.

${layout(cols, rows)}

${background(p.key)}

${styles.game}

${noText}

ITEMS, in order:
${list}
\`\`\`

Slice with: \`node slice-sheet.js sheets/${name}.png --pack ${name}\`

---
`;
  } else {
    md += `
## Frames · ${name} pack

\`\`\`
Create a sprite sheet of ${cols * rows} circular avatar frame rings for a game.

${layout(cols, rows).replace('fills about 65% of its cell', 'is a ring whose OUTER diameter is about 80% of its cell')}

RING SHAPE (critical):
- Every frame is a perfect circle ring, seen straight on, centred in its cell.
- The ring's inner hole has a diameter of 72% of the ring's outer diameter, so the ring band is thin.
- The hole is completely empty and transparent (same as the background). Nothing inside it.
- Decorations may stick OUT past the ring by up to 8% of the cell, but never INTO the hole.

${background(p.key)}

STYLE:
- Rich, detailed game UI jewellery with crisp hard edges and bright neon accents on darker base materials.
- Light effects are drawn as solid shapes (highlights, sparkles) and never as blurry glow or haze.
- Consistent thickness and scale across all ${cols * rows} frames.

${noText}

FRAMES, in order:
${list}
\`\`\`

Slice with: \`node slice-sheet.js sheets/${name}.png --pack ${name}\`

---
`;
  }
}

md += `
## Make your own pack

Add a block to \`tools/avatar-packs.json\` (copy an existing one): a unique \`prefix\`, the key colour, and
24 items with \`name\` (max 14 characters), \`lvl\` (unlock level) and \`look\` (a short description for the prompt).
Then run \`node tools/make-prompts.js\` to regenerate this file with your new prompt.

## Troubleshooting

| Problem | Fix |
|---|---|
| Fewer than 24 items, or two in one cell | Regenerate. Add "exactly 24 items, one per cell" to the start of the prompt. |
| Items touch each other | Add "make every item smaller, about 55% of its cell". |
| Grey checkerboard background | The AI faked transparency. Regenerate and stress "flat solid ${KEYNAME['#FF00FF']} background". |
| Soft glow around items | Add "no glow, no haze, hard edges only". Or run the slicer with \`--tol 60,140\`. |
| Part of an item disappeared | That part used the background colour. Change the pack's \`key\` to \`#00FF00\` or \`#0000FF\` and regenerate. |
| Text or labels appeared | Add "no text of any kind" at the very start of the prompt. |
| Wrong order | Rename items in the pack to match the image, or pass \`--names "A,B,C,…"\` to the slicer. |
`;

const out = path.join(__dirname, '..', 'assets', 'avatars', 'PROMPTS.md');
fs.writeFileSync(out, md);
console.log('wrote', out, '(' + Object.keys(packs).length + ' packs)');
