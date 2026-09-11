// ══════════════════════════════════════════════════
// js/cosmetics.js — Avatar icons, colours, frames, path trails, titles + Locker
// Starters (lvl 1) are free; everything else comes out of Crates (js/crates.js).
// "lvl" only sets an item's rarity now (see rarityOf). Ids are whitelisted before
// rendering, so avatars received from other players can never inject markup.
//
// Add your own art (e.g. AI-generated) without touching code:
//   assets/avatars/manifest.json  →  { "icons":[{ "id":"wizard","name":"Wizard","file":"wizard.png","lvl":8 }],
//                                       "frames":[{ "id":"vines","name":"Vines","file":"vines-frame.png","lvl":20 }] }
// ══════════════════════════════════════════════════

// Initials + every icon in assets/avatars/manifest.json (loaded at start-up)
const AVA_ICONS = [ { id:'init', lvl:1, name:'Initials' } ];
// Palette: green #2dff7f · cyan #4dfffe · violet #a78bfa · gold #ffd700 · orange #ff9f43 · red #ff4d6a (+ darker shades)
const AVA_COLORS = [
  { id:'mint',     lvl:1,  name:'Mint',     bg:'linear-gradient(135deg,#2dff7f,#0e9e57)' },
  { id:'ice',      lvl:1,  name:'Ice',      bg:'linear-gradient(135deg,#4dfffe,#178aa8)' },
  { id:'rose',     lvl:2,  name:'Rose',     bg:'linear-gradient(135deg,#ff4d6a,#a3183a)' },
  { id:'sun',      lvl:3,  name:'Sun',      bg:'linear-gradient(135deg,#ffd700,#ff9f43)' },
  { id:'grape',    lvl:5,  name:'Grape',    bg:'linear-gradient(135deg,#a78bfa,#5a3fc0)' },
  { id:'ember',    lvl:8,  name:'Ember',    bg:'linear-gradient(135deg,#ff9f43,#ff4d6a)' },
  { id:'ocean',    lvl:12, name:'Ocean',    bg:'linear-gradient(135deg,#4dfffe,#5a3fc0)' },
  { id:'toxic',    lvl:16, name:'Toxic',    bg:'linear-gradient(135deg,#ffd700,#2dff7f)' },
  { id:'midnight', lvl:22, name:'Midnight', bg:'linear-gradient(135deg,#5a3fc0,#161622)' },
  { id:'gold',     lvl:30, name:'Gold',     bg:'linear-gradient(135deg,#fff3a0,#ffd700 45%,#b8860b)' },
  { id:'holo',     lvl:45, name:'Holo',     bg:'linear-gradient(135deg,#ff4d6a,#ffd700,#2dff7f,#4dfffe,#a78bfa)', anim:true },
  { id:'void',     lvl:60, name:'Void',     bg:'radial-gradient(circle at 30% 30%,#a78bfa,#07070e 72%)' },
  { id:'steel',    lvl:4,  name:'Steel',    bg:'linear-gradient(135deg,#eeeef8,#34344a)' },
  { id:'lagoon',   lvl:9,  name:'Lagoon',   bg:'linear-gradient(135deg,#2dff7f,#4dfffe)' },
  { id:'candy',    lvl:14, name:'Candy',    bg:'linear-gradient(135deg,#ff4d6a,#a78bfa)' },
  { id:'aurora',   lvl:26, name:'Aurora',   bg:'linear-gradient(135deg,#2dff7f,#4dfffe,#a78bfa)', anim:true },
  { id:'sunset',   lvl:28, name:'Sunset',   bg:'linear-gradient(160deg,#ffd700,#ff9f43,#ff4d6a)' },
  { id:'royal',    lvl:44, name:'Royal',    bg:'linear-gradient(135deg,#5a3fc0,#a78bfa 55%,#ffd700)' },
  { id:'inferno',  lvl:66, name:'Inferno',  bg:'radial-gradient(circle at 50% 80%,#ffd700,#ff9f43 30%,#ff4d6a 60%,#1a0008)', anim:true },
  { id:'galaxy',   lvl:80, name:'Galaxy',   bg:'radial-gradient(circle at 70% 20%,#4dfffe,transparent 25%),radial-gradient(circle at 25% 75%,#ff4d6a,transparent 30%),linear-gradient(135deg,#5a3fc0,#07070e)' }
];
// k = frame style (css .fk-<k>), c = palette colours it uses
const AVA_FRAMES = [
  { id:'none',    lvl:1,   name:'None' },    { id:'ring',  lvl:1,  name:'Ring' },   { id:'double', lvl:3,  name:'Double' },
  { id:'dashed',  lvl:6,   name:'Spinner' }, { id:'glow',  lvl:10, name:'Glow' },   { id:'neon',   lvl:15, name:'Neon' },
  { id:'orbit',   lvl:20,  name:'Orbit' },   { id:'goldr', lvl:30, name:'Gold' },   { id:'flame',  lvl:40, name:'Flame' },
  { id:'rainbow', lvl:50,  name:'Rainbow' }, { id:'crown', lvl:75, name:'Crown' },  { id:'cosmic', lvl:100, name:'Cosmic' },
  // Common
  { id:'f-cyan',    lvl:2,  name:'Cyan Ring',    k:'solid',  c:['cyan'] },
  { id:'f-violet',  lvl:2,  name:'Violet Ring',  k:'solid',  c:['xp'] },
  { id:'f-gold',    lvl:3,  name:'Gold Ring',    k:'solid',  c:['gold'] },
  { id:'f-orange',  lvl:3,  name:'Orange Ring',  k:'solid',  c:['orange'] },
  { id:'f-red',     lvl:4,  name:'Red Ring',     k:'solid',  c:['danger'] },
  { id:'f-spin-v',  lvl:5,  name:'Violet Spin',  k:'dash',   c:['xp'] },
  { id:'f-spin-g',  lvl:6,  name:'Gold Spin',    k:'dash',   c:['gold'] },
  { id:'f-twin',    lvl:7,  name:'Twin Ring',    k:'double', c:['acc', 'cyan'] },
  { id:'f-ember2',  lvl:8,  name:'Ember Ring',   k:'double', c:['orange', 'danger'] },
  // Rare
  { id:'f-glow-c',  lvl:10, name:'Cyan Glow',    k:'glow',   c:['cyan'] },
  { id:'f-glow-v',  lvl:11, name:'Violet Glow',  k:'glow',   c:['xp'] },
  { id:'f-glow-r',  lvl:12, name:'Red Glow',     k:'glow',   c:['danger'] },
  { id:'f-ocean',   lvl:13, name:'Ocean',        k:'duo',    c:['cyan', 'xp'] },
  { id:'f-sunset',  lvl:14, name:'Sunset',       k:'duo',    c:['gold', 'danger'] },
  { id:'f-lime',    lvl:15, name:'Lime',         k:'duo',    c:['acc', 'gold'] },
  { id:'f-ping',    lvl:16, name:'Ping',         k:'pulse',  c:['acc'] },
  { id:'f-sonar',   lvl:17, name:'Sonar',        k:'pulse',  c:['cyan'] },
  { id:'f-loader',  lvl:18, name:'Loader',       k:'seg',    c:['gold'] },
  { id:'f-radar',   lvl:19, name:'Radar',        k:'seg',    c:['acc'] },
  // Epic
  { id:'f-comet-c', lvl:22, name:'Comet',        k:'comet',  c:['cyan', 'xp'] },
  { id:'f-comet-r', lvl:24, name:'Red Comet',    k:'comet',  c:['danger', 'orange'] },
  { id:'f-orbit2',  lvl:26, name:'Twin Orbit',   k:'orbit2', c:['cyan', 'xp'] },
  { id:'f-aurora',  lvl:28, name:'Aurora',       k:'halo',   c:['acc', 'cyan'] },
  { id:'f-tropic',  lvl:30, name:'Tropic',       k:'spin',   c:['gold', 'orange', 'danger'] },
  { id:'f-zap-c',   lvl:33, name:'Static',       k:'zap',    c:['cyan'] },
  { id:'f-gem-v',   lvl:36, name:'Amethyst',     k:'gem',    c:['xp', 'txt'] },
  { id:'f-neonseg', lvl:38, name:'Neon Grid',    k:'seg',    c:['cyan'] },
  // Legendary
  { id:'f-inferno', lvl:42, name:'Inferno',      k:'halo',   c:['danger', 'gold'] },
  { id:'f-comet-g', lvl:46, name:'Gold Comet',   k:'comet',  c:['gold', 'orange'] },
  { id:'f-orbitf',  lvl:50, name:'Fire Orbit',   k:'orbit2', c:['gold', 'danger'] },
  { id:'f-diamond', lvl:55, name:'Diamond',      k:'gem',    c:['cyan', 'txt'] },
  { id:'f-borealis',lvl:60, name:'Borealis',     k:'spin',   c:['acc', 'cyan', 'xp'] },
  { id:'f-zap-v',   lvl:65, name:'Storm',        k:'zap',    c:['xp'] },
  // Mythic
  { id:'f-nova',    lvl:80, name:'Supernova',    k:'nova',   c:['gold'] },
  { id:'f-prism',   lvl:90, name:'Prism',        k:'prism',  c:['txt'] },
  { id:'f-voideye', lvl:95, name:'Void Eye',     k:'halo',   c:['xp', 'danger'] }
];
// Path trails: a neon tube (glow + body + white core). grad = colours along the path,
// flow = travelling sparks, pulse = breathing glow, zap = electric flicker, sparks = crackle at the head
const RAINBOW = ['#ff4d6a', '#ffd700', '#2dff7f', '#4dfffe', '#a78bfa'];
const TRAILS = [
  { id:'mint',     lvl:1,  name:'Mint',      rgb:'45,255,127',  core:'#eafff3' },
  { id:'cyan',     lvl:2,  name:'Cyan',      rgb:'77,255,254',  core:'#effffe' },
  { id:'pink',     lvl:4,  name:'Rose',      rgb:'255,77,106',  core:'#fff0f3', pulse:true },
  { id:'gold',     lvl:7,  name:'Gold Rush', rgb:'255,215,0',   core:'#fffbe0', grad:['#fff3a0', '#ffd700', '#ff9f43'], flow:true },
  { id:'violet',   lvl:10, name:'Violet',    rgb:'167,139,250', core:'#f3ecff', pulse:true },
  { id:'ember',    lvl:14, name:'Ember',     rgb:'255,159,67',  core:'#fff4d6', grad:['#ffd700', '#ff9f43', '#ff4d6a'], flow:true, sparks:true },
  { id:'ice',      lvl:18, name:'Glacier',   rgb:'77,255,254',  core:'#ffffff', grad:['#ffffff', '#4dfffe', '#a78bfa'] },
  { id:'plasma',   lvl:22, name:'Plasma',    rgb:'167,139,250', core:'#ffffff', grad:['#ff4d6a', '#a78bfa', '#4dfffe'], flow:true },
  { id:'rainbow',  lvl:25, name:'Rainbow',   rgb:'45,255,127',  core:'#ffffff', grad:RAINBOW, flow:true, spin:true },
  { id:'toxic',    lvl:32, name:'Toxic',     rgb:'45,255,127',  core:'#f4ffe0', grad:['#ffd700', '#2dff7f', '#4dfffe'], pulse:true, sparks:true },
  { id:'void',     lvl:45, name:'Void',      rgb:'167,139,250', core:'#efe8ff', grad:['#5a3fc0', '#a78bfa', '#ff4d6a'], flow:true, sparks:true },
  { id:'electric', lvl:60, name:'Electric',  rgb:'77,255,254',  core:'#ffffff', zap:true, flow:true, sparks:true },
  // Common
  { id:'lime',      lvl:3,  name:'Lime',       rgb:'45,255,127',  core:'#fffbe0', grad:['#2dff7f', '#ffd700'] },
  { id:'sky',       lvl:3,  name:'Sky',        rgb:'77,255,254',  core:'#ffffff', grad:['#ffffff', '#4dfffe'] },
  { id:'lilac',     lvl:4,  name:'Lilac',      rgb:'167,139,250', core:'#f3ecff' },
  { id:'tangerine', lvl:5,  name:'Tangerine',  rgb:'255,159,67',  core:'#fff4d6' },
  { id:'ruby',      lvl:6,  name:'Ruby',       rgb:'255,77,106',  core:'#fff0f3' },
  { id:'sunbeam',   lvl:7,  name:'Sunbeam',    rgb:'255,215,0',   core:'#fffbe0', pulse:true },
  { id:'ghost',     lvl:8,  name:'Ghost',      rgb:'238,238,248', core:'#ffffff', dash:true },
  // Rare
  { id:'aurora',    lvl:11, name:'Aurora',     rgb:'77,255,254',  core:'#ffffff', grad:['#2dff7f', '#4dfffe', '#a78bfa'], flow:true },
  { id:'sunset',    lvl:12, name:'Sunset',     rgb:'255,159,67',  core:'#fff4d6', grad:['#ffd700', '#ff9f43', '#ff4d6a'] },
  { id:'ocean',     lvl:13, name:'Ocean',      rgb:'77,255,254',  core:'#ffffff', grad:['#4dfffe', '#a78bfa'], pulse:true },
  { id:'candy',     lvl:15, name:'Candy',      rgb:'255,77,106',  core:'#ffffff', grad:['#ff4d6a', '#a78bfa', '#ff4d6a'], pulse:true },
  { id:'mintdash',  lvl:17, name:'Mint Dash',  rgb:'45,255,127',  core:'#eafff3', dash:true, flow:true },
  { id:'neondash',  lvl:19, name:'Neon Dash',  rgb:'77,255,254',  core:'#ffffff', dash:true, flow:true },
  // Epic
  { id:'inferno',   lvl:23, name:'Inferno',    rgb:'255,77,106',  core:'#fff4d6', grad:['#ff4d6a', '#ff9f43', '#ffd700'], flow:true, sparks:true },
  { id:'nebula',    lvl:27, name:'Nebula',     rgb:'167,139,250', core:'#ffffff', grad:['#a78bfa', '#ff4d6a', '#4dfffe'], flow:true, pulse:true },
  { id:'frostbite', lvl:31, name:'Frostbite',  rgb:'77,255,254',  core:'#ffffff', grad:['#ffffff', '#4dfffe'], zap:true },
  { id:'venom',     lvl:34, name:'Venom',      rgb:'45,255,127',  core:'#f4ffe0', grad:['#2dff7f', '#a78bfa'], pulse:true, sparks:true },
  { id:'solar',     lvl:38, name:'Solar Flare',rgb:'255,215,0',   core:'#ffffff', grad:['#ffd700', '#ff9f43'], zap:true, sparks:true },
  // Legendary
  { id:'prism',     lvl:44, name:'Prism',      rgb:'45,255,127',  core:'#ffffff', grad:RAINBOW, flow:true, dash:true },
  { id:'galaxy',    lvl:50, name:'Galaxy',     rgb:'167,139,250', core:'#ffffff', grad:['#a78bfa', '#4dfffe', '#ff4d6a'], spin:true, flow:true, sparks:true },
  { id:'thunder',   lvl:56, name:'Thunder',    rgb:'255,215,0',   core:'#ffffff', zap:true, flow:true, sparks:true },
  { id:'phoenix',   lvl:64, name:'Phoenix',    rgb:'255,159,67',  core:'#fffbe0', grad:['#ff4d6a', '#ff9f43', '#ffd700'], spin:true, flow:true, sparks:true },
  // Mythic
  { id:'supernova', lvl:85, name:'Supernova',  rgb:'255,215,0',   core:'#ffffff', grad:RAINBOW, flow:true, spin:true, sparks:true, pulse:true },
  { id:'voidrift',  lvl:95, name:'Void Rift',  rgb:'167,139,250', core:'#ffffff', grad:['#5a3fc0', '#ff4d6a', '#a78bfa'], zap:true, spin:true, sparks:true }
];
// Every title has its own display font (loaded from Google Fonts in index.html)
const TITLES = [
  { id:'none',        lvl:1,   name:'None' },
  { id:'puzzler',     lvl:1,   name:'Puzzler',     font:"'Righteous'",         color:'var(--acc)' },
  { id:'speedster',   lvl:5,   name:'Speedster',   font:"'Russo One'",         color:'var(--gold)', italic:true },
  { id:'dreamer',     lvl:8,   name:'Dreamer',     font:"'Pacifico'",          color:'var(--xp)' },
  { id:'pathfinder',  lvl:10,  name:'Pathfinder',  font:"'Orbitron'",          color:'var(--cyan)' },
  { id:'tactician',   lvl:15,  name:'Tactician',   font:"'Bungee'",            color:'var(--orange)' },
  { id:'glitch',      lvl:20,  name:'Glitch',      font:"'Press Start 2P'",    color:'var(--danger)' },
  { id:'mazelord',    lvl:25,  name:'Maze Lord',   font:"'Cinzel Decorative'", color:'var(--gold)' },
  { id:'hustler',     lvl:35,  name:'Hustler',     font:"'Permanent Marker'",  color:'var(--orange)' },
  { id:'spooky',      lvl:40,  name:'Spooky',      font:"'Creepster'",         color:'var(--acc)' },
  { id:'untouchable', lvl:50,  name:'Untouchable', font:"'Monoton'",           color:'var(--cyan)' },
  { id:'mythic',      lvl:100, name:'Mythic',      font:"'Cinzel Decorative'", rainbow:true },
  { id:'bigbrain',    lvl:4,   name:'Big Brain',   font:"'Righteous'",         color:'var(--gold)' },
  { id:'mazerunner',  lvl:6,   name:'Maze Runner', font:"'Bungee'",            color:'var(--acc)' },
  { id:'nightowl',    lvl:9,   name:'Night Owl',   font:"'Pacifico'",          color:'var(--cyan)' },
  { id:'pixelpro',    lvl:13,  name:'Pixel Pro',   font:"'Press Start 2P'",    color:'var(--cyan)' },
  { id:'artist',      lvl:18,  name:'Artist',      font:"'Permanent Marker'",  color:'var(--xp)' },
  { id:'speeddemon',  lvl:24,  name:'Speed Demon', font:"'Russo One'",         color:'var(--danger)', italic:true },
  { id:'unstoppable', lvl:32,  name:'Unstoppable', font:"'Orbitron'",          color:'var(--orange)' },
  { id:'shadow',      lvl:42,  name:'Shadow',      font:"'Monoton'",           color:'var(--xp)' },
  { id:'chaos',       lvl:58,  name:'Chaos',       font:"'Creepster'",         color:'var(--danger)' },
  { id:'goat',        lvl:88,  name:'The GOAT',    font:"'Cinzel Decorative'", rainbow:true }
];
const COSMETIC_SETS = { icon:AVA_ICONS, color:AVA_COLORS, frame:AVA_FRAMES, trail:TRAILS, title:TITLES };
const DEFAULT_AVATAR = { icon:'init', color:'mint', frame:'ring', trail:'mint', title:'puzzler' };

