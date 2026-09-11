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
    if (typeof addKeys === 'function') addKeys(keys);
    const chips = [{ html: coinHtml(bonus), label: 'bonus' }, { html: `<span class="coin-inline key-inline">${ic('key')}+${keys}</span>`, label: 'crate key' + (keys > 1 ? 's' : '') }];
    showReward({ iconHtml: getLevelBadge(after), tone: 'xp', kicker: 'Level up', title: 'Level ' + after,
      sub: 'Open your free crate in the Store', chips });
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
let _actx = null, _bus = null;
function audioBus() {
  if (!_actx) {
    _actx = new (window.AudioContext || window.webkitAudioContext)();
    // Warm chain: gain → low-pass (takes the sharp edge off every sound) → gentle compressor → speakers
    const lp = _actx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.4;
    const comp = _actx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 18; comp.ratio.value = 3; comp.release.value = 0.2;
    _bus = _actx.createGain(); _bus.gain.value = 0.75;
    _bus.connect(lp); lp.connect(comp); comp.connect(_actx.destination);
  }
  if (_actx.state === 'suspended') _actx.resume();
  return _bus;
}
// One soft voice: f = start freq, to = end freq (glide), d = decay seconds. Sine/triangle only.
function tone({ f, to, d = 0.14, v = 0.06, type = 'sine', at = 0, attack = 0.008 }) {
  const bus = audioBus(), t = _actx.currentTime + at;
  const o = _actx.createOscillator(), g = _actx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + Math.min(d, 0.1));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(bus);
  o.start(t); o.stop(t + d + 0.05);
}
// Major pentatonic from G4 — mellow range, every step sounds "right" in any order
const PENTA = [0, 2, 4, 7, 9];
function scaleFreq(n) { const o = Math.floor(n / 5), s = PENTA[((n % 5) + 5) % 5]; return 392 * Math.pow(2, (12 * o + s) / 12); }
// Soft wooden "bloop" (marimba-like: round body + a whisper of the 4th partial)
function pluck(f, v = 0.07) {
  tone({ f: f * 1.015, to: f, d: 0.26, v, type: 'sine', attack: 0.006 });
  tone({ f: f * 3.98, d: 0.045, v: v * 0.07, type: 'sine', attack: 0.003 });
}
const chord = (root, steps, gap, d, v, type) => steps.forEach((st, i) => tone({ f: root * Math.pow(2, st / 12), d, v, type: type || 'sine', at: i * gap }));
const SFX = {
  node:   () => { tone({ f: 659.25, d: 0.6, v: 0.06 }); tone({ f: 987.77, d: 0.45, v: 0.025, at: 0.02 }); tone({ f: 329.63, d: 0.5, v: 0.03, type: 'triangle' }); },
  tap:    () => pluck(587.33, 0.045),
  back:   () => tone({ f: 392, to: 330, d: 0.12, v: 0.045, type: 'triangle' }),
  pickup: () => chord(523.25, [0, 4, 7, 12], 0.05, 0.26, 0.045),
  coin:   () => { tone({ f: 987.77, d: 0.1, v: 0.045, type: 'triangle' }); tone({ f: 1318.5, d: 0.35, v: 0.04, type: 'triangle', at: 0.07 }); },
  buy:    () => { SFX.coin(); chord(523.25, [0, 4, 7, 12], 0.06, 0.25, 0.04, 'triangle'); },
  reward: () => chord(523.25, [0, 4, 7, 11, 14], 0.07, 0.45, 0.045),
  ability:() => { tone({ f: 392, to: 784, d: 0.25, v: 0.05, type: 'triangle' }); tone({ f: 1174.7, d: 0.3, v: 0.025, at: 0.1 }); },
  hit:    () => { tone({ f: 196, to: 98, d: 0.35, v: 0.09, type: 'triangle' }); tone({ f: 130.8, d: 0.3, v: 0.05, at: 0.04 }); },
  win:    () => chord(523.25, [0, 4, 7, 12, 16], 0.08, 0.55, 0.05, 'triangle'),
  level:  () => chord(392, [0, 7, 12, 16, 19], 0.09, 0.7, 0.045),
  tick:   () => tone({ f: 784, d: 0.1, v: 0.05, type: 'triangle' }),
  go:     () => { tone({ f: 1046.5, d: 0.4, v: 0.055, type: 'triangle' }); tone({ f: 523.25, d: 0.45, v: 0.04, at: 0.02 }); },
  err:    () => tone({ f: 220, to: 175, d: 0.16, v: 0.06, type: 'triangle' }),
  honk:   () => { tone({ f: 330, d: 0.25, v: 0.1, type: 'sawtooth' }); tone({ f: 277, d: 0.35, v: 0.1, type: 'sawtooth', at: 0.28 }); },
  world:  () => chord(392, [0, 5, 9, 12], 0.11, 0.5, 0.045, 'triangle'),
  clack:  () => { tone({ f: 523.25, to: 440, d: 0.08, v: 0.04, type: 'triangle' }); }
};
function sfx(name) {
  if (!getSetting('sound', true) || !SFX[name]) return;
  try { SFX[name](); } catch (e) {}
}
// Each new box in your path plays the next note up the scale (wraps after two octaves)
function sfxStep(n) {
  if (!getSetting('sound', true)) return;
  try { pluck(scaleFreq((n - 1) % 10)); } catch (e) {}
}
function buzz(ms) {
  if (!getSetting('haptics', true)) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}
