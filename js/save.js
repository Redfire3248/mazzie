// ══════════════════════════════════════════════════
// js/save.js — Persistence, XP, ranks, settings, sound
// ══════════════════════════════════════════════════

// ── SHA-256 (for admin PIN) ──
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}
function getStoredPinHash() {
  return localStorage.getItem('mazzie_pin_hash')
    || (window.MAZZIE_CONFIG && window.MAZZIE_CONFIG.pinHash)
    || null;
}
async function checkPinHash(pin) {
  return (await sha256(pin)) === getStoredPinHash();
}

// ── Save / Load ──
function loadSave()  { try { return JSON.parse(localStorage.getItem('mazzie') || '{}'); } catch(e) { return {}; } }
function writeSave(d){ const s = loadSave(); Object.assign(s, d); localStorage.setItem('mazzie', JSON.stringify(s)); }

// ── Settings (sound, haptics, auto-next) ──
function getSetting(key, def) { const s = loadSave().settings || {}; return key in s ? s[key] : def; }
function setSetting(key, val) { const s = loadSave().settings || {}; s[key] = val; writeSave({ settings: s }); }

// ── Text safety ──
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
// Names that arrive over the network are forced into the same shape accounts allow
function cleanName(n) {
  const s = String(n || '').replace(/[^a-zA-Z0-9_ -]/g, '').trim().slice(0, 16);
  return s.length >= 1 ? s : 'Racer';
}

// ── Ranks ──
const RANKS = [
  { min:0,   name:'Newbie',  icon:'seed',  color:'var(--txt2)' },
  { min:5,   name:'Rookie',  icon:'bolt',  color:'var(--acc)' },
  { min:15,  name:'Solver',  icon:'flame', color:'var(--cyan)' },
  { min:30,  name:'Pro',     icon:'gem',   color:'var(--xp)' },
  { min:60,  name:'Master',  icon:'crown', color:'var(--gold)' },
  { min:100, name:'Legend',  icon:'star',  color:'var(--orange)' },
  { min:200, name:'Mythic',  icon:'orb',   color:'var(--danger)' }
];
function rankIcon(rank) { return `<span class="rank-ic" style="color:${rank.color}">${ic(rank.icon)}</span>`; }
const DIFF_XP = { baby:10, easy:20, medium:35, hard:55, expert:80 };

function getRank(cleared) {
  let r = RANKS[0];
  for (const rk of RANKS) if (cleared >= rk.min) r = rk;
  return r;
}
function getXpLevel(xp) { return Math.floor(Math.sqrt(xp / 30)) + 1; }
function myXpLevel()    { return getXpLevel(loadSave().xp || 0); }
function xpProgressInLevel(xp) {
  const lvl  = getXpLevel(xp);
  const need = Math.pow(lvl, 2) * 30;
  const prev = Math.pow(lvl - 1, 2) * 30;
  const current = xp - prev;
  const pct = Math.round((current / (need - prev)) * 100);
  return { lvl, current, need: need - prev, pct };
}
function addXp(amount) {
  const s = loadSave();
  const before  = getXpLevel(s.xp || 0);
  const newXp   = Math.max(0, (s.xp || 0) + amount);
  writeSave({ xp: newXp });
  const after = getXpLevel(newXp);
  if (after > before) {
    spawnParticles(); sfx('level');
    const bonus = 15 * (after - before);
    if (typeof addCoins === 'function') addCoins(bonus);
    // Every level up = a free crate key
    const keys = after - before;
    if (typeof addKeys === 'function') addKeys('basic', keys);
    const chips = [{ html: coinHtml(bonus), label: 'bonus' }, { html: `<span class="coin-inline key-inline">${ic('key')}+${keys}</span>`, label: 'Basic crate key' + (keys > 1 ? 's' : '') }];
    showReward({ iconHtml: getLevelBadge(after), tone: 'xp', kicker: 'Level up', title: 'Level ' + after,
      sub: 'Your Basic Crate key is waiting in the Store', chips });
  }
  return { gained: amount, newXp, newLvl: after };
}

