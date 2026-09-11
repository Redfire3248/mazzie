// ══════════════════════════════════════════════════
// js/crates.js — Cosmetic crates: buy with coins (or a key from leveling up),
// watch the reel roll, keep what it lands on. Duplicates refund some coins.
// The result is decided and saved BEFORE the reel spins, so closing the page
// mid-roll can't be used to re-roll.
// ══════════════════════════════════════════════════

const CRATES = {
  basic: { name: 'Basic Crate', price: 100, tone: 'cyan',   sets: ['icon', 'color', 'frame', 'trail', 'title'],
           odds: { common: 60, rare: 27, epic: 10, legendary: 2.6, mythic: 0.4 }, desc: 'Anything can drop' },
  icon:  { name: 'Icon Crate',  price: 80,  tone: 'acc',    sets: ['icon'],
           odds: { common: 60, rare: 27, epic: 10, legendary: 2.6, mythic: 0.4 }, desc: 'Avatar icons only' },
  style: { name: 'Style Crate', price: 140, tone: 'xp',     sets: ['frame', 'trail', 'color', 'title'],
           odds: { common: 50, rare: 32, epic: 13, legendary: 4.2, mythic: 0.8 }, desc: 'Frames, trails, colours, titles' },
  elite: { name: 'Elite Crate', price: 350, tone: 'gold',   sets: ['icon', 'color', 'frame', 'trail', 'title'],
           odds: { rare: 55, epic: 30, legendary: 12, mythic: 3 }, desc: 'No commons. Best odds' }
};
// Duplicate refund per rarity (always below the cheapest crate, so crates can't farm coins)
const DUPE_REFUND = { common: 10, rare: 20, epic: 35, legendary: 55, mythic: 75 };
const RAR_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic'];

function getKeys() { return Math.max(0, loadSave().crateKeys | 0); }
function addKeys(n) { writeSave({ crateKeys: Math.max(0, getKeys() + n) }); }

// Everything a crate can drop, grouped by rarity
function cratePool(crate) {
  const pool = {};
  crate.sets.forEach(set => COSMETIC_SETS[set].forEach(item => {
    const r = rarityOf(item).id;
    if (r === 'starter' || item.id === 'none') return;
    (pool[r] = pool[r] || []).push({ set, item });
  }));
  return pool;
}
function rollRarity(odds, pool) {
  const avail = RAR_ORDER.filter(r => odds[r] && pool[r] && pool[r].length);
  const total = avail.reduce((t, r) => t + odds[r], 0);
  let x = Math.random() * total;
  for (const r of avail) { if ((x -= odds[r]) < 0) return r; }
  return avail[avail.length - 1];
}
function rollDrop(crate, pool) {
  const r = rollRarity(crate.odds, pool);
  const list = pool[r];
  return list[Math.floor(Math.random() * list.length)];
}

// ── Item preview used on reel cards and results ──
function itemPreview({ set, item }, size) {
  const av = getMyAvatar();
  if (set === 'icon')  return renderAvatar({ ...av, icon: item.id, frame: 'none' }, myName, size);
  if (set === 'color') return renderAvatar({ ...av, color: item.id, frame: 'none' }, myName, size);
  if (set === 'frame') return renderAvatar({ ...av, frame: item.id }, myName, Math.round(size * .86));
  if (set === 'trail') return trailPreviewSvg(item);
  return `<div class="title-swatch fit" data-max="14" data-min="7">${titleHtml(item.id)}</div>`;
}
const SET_LABEL = { icon: 'Icon', color: 'Colour', frame: 'Frame', trail: 'Trail', title: 'Title' };

