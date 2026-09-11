# Avatar art prompts (24 per image)

Each prompt makes **one image containing 24 items** in a 6 × 4 grid. Claude (or you) turns the
sheet into 24 ready-to-use Locker items with one command. The names and unlock levels come from
`tools/avatar-packs.json`, in the same order as the list in each prompt.

## How to use

1. Copy a prompt below into an image generator.
   - **ChatGPT / GPT-image (best at grids):** ask for a *1536 × 1024 landscape* image.
   - **Midjourney:** paste the prompt, then add `--ar 3:2 --style raw --no text, letters, watermark`.
     Grids are looser there, and the slicer copes with that.
2. Check the result: 24 items, flat background, nothing touching. If not, click regenerate (see Troubleshooting).
3. Download as **PNG** (not JPG, and no upscaling or cropping). Put it in `tools/sheets/`, for example `tools/sheets/critters.png`.
4. Slice it:
   ```
   cd tools
   npm install            (first time only)
   node slice-sheet.js sheets/critters.png --pack critters
   ```
   Or just tell Claude: *"slice tools/sheets/critters.png as the critters pack"*.
5. Look at `tools/sheets/critters.preview.png`, then run `push.bat`. The items show up in the Locker.

**One prompt per pack.** Every prompt uses the "Mazzie ink" style: dark characters that match the
game's built-in avatars and look right on any avatar colour the player picks.

**Free ChatGPT tip:** you only get a few images a day, so paste the whole prompt exactly as written.
If the first result has 24 good items in the right order, keep it. Small spacing wobbles don't
matter, because the slicer fixes them.

---

## Icons · critters pack

```
Create a sprite sheet of 24 game avatar icons.

LAYOUT (most important — follow exactly):
- One single image, 1536 × 1024 pixels, landscape 3:2.
- An invisible grid of exactly 6 columns × 4 rows = 24 equal square cells, each 256 × 256 px.
- Do NOT draw the grid: no lines, borders, boxes, tiles, cards or panels behind the items.
- Exactly ONE item per cell, centred horizontally and vertically in its cell.
- Every item fills about 65% of its cell and never touches or crosses the cell edge.
  Keep an empty gap of at least 40 px between neighbouring items.
- All 24 items are the same size and sit on the same baseline.
- Fill the cells left→right, top→bottom in exactly the order listed below. Do not skip, repeat or add items.

BACKGROUND (critical):
- Transparent background: export as a PNG with a real alpha channel. Nothing behind the items.
- If you cannot make it transparent, use ONE perfectly flat solid pure magenta #FF00FF instead,
  and never use magenta, hot pink or purple-pink inside the items.
- No gradient, texture, vignette, floor, shadow, reflection, glow or haze around the items.

STYLE (identical for every character):
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
- Hard clean edges: no gradients, no glow, no 3D, no drop shadows, no texture, no other colours.

ABSOLUTELY NO text, letters, numbers, labels, captions, signatures or watermarks anywhere.

ITEMS, in order:
 1. Cat — round-faced cat with pointy ears and whiskers
 2. Pup — puppy with floppy ears and a round nose
 3. Fox — fox with a pointed muzzle and big triangle ears
 4. Panda — panda with round ears and eye patches
 5. Frog — frog with bulging eyes on top and a wide smile
 6. Owl — owl with huge round eyes and ear tufts
 7. Bunny — bunny with tall upright ears and buck teeth
 8. Bear — chubby bear with small round ears
 9. Penguin — penguin with a white face patch and small beak
10. Koala — koala with big fluffy ears and a large nose
11. Tiger — tiger cub with bold forehead stripes
12. Lion — lion with a big spiky mane
13. Monkey — monkey with large side ears and a heart-shaped face
14. Piggy — pig with a big snout and folded ears
15. Duck — duck with a wide flat bill and a hair tuft
16. Hedgehog — hedgehog with a spiky crown of quills
17. Raccoon — raccoon with a bandit eye mask
18. Sloth — sleepy sloth with droopy eye patches
19. Axolotl — axolotl with frilly gills on both sides of its head
20. Shark — shark head with a dorsal fin and toothy grin
21. Turtle — turtle peeking out with a patterned shell behind
22. Bee — bee with antennae and striped body
23. Chick — baby chick with a tiny beak and head feather
24. Wolf — howling-ready wolf with sharp ears and fur tufts
```

Slice with: `node slice-sheet.js sheets/critters.png --pack critters`

---