// ── Best times (solo, per difficulty) ──
function getBest(diff)  { return (loadSave().best || {})[diff] || null; }
function recordBest(diff, ms) {
  const best = loadSave().best || {};
  const isNew = !best[diff] || ms < best[diff];
  if (isNew) { best[diff] = ms; writeSave({ best }); }
  return isNew;
}

// ── Level badge — fixed circle, never stretches ──
// Tiers (same colour order as ranks): 0 grey · 1 green · 2 cyan · 3 violet · 4 gold · 5 orange · 6 red · 7 red pulse · 8 rainbow
function levelTier(lvl) {
  if (lvl >= 5000) return 8;
  if (lvl >= 1000) return 7;
  if (lvl >= 500)  return 6;
  if (lvl >= 200)  return 5;
  if (lvl >= 100)  return 4;
  if (lvl >= 50)   return 3;
  if (lvl >= 25)   return 2;
  if (lvl >= 10)   return 1;
  return 0;
}
function getLevelBadge(lvl) {
  lvl = Math.max(1, parseInt(lvl) || 1);
  const tier = levelTier(lvl);
  let label = lvl;
  if      (lvl >= 10000) label = '∞';
  else if (lvl >= 1000)  label = (lvl >= 1500 && lvl < 2000) ? '1.5K' : Math.floor(lvl / 1000) + 'K';
  // Shrink font for 3-digit numbers so the circle never bulges
  const fs = String(label).length >= 3 ? 'style="font-size:7px"' : '';
  return `<span class="lvl-chip t${tier}" ${fs}>${label}</span>`;
}