// ══════════════════════════════════════════════════
// STORE SECTION
// ══════════════════════════════════════════════════
function renderCrates() {
  const el = document.getElementById('store-crates'); if (!el) return;
  const coins = getCoins(), keys = getKeys();
  el.innerHTML = (keys ? `<button class="key-banner" onclick="openCrate('basic', true)">${ic('key')}<span><b>${keys} free crate key${keys > 1 ? 's' : ''}</b><small>From leveling up · tap to open a Basic Crate</small></span>${ic('chevR')}</button>` : '')
    + Object.entries(CRATES).map(([id, c]) => `
      <div class="crate-card t-${c.tone}">
        <div class="crate-art">${crateArt(c.tone)}</div>
        <b class="crate-name">${c.name}</b>
        <small class="crate-desc">${c.desc}</small>
        <div class="crate-odds">${RAR_ORDER.filter(r => c.odds[r]).map(r => `<span class="odd r-${r}" title="${r}">${c.odds[r]}%</span>`).join('')}</div>
        <button class="shop-buy${coins >= c.price ? '' : ' poor'}" onclick="openCrate('${id}')">${coinHtml(c.price)}</button>
      </div>`).join('');
}
function crateArt(tone) {
  return `<svg viewBox="0 0 64 64" class="crate-svg" style="--ct:var(--${tone}-rgb)">
    <path class="cr-lid" d="M8 22 L32 12 L56 22 L32 32 Z"/>
    <path class="cr-left" d="M8 22 L32 32 L32 56 L8 46 Z"/>
    <path class="cr-right" d="M56 22 L32 32 L32 56 L56 46 Z"/>
    <path class="cr-band" d="M20 17 L44 27 M32 32 L32 56 M8 34 L32 44 L56 34"/>
    <circle class="cr-lock" cx="32" cy="42" r="3.2"/></svg>`;
}

// ══════════════════════════════════════════════════
// OPENING
// ══════════════════════════════════════════════════
let _crateBusy = false, _reelAnim = null, _reelRaf = 0;

function openCrate(id, useKey) {
  if (_crateBusy) return;
  const crate = CRATES[id]; if (!crate) return;
  if (useKey) {
    if (!getKeys()) return;
  } else if (getCoins() < crate.price) {
    sfx('err'); buzz(20);
    pushToast(`Need ${crate.price - getCoins()} more coins — win levels to earn them`, 'warn', 'coin');
    return;
  }
  const pool = cratePool(crate);
  const drop = rollDrop(crate, pool);
  const rar  = rarityOf(drop.item).id;
  const dupe = isUnlocked(drop.item, drop.set);
  const refund = dupe ? DUPE_REFUND[rar] : 0;

  // Pay + save the result first
  const patch = {};
  if (useKey) patch.crateKeys = getKeys() - 1; else patch.coins = getCoins() - crate.price;
  writeSave(patch);
  if (dupe) addCoins(refund); else grantItem(drop.set, drop.item.id);
  writeSave({ cratesOpened: (loadSave().cratesOpened | 0) + 1 });
  updateCoinUI();
  syncAccountToCloud().catch(() => {});

  _crateBusy = true;
  showCrateReel(id, crate, pool, drop, { rar, dupe, refund, useKey });
}