## Icons · mythic pack

```
Create a sprite sheet of 24 game avatar icons.

LAYOUT (most important — follow exactly):
- One single image, 1536 × 1024 pixels, landscape 3:2.
- An invisible grid of exactly 6 columns × 4 rows = 24 equal square cells, each 256 × 256 px.
- Do NOT draw the grid: no lines, borders, boxes, tiles, cards or panels behind the items.
- Exactly ONE item per cell, centred horizontally and vertically in its cell.
- Every item fills about 65% of its cell and never touches or crosses the cell edge.
  Keep an empty gap of at least 40 px between neighbouring items.
- All 24 items are the same size and sit on the same baseline.
- Fill the cells left→right, top→bottom in exactly the order listed below. Do not skip, repeat or add items.

BACKGROUND (critical):
- Transparent background: export as a PNG with a real alpha channel. Nothing behind the items.
- If you cannot make it transparent, use ONE perfectly flat solid pure magenta #FF00FF instead,
  and never use magenta, hot pink or purple-pink inside the items.
- No gradient, texture, vignette, floor, shadow, reflection, glow or haze around the items.

STYLE (identical for every character):
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
- Hard clean edges: no gradients, no glow, no 3D, no drop shadows, no texture, no other colours.

ABSOLUTELY NO text, letters, numbers, labels, captions, signatures or watermarks anywhere.

ITEMS, in order:
 1. Dragon — baby dragon with horns and little wings
 2. Unicorn — unicorn with a spiral horn and flowing mane
 3. Phoenix — phoenix bird with a flame-shaped crest
 4. Griffin — griffin with an eagle beak and feathered ears
 5. Kraken — kraken with curling tentacles around its head
 6. Yeti — fluffy yeti with a shaggy fur fringe
 7. Golem — stone golem with a cracked rocky head
 8. Wizard — wizard with a tall pointed hat and long beard
 9. Witch — witch with a wide brim hat and a crescent charm
10. Knight — knight helmet with a visor slit and plume
11. Ninja — ninja with a head wrap showing only the eyes
12. Samurai — samurai helmet with crescent crest
13. Pirate — pirate with a tricorn hat and eye patch
14. Viking — viking with a horned helmet and braided beard
15. Vampire — vampire with slick hair, high collar and fangs
16. Werewolf — werewolf with wild fur and glowing eyes
17. Mummy — mummy wrapped in bandages with one eye showing
18. Zombie — goofy zombie with stitches and a messy hairdo
19. Spirit — floating spirit with a wispy tail
20. Imp — mischievous imp with small horns and pointed ears
21. Fairy — fairy with butterfly wings behind the head
22. Elf — elf with long pointed ears and a leaf circlet
23. Troll — troll with a big nose and tusks
24. Minotaur — minotaur with big curved horns and a nose ring
```

Slice with: `node slice-sheet.js sheets/mythic.png --pack mythic`

---

## Icons · cyber pack

```
Create a sprite sheet of 24 game avatar icons.

LAYOUT (most important — follow exactly):
- One single image, 1536 × 1024 pixels, landscape 3:2.
- An invisible grid of exactly 6 columns × 4 rows = 24 equal square cells, each 256 × 256 px.
- Do NOT draw the grid: no lines, borders, boxes, tiles, cards or panels behind the items.
- Exactly ONE item per cell, centred horizontally and vertically in its cell.
- Every item fills about 65% of its cell and never touches or crosses the cell edge.
  Keep an empty gap of at least 40 px between neighbouring items.
- All 24 items are the same size and sit on the same baseline.
- Fill the cells left→right, top→bottom in exactly the order listed below. Do not skip, repeat or add items.

BACKGROUND (critical):
- Transparent background: export as a PNG with a real alpha channel. Nothing behind the items.
- If you cannot make it transparent, use ONE perfectly flat solid pure magenta #FF00FF instead,
  and never use magenta, hot pink or purple-pink inside the items.
- No gradient, texture, vignette, floor, shadow, reflection, glow or haze around the items.

STYLE (identical for every character):
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
- Hard clean edges: no gradients, no glow, no 3D, no drop shadows, no texture, no other colours.

ABSOLUTELY NO text, letters, numbers, labels, captions, signatures or watermarks anywhere.

ITEMS, in order:
 1. Bot — boxy robot head with an antenna
 2. Android — sleek android with a visor band
 3. Mech — armoured mech pilot helmet
 4. Drone — round drone with a single camera eye and rotors
 5. Alien — classic alien with a big head and almond eyes
 6. UFO — flying saucer with a dome and a tiny alien inside
 7. Astronaut — astronaut helmet with a reflective visor
 8. Cyborg — half-robot face with one mechanical eye
 9. Hacker — hooded hacker with a glowing mask
10. AI Core — floating AI orb core with rings
11. Space Cat — cat inside a bubble space helmet
12. Laser Bot — robot with a laser eye and angular head
13. Rover — cute planet rover with camera eyes
14. Satellite — satellite with solar panel wings and a face
15. Rocket — rocket with a porthole face and fins
16. Nebula — nebula cloud creature with star eyes
17. Void — black hole with a swirling disk and grin
18. Comet — comet with a face and a streaking tail
19. Planet — ringed planet with a friendly face
20. Moon Bun — bunny on a crescent moon
21. Glitch — glitchy pixel creature with offset slices
22. Pixel Spook — 8-bit ghost made of square pixels
23. Neon Skull — cyber skull with circuit lines
24. Overlord — robot king with a crown-shaped antenna array
```