// ══════════════════════════════════════════════════
// SOUND + HAPTICS — tiny synthesized blips, no assets
// ══════════════════════════════════════════════════
let _actx = null, _bus = null, _dry = null, _wet = null, _noise = null;
// Signal chain:  voices → bus ─┬─ dry ──────────────┬→ tone filter → compressor → speakers
//                               └─ send → room reverb ┘
function audioBus() {
  if (!_actx) {
    const A = _actx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = A.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.25;
    const tone = A.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 6500; tone.Q.value = 0.3;
    tone.connect(comp); comp.connect(A.destination);
    _bus = A.createGain(); _bus.gain.value = 0.9;
    _dry = A.createGain(); _dry.gain.value = 1;
    _wet = A.createGain(); _wet.gain.value = 0.16;
    // Small, warm room: 1.4 s of decaying stereo noise
    const len = Math.floor(A.sampleRate * 1.4), ir = A.createBuffer(2, len, A.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const verb = A.createConvolver(); verb.buffer = ir;
    const verbTone = A.createBiquadFilter(); verbTone.type = 'lowpass'; verbTone.frequency.value = 3200;
    _bus.connect(_dry); _dry.connect(tone);
    _bus.connect(_wet); _wet.connect(verb); verb.connect(verbTone); verbTone.connect(tone);
    // Shared noise for mallet taps
    _noise = A.createBuffer(1, A.sampleRate * 0.5, A.sampleRate);
    const nd = _noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  }
  if (_actx.state === 'suspended') _actx.resume();
  return _bus;
}
function _out(pan) {
  const bus = audioBus();
  if (!pan || !_actx.createStereoPanner) return bus;
  const p = _actx.createStereoPanner(); p.pan.value = pan; p.connect(bus); return p;
}
// One voice. fm = { ratio, index } turns a sine into a bell / glass tone.
function tone({ f, to, glide, d = 0.2, v = 0.06, type = 'sine', at = 0, attack = 0.005, pan = 0, fm = null, lp = 0, lpTo = 0 }) {
  const A = _actx || (audioBus(), _actx), t = A.currentTime + 0.005 + at;
  const o = A.createOscillator(), g = A.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + (glide || Math.min(d * 0.6, 0.18)));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  if (lp) {
    const fl = A.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 0.8;
    fl.frequency.setValueAtTime(lp, t); if (lpTo) fl.frequency.exponentialRampToValueAtTime(lpTo, t + d);
    o.connect(fl); fl.connect(g);
  } else o.connect(g);
  g.connect(_out(pan));
  if (fm) {
    const m = A.createOscillator(), mg = A.createGain();
    m.frequency.value = f * fm.ratio;
    mg.gain.setValueAtTime(f * fm.index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.01, f * fm.index * 0.02), t + d * 0.55);
    m.connect(mg); mg.connect(o.frequency); m.start(t); m.stop(t + d + 0.05);
  }
  o.start(t); o.stop(t + d + 0.05);
}
// Soft filtered noise burst (mallet / wood tap)
function tap({ f = 2000, q = 1.5, d = 0.025, v = 0.03, at = 0, pan = 0 }) {
  const A = _actx || (audioBus(), _actx), t = A.currentTime + 0.005 + at;
  const src = A.createBufferSource(); src.buffer = _noise;
  const bp = A.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
  const g = A.createGain();
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(bp); bp.connect(g); g.connect(_out(pan));
  src.start(t, Math.random() * 0.3); src.stop(t + d + 0.02);
}
function whoosh({ from = 400, to = 3000, d = 0.3, v = 0.05, at = 0 }) {
  const A = _actx || (audioBus(), _actx), t = A.currentTime + 0.005 + at;
  const src = A.createBufferSource(); src.buffer = _noise; src.loop = true;
  const bp = A.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
  bp.frequency.setValueAtTime(from, t); bp.frequency.exponentialRampToValueAtTime(to, t + d);
  const g = A.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + d * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  src.connect(bp); bp.connect(g); g.connect(_out(0));
  src.start(t); src.stop(t + d + 0.05);
}
// Instruments
function marimba(f, v = 0.07, at = 0, pan = 0) {
  tone({ f, d: 0.5, v, at, pan, attack: 0.003 });                       // round body
  tone({ f: f * 3.94, d: 0.07, v: v * 0.11, at, pan, attack: 0.002 });  // woody overtone
  tap({ f: Math.min(5000, f * 2.2), q: 2.5, d: 0.018, v: v * 0.35, at, pan }); // mallet
}
function bell(f, v = 0.05, at = 0, d = 1.3, pan = 0) {
  tone({ f, d, v, at, pan, attack: 0.002, fm: { ratio: 3.5, index: 1.6 } });  // glassy bell
  tone({ f: f * 2, d: d * 0.5, v: v * 0.25, at, pan });                        // shimmer
}
function ding(f, v = 0.045, at = 0) { tone({ f, d: 0.6, v, at, attack: 0.002, fm: { ratio: 2, index: 0.9 } }); }