function showCrateReel(id, crate, pool, drop, res) {
  const ov = document.getElementById('crate-open');
  ov.className = 'crate-overlay t-' + crate.tone;
  ov.innerHTML = `
    <div class="crate-stage">
      <div class="crate-top"><span class="crate-kicker">${res.useKey ? 'Free key' : coinHtml(-crate.price)}</span><b>${crate.name}</b></div>
      <div class="crate-intro">${crateArt(crate.tone)}</div>
      <div class="reel-wrap" hidden><div class="reel" id="reel"></div><div class="reel-marker"></div></div>
      <div class="crate-result" id="crate-result"></div>
      <div class="crate-actions" id="crate-actions"><button class="btn secondary" onclick="skipReel()">Skip</button></div>
    </div>`;
  sfx('tap');

  // Filler cards: same odds as the crate so the reel "feels" honest, a few teasers near the winner
  const N = 46, WIN = 40, cards = [];
  for (let i = 0; i < N; i++) cards.push(i === WIN ? drop : rollDrop(crate, pool));
  const teaseR = RAR_ORDER.slice(3).find(r => pool[r]);
  if (teaseR) [WIN - 1, WIN + 1].forEach(i => { if (Math.random() < .5) cards[i] = pool[teaseR][Math.floor(Math.random() * pool[teaseR].length)]; });
  const reel = ov.querySelector('#reel');
  reel.innerHTML = cards.map((c, i) => {
    const r = rarityOf(c.item);
    return `<div class="reel-card r-${r.id}" style="--rar:${r.rgb}" data-i="${i}"><div class="rc-pv">${itemPreview(c, 50)}</div><small>${escapeHtml(c.item.name)}</small></div>`;
  }).join('');

  // Intro: the crate shakes, bursts, then the reel slides in and rolls
  setTimeout(() => { sfx('coin'); ov.querySelector('.crate-intro').classList.add('burst'); }, 650);
  setTimeout(() => {
    ov.querySelector('.crate-intro').remove();
    ov.querySelector('.reel-wrap').hidden = false;
    fitText(reel);
    const wrapW = ov.querySelector('.reel-wrap').clientWidth;
    // Layout sizes (not getBoundingClientRect: the pop-in animation scales the reel while we measure)
    const card = reel.children[1].offsetLeft - reel.children[0].offsetLeft;   // card + gap
    const jitter = (Math.random() - .5) * card * .6;
    const x = WIN * card + card / 2 - wrapW / 2 + jitter;
    _reelAnim = reel.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-x}px)` }],
      { duration: 5600, easing: 'cubic-bezier(.08,.6,.12,1)', fill: 'forwards' });
    // Tick every time a card crosses the marker (pitch rises as it slows)
    let last = -1;
    const tick = () => {
      const tx = new DOMMatrixReadOnly(getComputedStyle(reel).transform).m41;
      const idx = Math.floor((-tx + wrapW / 2) / card);
      if (idx !== last) { last = idx; pluck(scaleFreq(Math.min(12, Math.floor(idx / 4))), .05); buzz(4); }
      _reelRaf = requestAnimationFrame(tick);
    };
    _reelRaf = requestAnimationFrame(tick);
    _reelAnim.onfinish = () => revealDrop(id, crate, drop, res, reel, WIN);
  }, 1050);
}
function skipReel() {
  if (_reelAnim && _reelAnim.playState === 'running') _reelAnim.finish();
}

function revealDrop(id, crate, drop, res, reel, WIN) {
  cancelAnimationFrame(_reelRaf);
  const r = rarityOf(drop.item);
  reel.classList.add('done');
  reel.children[WIN].classList.add('won');
  const high = RAR_ORDER.indexOf(res.rar) >= 3;
  sfx(high ? 'level' : 'reward'); buzz(high ? [30, 50, 30, 50, 80] : [20, 40, 20]);
  spawnParticles(); if (high) setTimeout(spawnParticles, 350);
  const el = document.getElementById('crate-result');
  el.style.setProperty('--rar', r.rgb);
  el.className = 'crate-result show r-' + r.id;
  el.innerHTML = `
    <div class="cres-pv">${itemPreview(drop, 84)}</div>
    <div class="cres-rar">${r.name} ${SET_LABEL[drop.set]}</div>
    <div class="cres-name">${escapeHtml(drop.item.name)}</div>
    <div class="cres-tag">${res.dupe ? `Duplicate · ${coinHtml('+' + res.refund)}` : `${ic('sparkle')}New! Added to your Locker`}</div>`;
  fitText(el);
  const again = res.useKey ? getKeys() > 0 : getCoins() >= crate.price;
  document.getElementById('crate-actions').innerHTML =
    `<button class="btn secondary" onclick="closeCrate()">Close</button>`
    + (!res.dupe ? `<button class="btn secondary" onclick="equipDrop('${drop.set}','${drop.item.id}')">${ic('check')}Equip</button>` : '')
    + (again ? `<button class="btn primary" onclick="closeCrate(true);openCrate('${id}',${res.useKey})">${ic('refresh')}Again</button>` : '');
  _crateBusy = false;
}
function closeCrate(keepOpen) {
  cancelAnimationFrame(_reelRaf);
  _crateBusy = false;
  if (!keepOpen) { const ov = document.getElementById('crate-open'); ov.className = 'crate-overlay hidden'; ov.innerHTML = ''; }
  if (isScreen('store')) renderStore();
  updateMenuProfile();
}
function equipDrop(set, id) {
  const av = getMyAvatar(); av[set] = id;
  writeSave({ avatar: sanitizeAvatar(av) });
  applyMyCosmetics(); syncAccountToCloud().catch(() => {});
  pushToast('Equipped', 'acc', 'check');
  closeCrate();
}