Slice with: `node slice-sheet.js sheets/cyber.png --pack cyber`

---

## Icons · snacks pack

```
Create a sprite sheet of 24 game avatar icons.

LAYOUT (most important — follow exactly):
- One single image, 1536 × 1024 pixels, landscape 3:2.
- An invisible grid of exactly 6 columns × 4 rows = 24 equal square cells, each 256 × 256 px.
- Do NOT draw the grid: no lines, borders, boxes, tiles, cards or panels behind the items.
- Exactly ONE item per cell, centred horizontally and vertically in its cell.
- Every item fills about 65% of its cell and never touches or crosses the cell edge.
  Keep an empty gap of at least 40 px between neighbouring items.
- All 24 items are the same size and sit on the same baseline.
- Fill the cells left→right, top→bottom in exactly the order listed below. Do not skip, repeat or add items.

BACKGROUND (critical):
- Transparent background: export as a PNG with a real alpha channel. Nothing behind the items.
- If you cannot make it transparent, use ONE perfectly flat solid pure magenta #FF00FF instead,
  and never use magenta, hot pink or purple-pink inside the items.
- No gradient, texture, vignette, floor, shadow, reflection, glow or haze around the items.

STYLE (identical for every character):
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
- Hard clean edges: no gradients, no glow, no 3D, no drop shadows, no texture, no other colours.

ABSOLUTELY NO text, letters, numbers, labels, captions, signatures or watermarks anywhere.

ITEMS, in order:
 1. Donut — donut with sprinkles and a smile
 2. Pizza — pizza slice with pepperoni and a face
 3. Burger — stacked burger with a face on the bun
 4. Taco — taco with a face and filling
 5. Sushi — sushi roll with a face
 6. Ramen — ramen bowl with chopsticks and steam
 7. Boba — boba tea cup with a straw and pearls
 8. Ice Cream — ice cream cone with two scoops
 9. Cupcake — cupcake with swirl frosting and a cherry
10. Cookie — cookie with chocolate chips and a bite taken
11. Croissant — croissant with a sleepy face
12. Hot Dog — hot dog with a mustard zigzag
13. Fries — carton of fries with a face
14. Popcorn — popcorn bucket overflowing
15. Melon — watermelon slice with seeds
16. Avocado — avocado half with a pit belly
17. Banana — banana with a peel half open
18. Berry — strawberry with leafy top and seed dots
19. Cherries — two cherries joined at the stem
20. Pineapple — pineapple with a spiky crown
21. Egg — fried egg with a sunny yolk face
22. Toast — slice of toast with butter
23. Cheese — cheese wedge with holes
24. Pretzel — twisted pretzel with salt dots
```

Slice with: `node slice-sheet.js sheets/snacks.png --pack snacks`

---

## Icons · arcade pack