// ── Custom art from assets/avatars/manifest.json ──
const SAFE_FILE = /^[a-zA-Z0-9_\-]+\.(png|webp|jpg|jpeg|svg|gif)$/;
const SAFE_ID   = /^[a-z0-9_\-]{1,32}$/;
let cosmeticsLoaded = Promise.resolve(), manifestReady = false;
// Icon ids from the art packs look like "cr-fox"; keep them even before the manifest has loaded
const PACK_ID = /^(cr|my|cy|sn|ar|fe|fr)-[a-z0-9-]{1,28}$/;
function loadCustomCosmetics() {
  cosmeticsLoaded = fetch('assets/avatars/manifest.json', { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : null)
    .then(m => {
      if (!m) return;
      const add = (list, set) => (Array.isArray(list) ? list : []).forEach(x => {
        if (!x || !SAFE_ID.test(x.id) || !SAFE_FILE.test(x.file || '') || set.some(s => s.id === x.id)) return;
        set.push({ id: x.id, name: String(x.name || x.id).slice(0, 14), lvl: Math.max(1, parseInt(x.lvl) || 1), src: 'assets/avatars/' + x.file });
      });
      add(m.icons, AVA_ICONS); add(m.frames, AVA_FRAMES);
      manifestReady = true;
    })
    .catch(() => {});
  return cosmeticsLoaded;
}

function _find(set, id) { return set.find(x => x.id === id); }

// Coerce any (possibly remote or old-emoji) avatar object into known ids only
function sanitizeAvatar(av) {
  const out = {};
  for (const k of Object.keys(DEFAULT_AVATAR)) {
    let v = av && typeof av[k] === 'string' ? av[k] : null;
    if (k === 'icon' && v && LEGACY_AVATAR_IDS[v]) v = LEGACY_AVATAR_IDS[v];
    const known = v && (_find(COSMETIC_SETS[k], v) || (!manifestReady && (k === 'icon' || k === 'frame') && PACK_ID.test(v)));
    out[k] = known ? v : DEFAULT_AVATAR[k];
  }
  return out;
}
function getMyAvatar() { return sanitizeAvatar(loadSave().avatar); }
// Rarity comes from the item's old unlock level
const RARITIES = [
  { id:'starter',   name:'Starter',   rgb:'var(--txt-rgb)' },
  { id:'common',    name:'Common',    rgb:'var(--txt-rgb)' },
  { id:'rare',      name:'Rare',      rgb:'var(--cyan-rgb)' },
  { id:'epic',      name:'Epic',      rgb:'var(--xp-rgb)' },
  { id:'legendary', name:'Legendary', rgb:'var(--gold-rgb)' },
  { id:'mythic',    name:'Mythic',    rgb:'var(--danger-rgb)' }
];
function rarityOf(item) {
  const l = item.lvl || 1;
  return RARITIES[l <= 1 ? 0 : l <= 8 ? 1 : l <= 20 ? 2 : l <= 40 ? 3 : l <= 70 ? 4 : 5];
}
// Owned = starter, bought/won from a crate, or admin "unlock all"
function isUnlocked(item, set) {
  const s = loadSave();
  if (s.unlockAll || (item.lvl || 1) <= 1) return true;
  const o = s.owned && s.owned[set || setOf(item)];
  return !!(o && o[item.id]);
}
function setOf(item) { for (const [k, list] of Object.entries(COSMETIC_SETS)) if (list.includes(item)) return k; return null; }
function grantItem(set, id) {
  const s = loadSave(), owned = s.owned || {};
  owned[set] = { ...(owned[set] || {}), [id]: true };
  writeSave({ owned });
}
// One-time move from level unlocks: keep everything a player had already unlocked
async function migrateOwned() {
  await cosmeticsLoaded;
  const s = loadSave();
  if (s.ownedV1) return;
  const lvl = getXpLevel(s.xp || 0), owned = s.owned || {};
  Object.entries(COSMETIC_SETS).forEach(([set, list]) => list.forEach(i => {
    if ((i.lvl || 1) > 1 && i.lvl <= lvl) owned[set] = { ...(owned[set] || {}), [i.id]: true };
  }));
  writeSave({ owned, ownedV1: true });
}
function titleName(av) { const t = _find(TITLES, sanitizeAvatar(av).title); return t && t.id !== 'none' ? t.name : ''; }
// Styled title (its own font + colour); '' when the player shows no title
function titleHtml(avOrId) {
  const id = typeof avOrId === 'string' ? avOrId : sanitizeAvatar(avOrId).title;
  const t = _find(TITLES, id);
  if (!t || t.id === 'none') return typeof avOrId === 'string' ? '<span class="ttl ttl-none">None</span>' : '';
  const style = `font-family:${t.font},'Syne',sans-serif;${t.color ? 'color:' + t.color + ';' : ''}${t.italic ? 'font-style:italic;' : ''}`;
  return `<span class="ttl${t.rainbow ? ' ttl-rainbow' : ''}" style="${style}">${escapeHtml(t.name)}</span>`;
}
// Shrink text inside every .fit box until it fits on one line (re-run once web fonts load)
function fitText(root) {
  (root || document).querySelectorAll('.fit').forEach(el => {
    const max = parseFloat(el.dataset.max) || 14, min = parseFloat(el.dataset.min) || 7;
    let size = max; el.style.fontSize = size + 'px';
    while (el.scrollWidth > el.clientWidth + 0.5 && size > min) { size -= 0.5; el.style.fontSize = size + 'px'; }
  });
}
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitText());