// Major pentatonic from G4 — every step sounds "right", in any order
const PENTA = [0, 2, 4, 7, 9];
function scaleFreq(n) { const o = Math.floor(n / 5), s = PENTA[((n % 5) + 5) % 5]; return 392 * Math.pow(2, (12 * o + s) / 12); }
// Path step: a round bubbly "pop" that climbs the scale as your path grows
let _panFlip = 1;
function pluck(f, v = 0.07) {
  _panFlip = -_panFlip;
  const p = 0.1 * _panFlip, vv = v * (0.9 + Math.random() * 0.2);
  tone({ f: f * 0.55, to: f, glide: 0.035, d: 0.16, v: vv, pan: p, attack: 0.002 });   // pop
  tone({ f: f * 2, d: 0.05, v: vv * 0.12, pan: p });                                    // sparkle on top
}
const N = n => 440 * Math.pow(2, (n - 69) / 12);        // MIDI note → Hz
// Crate reel: crisp click that climbs a little as the reel slows
function reelTick(step) { tap({ f: 1500 + Math.min(step, 12) * 70, q: 5, d: 0.02, v: 0.06 }); }
const wood = (f, v = 0.05, at = 0) => { tap({ f: f * 2.4, q: 6, d: 0.03, v: v * 0.9, at }); tone({ f, d: 0.06, v: v * 0.5, at, attack: 0.001 }); };
const brass = (n, at, d, v) => tone({ f: N(n), d, v, at, type: 'sawtooth', attack: 0.03, lp: 2400, lpTo: 700 });
// Each sound has its own instrument so nothing blends together:
//   steps = bubble pop · numbers = bell · buttons = wood · coins = ding · wins = brass fanfare
//   boosts = whoosh · errors = low buzz · messages = soft pad
const SFX = {
  node:   () => { bell(N(84), 0.05, 0, 1.1); bell(N(91), 0.02, 0.04, 0.8); },                 // bright "ting!"
  tap:    () => wood(900, 0.045),                                                                 // light wooden click
  back:   () => tone({ f: N(72), to: N(62), glide: 0.09, d: 0.13, v: 0.05 }),                  // soft "bloop" down
  pickup: () => [79, 84, 88, 91].forEach((n, i) => ding(N(n), 0.03, i * 0.045)),               // sparkle up
  coin:   () => { ding(N(83), 0.04); ding(N(88), 0.05, 0.07); },                                // "bling"
  buy:    () => { tap({ f: 3200, q: 2, d: 0.05, v: 0.05 }); ding(N(88), 0.045, 0.05); ding(N(95), 0.03, 0.12); }, // "ka-ching"
  reward: () => [72, 76, 79, 84, 88, 91].forEach((n, i) => ding(N(n), 0.035, i * 0.055)),      // glittery run
  ability:() => { whoosh({ from: 300, to: 4000, d: 0.32, v: 0.07 }); ding(N(91), 0.025, 0.22); }, // whoosh + sparkle
  hit:    () => { tone({ f: 140, to: 50, glide: 0.2, d: 0.35, v: 0.13 }); whoosh({ from: 1800, to: 200, d: 0.25, v: 0.05 }); }, // thud
  win:    () => { brass(67, 0, 0.18, 0.04); brass(72, 0.13, 0.18, 0.04); [72, 76, 79].forEach(n => brass(n, 0.28, 0.7, 0.028)); bell(N(84), 0.03, 0.28, 1.6); }, // ta-da!
  level:  () => { whoosh({ from: 200, to: 5000, d: 0.5, v: 0.05 }); [60, 67, 72, 76, 79, 84].forEach((n, i) => bell(N(n), 0.035, 0.15 + i * 0.07, 1.8)); }, // rising sparkle
  tick:   () => wood(1100, 0.06),                                                                 // countdown block
  go:     () => { tone({ f: N(79), to: N(91), glide: 0.12, d: 0.35, v: 0.06, type: 'triangle' }); bell(N(91), 0.03, 0.08, 1); }, // up-whistle
  err:    () => { tone({ f: 150, d: 0.09, v: 0.06, type: 'square', lp: 900 }); tone({ f: 120, d: 0.14, v: 0.06, type: 'square', lp: 700, at: 0.11 }); }, // "nuh-uh"
  honk:   () => { tone({ f: 330, d: 0.25, v: 0.08, type: 'sawtooth', lp: 1500 }); tone({ f: 277, d: 0.35, v: 0.08, type: 'sawtooth', lp: 1500, at: 0.28 }); },
  world:  () => [67, 71, 74].forEach((n, i) => tone({ f: N(n), d: 0.9, v: 0.035, type: 'triangle', attack: 0.06, at: i * 0.12 })), // soft pad chime
  clack:  () => wood(700, 0.05)
};
function soundOn() { return getSetting('sound', true); }
function sfx(name) {
  if (!SFX[name] || !soundOn()) return;
  try { SFX[name](); } catch (e) {}
}
// Play a custom sound only when sound is on
function sfxCat(cat, fn) { if (soundOn()) { try { fn(); } catch (e) {} } }
// Each new box in your path plays the next note up the scale (wraps after two octaves)
function sfxStep(n) {
  if (!soundOn()) return;
  try { pluck(scaleFreq((n - 1) % 10)); } catch (e) {}
}
function buzz(ms) {
  if (!getSetting('haptics', true)) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