```
Create a sprite sheet of 24 game avatar icons.

LAYOUT (most important — follow exactly):
- One single image, 1536 × 1024 pixels, landscape 3:2.
- An invisible grid of exactly 6 columns × 4 rows = 24 equal square cells, each 256 × 256 px.
- Do NOT draw the grid: no lines, borders, boxes, tiles, cards or panels behind the items.
- Exactly ONE item per cell, centred horizontally and vertically in its cell.
- Every item fills about 65% of its cell and never touches or crosses the cell edge.
  Keep an empty gap of at least 40 px between neighbouring items.
- All 24 items are the same size and sit on the same baseline.
- Fill the cells left→right, top→bottom in exactly the order listed below. Do not skip, repeat or add items.

BACKGROUND (critical):
- Transparent background: export as a PNG with a real alpha channel. Nothing behind the items.
- If you cannot make it transparent, use ONE perfectly flat solid pure magenta #FF00FF instead,
  and never use magenta, hot pink or purple-pink inside the items.
- No gradient, texture, vignette, floor, shadow, reflection, glow or haze around the items.

STYLE (identical for every character):
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
- Hard clean edges: no gradients, no glow, no 3D, no drop shadows, no texture, no other colours.

ABSOLUTELY NO text, letters, numbers, labels, captions, signatures or watermarks anywhere.

ITEMS, in order:
 1. Dice — six-sided die character with pip eyes
 2. Joystick — arcade joystick with a ball top
 3. Gamepad — game controller with a face
 4. Trophy — trophy cup with handles
 5. Crown — jewelled crown
 6. Gem — faceted gem with a sparkle
 7. Coin — shiny coin with a star emblem
 8. Key — ornate old key
 9. Padlock — padlock with a keyhole face
10. Compass — compass with a needle
11. Treasure — treasure map scroll with an X
12. Hourglass — hourglass with falling sand
13. Stopwatch — stopwatch with a button on top
14. Thunder — lightning bolt character
15. Heart — pixel heart with a shine
16. Superstar — five-point star with a face
17. Shield — knight shield with a chevron
18. Sword — sword pointing up with a jewel hilt
19. Bomb — round cartoon bomb with a lit fuse
20. Potion — round potion flask with bubbles
21. Magnet — horseshoe magnet
22. Maze — square maze tile with a path
23. Cube — puzzle cube with a grid of squares
24. Knight — chess knight piece
```

Slice with: `node slice-sheet.js sheets/arcade.png --pack arcade`

---

## Frames · elements pack

```
Create a sprite sheet of 24 circular avatar frame rings for a game.

LAYOUT (most important — follow exactly):
- One single image, 1536 × 1024 pixels, landscape 3:2.
- An invisible grid of exactly 6 columns × 4 rows = 24 equal square cells, each 256 × 256 px.
- Do NOT draw the grid: no lines, borders, boxes, tiles, cards or panels behind the items.
- Exactly ONE item per cell, centred horizontally and vertically in its cell.
- Every item is a ring whose OUTER diameter is about 80% of its cell and never touches or crosses the cell edge.
  Keep an empty gap of at least 40 px between neighbouring items.
- All 24 items are the same size and sit on the same baseline.
- Fill the cells left→right, top→bottom in exactly the order listed below. Do not skip, repeat or add items.

RING SHAPE (critical):
- Every frame is a perfect circle ring, seen straight on, centred in its cell.
- The ring's inner hole has a diameter of 72% of the ring's outer diameter, so the ring band is thin.
- The hole is completely empty and transparent (same as the background). Nothing inside it.
- Decorations may stick OUT past the ring by up to 8% of the cell, but never INTO the hole.

BACKGROUND (critical):
- Transparent background: export as a PNG with a real alpha channel. Nothing behind the items.
- If you cannot make it transparent, use ONE perfectly flat solid pure magenta #FF00FF instead,
  and never use magenta, hot pink or purple-pink inside the items.
- No gradient, texture, vignette, floor, shadow, reflection, glow or haze around the items.

STYLE:
- Rich, detailed game UI jewellery with crisp hard edges and bright neon accents on darker base materials.
- Light effects are drawn as solid shapes (highlights, sparkles) and never as blurry glow or haze.
- Consistent thickness and scale across all 24 frames.

ABSOLUTELY NO text, letters, numbers, labels, captions, signatures or watermarks anywhere.

FRAMES, in order:
 1. Vines — twisting green vines with small leaves
 2. Frost — jagged ice crystals, pale blue
 3. Circuit — circuit-board traces with glowing nodes, cyan
 4. Blaze — stylised flame licks, orange and yellow
 5. Storm — crackling lightning segments, electric violet
 6. Ripple — concentric water ripples, aqua
 7. Sakura — cherry blossom branch with petals
 8. Autumn — maple leaves in red and amber
 9. Galaxy — starry galaxy band, deep blue and violet
10. Lava — cracked black rock with glowing lava seams
11. Shards — crystal shards pointing outward, teal
12. Thorns — dark thorny branches with a few red berries
13. Clouds — puffy white clouds with a gold rim
14. Sandstorm — swirling sand bands, desert gold
15. Aurora — aurora ribbons in green and teal
16. Bubbles — cluster of shiny bubbles
17. Snowfall — ring of snowflakes
18. Reef — coral and seashells, coral orange and cyan
19. Plumes — overlapping feathers, peacock blue
20. Starlight — orbiting little stars, gold
21. Moonphase — moon phases around the ring, silver
22. Sunburst — radiant sun rays, gold
23. Toxic — dripping toxic slime, acid green
24. Smoke — curling smoke wisps, grey with ember sparks
```