// ── Avatar HTML (size in px) ──
function renderAvatar(av, name, size) {
  const a     = sanitizeAvatar(av);
  const color = _find(AVA_COLORS, a.color);
  const iconI = _find(AVA_ICONS, a.icon);
  const frame = _find(AVA_FRAMES, a.frame) || AVA_FRAMES[0];
  const inner = iconI && iconI.src
    ? `<img class="ava-img" src="${iconI.src}" alt="" draggable="false">`
    : `<span class="ava-init">${escapeHtml(String(name || '?').slice(0, 2).toUpperCase())}</span>`;
  const crown = a.frame === 'crown' ? `<span class="ava-crown">${ic('crown')}</span>` : '';
  const fimg  = frame.src ? `<img class="ava-frame-img" src="${frame.src}" alt="" draggable="false">` : '';
  const fk = frame.k ? ` fr-k fk-${frame.k}` : '';
  const fc = frame.c ? frame.c.map((c, i) => `--f${i + 1}:var(--${c}-rgb);`).join('') : '';
  return `<div class="ava fr-${frame.src ? 'custom' : a.frame}${fk}" style="--ava:${size}px;${fc}">`
    + `<div class="ava-in${color.anim ? ' holo' : ''}" style="background:${color.bg}">${inner}</div>${crown}${fimg}</div>`;
}

