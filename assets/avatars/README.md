# Custom avatar art

Drop image files in this folder and list them in `manifest.json`. They appear in the
Locker automatically. No code changes needed.

```json
{
  "icons": [
    { "id": "wizard", "name": "Wizard", "file": "wizard.png", "lvl": 8 },
    { "id": "ninja",  "name": "Ninja",  "file": "ninja.webp", "lvl": 20 }
  ],
  "frames": [
    { "id": "vines", "name": "Vines", "file": "vines-frame.png", "lvl": 30 }
  ]
}
```

Rules:
- `id`: lowercase letters, numbers, `-` or `_` (max 32 characters). It must never change once players equip it.
- `file`: a png, webp, jpg, svg or gif file in this folder. No spaces in the name.
- `lvl`: the XP level that unlocks it.
- **Icons** fill the round avatar. Use square images, 256×256, with the subject centred.
- **Frames** are drawn around the avatar at 136% size. Use square transparent PNGs, 512×512,
  with the middle ~70% left empty.

## Prompt for generating a matching set

> A set of 12 cute game avatar icons in a flat vector style, each a single character
> (animal or creature) facing forward, bold simple shapes, dark navy #0b0b14 silhouette
> with a few white highlights, centred on a transparent background, no text, no outline
> glow, consistent line weight, 256×256 PNG each.

Frames:

> A circular decorative avatar frame ring for a game, transparent PNG 512×512, the
> centre 70% completely empty and transparent, ornate [vines / ice crystals / circuitry /
> flames] around the edge, neon accent colours on dark, no text.