Slice with: `node slice-sheet.js sheets/elements.png --pack elements`

---

## Frames · royal pack

```
Create a sprite sheet of 24 circular avatar frame rings for a game.

LAYOUT (most important — follow exactly):
- One single image, 1536 × 1024 pixels, landscape 3:2.
- An invisible grid of exactly 6 columns × 4 rows = 24 equal square cells, each 256 × 256 px.
- Do NOT draw the grid: no lines, borders, boxes, tiles, cards or panels behind the items.
- Exactly ONE item per cell, centred horizontally and vertically in its cell.
- Every item is a ring whose OUTER diameter is about 80% of its cell and never touches or crosses the cell edge.
  Keep an empty gap of at least 40 px between neighbouring items.
- All 24 items are the same size and sit on the same baseline.
- Fill the cells left→right, top→bottom in exactly the order listed below. Do not skip, repeat or add items.

RING SHAPE (critical):
- Every frame is a perfect circle ring, seen straight on, centred in its cell.
- The ring's inner hole has a diameter of 72% of the ring's outer diameter, so the ring band is thin.
- The hole is completely empty and transparent (same as the background). Nothing inside it.
- Decorations may stick OUT past the ring by up to 8% of the cell, but never INTO the hole.

BACKGROUND (critical):
- Transparent background: export as a PNG with a real alpha channel. Nothing behind the items.
- If you cannot make it transparent, use ONE perfectly flat solid pure green #00FF00 instead,
  and never use bright green or lime inside the items.
- No gradient, texture, vignette, floor, shadow, reflection, glow or haze around the items.

STYLE:
- Rich, detailed game UI jewellery with crisp hard edges and bright neon accents on darker base materials.
- Light effects are drawn as solid shapes (highlights, sparkles) and never as blurry glow or haze.
- Consistent thickness and scale across all 24 frames.

ABSOLUTELY NO text, letters, numbers, labels, captions, signatures or watermarks anywhere.

FRAMES, in order:
 1. Bronze — bronze laurel wreath
 2. Silver — silver laurel wreath
 3. Gold — gold laurel wreath
 4. Diamond — ring of cut diamonds
 5. Ruby — gold band set with rubies
 6. Emerald — gold band set with emeralds
 7. Sapphire — silver band set with sapphires
 8. Amethyst — silver band set with amethysts
 9. Obsidian — polished black obsidian with violet sheen
10. Pearl — string of pearls
11. Platinum — platinum ring with small wings
12. Angel — white angel wings wrapping the ring
13. Demon — dark ring with curved horns and red glow
14. Scales — dragon scales, emerald and gold
15. Jewels — crown jewels band with a crest on top
16. Chains — heavy steel chain links
17. Gears — brass clockwork gears
18. Neon — double neon tube ring, pink and cyan
19. Holo — holographic iridescent ring
20. Glitched — glitched RGB-split ring
21. Pixel — 8-bit pixel ring
22. Runes — glowing magic rune circle
23. Tribal — bold tribal pattern ring
24. Graffiti — spray-paint graffiti ring with drips
```

Slice with: `node slice-sheet.js sheets/royal.png --pack royal`

---

## Emotes · emotes pack (battle reactions)