// ── Path trail colour → CSS vars on <html> ──
let currentTrail = TRAILS[0];
function applyTrail(trailId) {
  const t = _find(TRAILS, trailId) || TRAILS[0];
  currentTrail = t;
  const root = document.documentElement;
  root.style.setProperty('--trail-rgb', t.rgb);
  root.style.setProperty('--trail-core', t.core || '#ffffff');
  ['flow', 'pulse', 'zap', 'sparks', 'spin', 'dash'].forEach(k => root.classList.toggle('trail-' + k, !!t[k]));
  root.classList.toggle('trail-grad', !!t.grad);
  if (typeof paintTrailGradient === 'function') paintTrailGradient();
}
// Gradient <stop>s for a trail (solid trails get a subtle light→full→deep ramp so the tube looks round)
function trailStops(t) {
  const cols = t.grad || [`rgb(${t.rgb})`, `rgb(${t.rgb})`];
  return cols.map((c, i) => `<stop offset="${(i / (cols.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('');
}
// Animated mini path for the Locker (uses the same layers as the real board)
let _tpv = 0;
function trailPreviewSvg(t) {
  const id = 'tpv' + (++_tpv), d = 'M8 36 L8 12 L32 12 L32 36 L56 36 L56 12 L72 12';
  const spin = t.spin ? `<animateTransform attributeName="gradientTransform" type="rotate" from="0 40 24" to="360 40 24" dur="3s" repeatCount="indefinite"/>` : '';
  return `<svg class="trail-pv${t.flow ? ' flow' : ''}${t.pulse ? ' pulse' : ''}${t.zap ? ' zap' : ''}${t.dash ? ' dash' : ''}" viewBox="0 0 80 48" style="--trail-rgb:${t.rgb};--trail-core:${t.core || '#fff'}">
    <defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="80" y2="48">${trailStops(t)}${spin}</linearGradient></defs>
    <path class="tp-glow" d="${d}" stroke="url(#${id})"/><path class="tp-body" d="${d}" stroke="url(#${id})"/>
    <path class="tp-core" d="${d}"/>${t.flow ? `<path class="tp-flow" d="${d}"/>` : ''}
    <circle class="tp-head" cx="72" cy="12" r="5" fill="url(#${id})"/></svg>`;
}
function applyMyCosmetics() { applyTrail(getMyAvatar().trail); }

// ══════════════════════════════════════════════════
// LOCKER SCREEN
// ══════════════════════════════════════════════════
let _lockerTab = 'icon';
let _lockerDraft = null;
let _lockerQuery = '', _lockerOwned = false;
const PACK_NAMES = { cr:'critters animals', my:'mythic fantasy', cy:'cyber space robot', sn:'snacks food', ar:'arcade items', fe:'frame', fr:'frame' };
function lockerSearch(v) { _lockerQuery = String(v || '').trim().toLowerCase(); renderLocker(); }
function lockerOwnedToggle() { _lockerOwned = !_lockerOwned; renderLocker(); }
function matchesSearch(item, q) {
  if (!q) return true;
  const hay = (item.name + ' ' + item.id + ' ' + rarityOf(item).name + ' ' + (PACK_NAMES[item.id.split('-')[0]] || '')).toLowerCase();
  return q.split(/\s+/).every(w => hay.includes(w));
}

function openLocker() {
  _lockerDraft = getMyAvatar();
  _lockerTab = 'icon'; _lockerQuery = ''; _lockerOwned = false;
  document.getElementById('locker-search').value = '';
  show('locker');
  renderLocker();
}
function lockerTab(tab) { _lockerTab = tab; renderLocker(); }

function renderLocker() {
  const d = _lockerDraft;
  document.getElementById('locker-preview').innerHTML = renderAvatar(d, myName, 92);
  document.getElementById('locker-name').innerText    = myName;
  document.getElementById('locker-title').innerHTML   = titleHtml(d) || '<span class="dim">No title</span>';
  document.getElementById('locker-trail').innerHTML   = trailPreviewSvg(_find(TRAILS, d.trail) || TRAILS[0]);
  document.getElementById('locker-lvl').innerHTML     = 'Level ' + myXpLevel() + ' ' + getLevelBadge(myXpLevel());
  document.querySelectorAll('.locker-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _lockerTab));

  const grid = document.getElementById('locker-grid'); grid.innerHTML = '';
  const set  = COSMETIC_SETS[_lockerTab];
  let unlockedCount = 0, shown = 0;
  document.getElementById('locker-owned').classList.toggle('on', _lockerOwned);
  set.forEach(item => {
    const open = isUnlocked(item, _lockerTab); if (open) unlockedCount++;
    if (!matchesSearch(item, _lockerQuery) || (_lockerOwned && !open)) return;
    shown++;
    const sel  = d[_lockerTab] === item.id;
    const el   = document.createElement('button');
    const rar = rarityOf(item);
    el.className = 'locker-item r-' + rar.id + (sel ? ' sel' : '') + (open ? '' : ' locked');
    el.style.setProperty('--rar', rar.rgb);
    let inner = '';
    if (_lockerTab === 'icon')  inner = renderAvatar({ ...d, icon:item.id, frame:'none' }, myName, 44);
    if (_lockerTab === 'color') inner = renderAvatar({ ...d, color:item.id, frame:'none' }, myName, 44);
    if (_lockerTab === 'frame') inner = renderAvatar({ ...d, frame:item.id }, myName, 40);
    if (_lockerTab === 'trail') inner = trailPreviewSvg(item);
    if (_lockerTab === 'title') inner = `<div class="title-swatch fit" data-max="15" data-min="7">${titleHtml(item.id)}</div>`;
    el.innerHTML = inner
      + (_lockerTab !== 'title' ? `<span class="locker-lbl">${escapeHtml(item.name || '')}</span>` : '')
      + (rar.id !== 'starter' ? `<span class="locker-rar"></span>` : '')
      + (open ? '' : `<span class="locker-lock">${ic('lock')}</span>`);
    el.title = rar.name + (open ? '' : ' · from crates');
    el.onclick = () => {
      if (!open) { pushToast(rar.name + ' · win it from a crate in the Store', 'info', 'chest'); sfx('err'); return; }
      _lockerDraft[_lockerTab] = item.id; sfx('tap'); buzz(8);
      if (_lockerTab === 'trail') applyTrail(item.id);
      renderLocker();
    };
    grid.appendChild(el);
  });
  if (!shown) grid.innerHTML = `<div class="search-empty">${ic('search')}Nothing matches "${escapeHtml(_lockerQuery || 'unlocked')}"</div>`;
  document.getElementById('locker-count').innerText = (_lockerQuery || _lockerOwned ? shown + ' shown · ' : '') + unlockedCount + ' / ' + set.length + ' owned';
  fitText(document.getElementById('locker'));
}

function saveLocker() {
  writeSave({ avatar: sanitizeAvatar(_lockerDraft) });
  applyMyCosmetics();
  updateMenuProfile();
  syncAccountToCloud().catch(() => {});
  if (isHost && lobbyPlayers[myId]) {
    lobbyPlayers[myId].avatar = getMyAvatar();
    broadcastAll({ type:'lobby_update', players:sanitizePlayers(lobbyPlayers) });
  } else if (hostConn && hostConn.open) {
    hostConn.send({ type:'avatar', avatar:getMyAvatar() });
  }
  pushToast('Look saved', 'acc');
  show('menu');
}
function cancelLocker() { applyMyCosmetics(); show('menu'); }