```
Create a sprite sheet of 24 chat emotes for a game: the SAME little mascot in 24 different reactions.

LAYOUT (most important — follow exactly):
- One single image, 1536 × 1024 pixels, landscape 3:2.
- An invisible grid of exactly 6 columns × 4 rows = 24 equal square cells, each 256 × 256 px.
- Do NOT draw the grid: no lines, borders, boxes, tiles, cards or panels behind the items.
- Exactly ONE item per cell, centred horizontally and vertically in its cell.
- Every item fills about 65% of its cell and never touches or crosses the cell edge.
  Keep an empty gap of at least 40 px between neighbouring items.
- All 24 items are the same size and sit on the same baseline.
- Fill the cells left→right, top→bottom in exactly the order listed below. Do not skip, repeat or add items.

BACKGROUND (critical):
- Transparent background: export as a PNG with a real alpha channel. Nothing behind the items.
- If you cannot make it transparent, use ONE perfectly flat solid pure magenta #FF00FF instead,
  and never use magenta, hot pink or purple-pink inside the items.
- No gradient, texture, vignette, floor, shadow, reflection, glow or haze around the items.

THE MASCOT (identical in every emote — same body, same size, same proportions):
- "Mazzie": a small, round, soft blob creature, slightly wider than tall, with two stubby arms,
  a short antenna on top ending in a glowing-blue ball, and huge expressive white eyes.
- Show the whole mascot (head, body and arms) facing the viewer, so gestures read clearly.

STYLE:
- Cute, chunky flat vector sticker, like chat emotes. Big expressive faces and gestures.
- Use ONLY these 4 colours, in every emote:
    black #0B0B14      the mascot's body
    white #F6F6FB      eyes, teeth, highlights, props outlines
    grey  #6B6B80      shading and secondary shapes
    neon blue #33CCFF  the antenna ball plus the emote's key accent (tears, hearts, flames, crown, confetti…)
- Simple cel shading, same light direction everywhere. Must read clearly at 40 px: no thin lines, no tiny details.
- Hard clean edges: no gradients, no glow, no 3D, no drop shadows, no texture, no other colours.

TEXT: none anywhere, EXCEPT the letters "GG" on the sign in emote 23, the "Z" in emote 9 and the "?" in emote 24.

EMOTES, in order:
 1. Hi — waving one hand hello with a big happy smile
 2. LOL — laughing hard with eyes squeezed shut and two big tears of joy
 3. Cry — crying, two waterfall streams of neon blue tears, wobbly mouth
 4. Angry — furious frown with two puffs of steam from the head
 5. Shock — jaw dropped, huge round white eyes, tiny pupils
 6. Cool — smug grin wearing black sunglasses with a neon blue shine
 7. Love — dreamy smile with two neon blue heart-shaped eyes
 8. Think — one hand on chin, eyes looking up, one eyebrow raised
 9. Sleepy — eyes closed, drool bubble, a big "Z" floating above
10. Thumbs Up — confident wink giving a big thumbs up
11. Clap — clapping both hands with small motion lines, excited open smile
12. Facepalm — one hand covering its face, embarrassed
13. Party — wearing a party hat, blowing a party horn, confetti around
14. King — smug half-closed eyes, wearing a small neon blue crown
15. On Fire — determined grin with neon blue flames around the head
16. Dead — X-shaped eyes and tongue out, a tiny ghost floating up
17. Nervous — awkward grin with a big sweat drop on the forehead
18. Silly — winking with its tongue sticking out
19. Rage — shaking a fist, angry vein mark, teeth clenched
20. Please — hands pressed together begging, sparkly puppy eyes
21. Heart — hugging a big neon blue heart, blushing
22. Winner — holding a trophy above its head, cheering
23. GG — holding a sign that says "GG" in big bold letters
24. What — confused, head tilted, a big "?" floating above
```

Slice with: `node slice-sheet.js sheets/emotes.png --pack emotes`

---

## Make your own pack

Add a block to `tools/avatar-packs.json` (copy an existing one): a unique `prefix`, the key colour, and
24 items with `name` (max 14 characters), `lvl` (unlock level) and `look` (a short description for the prompt).
Then run `node tools/make-prompts.js` to regenerate this file with your new prompt.

## Troubleshooting

| Problem | Fix |
|---|---|
| Fewer than 24 items, or two in one cell | Regenerate. Add "exactly 24 items, one per cell" to the start of the prompt. |
| Items touch each other | Add "make every item smaller, about 55% of its cell". |
| Grey checkerboard background | The AI faked transparency. Regenerate and stress "flat solid pure magenta #FF00FF background". |
| Soft glow around items | Add "no glow, no haze, hard edges only". Or run the slicer with `--tol 60,140`. |
| Part of an item disappeared | That part used the background colour. Change the pack's `key` to `#00FF00` or `#0000FF` and regenerate. |
| Text or labels appeared | Add "no text of any kind" at the very start of the prompt. |
| Wrong order | Rename items in the pack to match the image, or pass `--names "A,B,C,…"` to the slicer. |
