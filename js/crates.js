// ══════════════════════════════════════════════════
// js/crates.js — Cosmetic crates
//   • Buy with coins, a free key (every level up) or open a gift from a friend
//   • Open 1 (big rolling reel) or 5 / 10 at once (stacked reels; ×10 = 9× price)
//   • Pity: Epic+ guaranteed every 10 crates, Legendary+ every 50
//   • Gifting: pay for a crate that lands in a friend's inbox (database rules
//     check the sender really paid — see /gifts in tools/build-rules.js)
//   • Admin crate: admin-only cosmetics ("a-" ids, the rules block anyone else)
// Results are decided and saved BEFORE any animation, so closing the page
// mid-roll can't be used to re-roll.
// ══════════════════════════════════════════════════

const CRATES = {
  basic: { name: 'Basic Crate', price: 100, tone: 'cyan', sets: ['icon', 'color', 'frame', 'trail', 'title'],
           odds: { common: 60, rare: 27, epic: 10, legendary: 2.6, mythic: 0.4 }, desc: 'Anything can drop' },
  icon:  { name: 'Icon Crate',  price: 80,  tone: 'acc',  sets: ['icon'],
           odds: { common: 60, rare: 27, epic: 10, legendary: 2.6, mythic: 0.4 }, desc: 'Avatar icons only' },
  style: { name: 'Style Crate', price: 140, tone: 'xp',   sets: ['frame', 'trail', 'color', 'title'],
           odds: { common: 50, rare: 32, epic: 13, legendary: 4.2, mythic: 0.8 }, desc: 'Frames, trails, colours, titles' },
  elite: { name: 'Elite Crate', price: 350, tone: 'gold', sets: ['icon', 'color', 'frame', 'trail', 'title'],
           odds: { rare: 55, epic: 30, legendary: 12, mythic: 3 }, desc: 'No commons. Best odds' },
  admin: { name: 'Admin Crate', price: 0,   tone: 'danger', sets: ['color', 'frame', 'trail', 'title'], adminOnly: true,
           odds: { admin: 100 }, desc: 'Admin-only cosmetics' }
};
const RAR_ORDER = ['common', 'rare', 'epic', 'legendary', 'mythic', 'admin'];
// Duplicate refund per rarity (always below the cheapest crate, so crates can't farm coins)
const DUPE_REFUND = { common: 10, rare: 20, epic: 35, legendary: 55, mythic: 75, admin: 0 };
const PITY = { epic: 10, legendary: 50 };      // guaranteed at this many crates without one
const MULTI = { 1: 1, 5: 5, 10: 9 };           // open count → how many crates you pay for

// Keys and pity are tracked PER CRATE: { basic: 3, icon: 0, … } / { basic: { e, l }, … }
// (older saves stored one number / one {e,l} — those count as Basic)
function keyMap(v) {
  if (typeof v === 'number') return { basic: Math.max(0, v | 0) };
  const out = {}; if (v && typeof v === 'object') Object.keys(CRATES).forEach(k => { if (v[k] > 0) out[k] = v[k] | 0; });
  return out;
}
function pityMap(v) {
  if (v && typeof v === 'object' && typeof v.e === 'number') return { basic: { e: v.e | 0, l: v.l | 0 } };
  const out = {}; if (v && typeof v === 'object') Object.keys(CRATES).forEach(k => { if (v[k] && typeof v[k] === 'object') out[k] = { e: v[k].e | 0, l: v[k].l | 0 }; });
  return out;
}
function getKeys(id) { return keyMap(loadSave().crateKeys)[id || 'basic'] || 0; }
function addKeys(id, n) {
  if (typeof id === 'number') { n = id; id = 'basic'; }
  const k = keyMap(loadSave().crateKeys); k[id] = Math.max(0, (k[id] || 0) + n);
  writeSave({ crateKeys: k });
}
function getPity(id) { const p = pityMap(loadSave().pity)[id || 'basic'] || {}; return { e: p.e | 0, l: p.l | 0 }; }
function setPity(id, v) { const p = pityMap(loadSave().pity); p[id] = v; writeSave({ pity: p }); }
// Admin crate: admins open it for free; anyone else only with an admin crate key
const crateVisible = id => !CRATES[id].adminOnly || isAdminUser() || getKeys(id) > 0;
// What opening n crates costs: keys first, coins for the rest (a full coin ×10 still gets 1 free)
function crateCost(id, n) {
  const c = CRATES[id], keys = Math.min(getKeys(id), n);
  if (c.adminOnly && isAdminUser()) return { keys: 0, coins: 0, ok: true, free: true };
  if (c.adminOnly) return { keys, coins: 0, ok: keys >= n };
  const coins = (keys ? n - keys : MULTI[n]) * c.price;
  return { keys, coins, ok: getCoins() >= coins };
}
const quickOpen = () => { try { return localStorage.getItem('mz_quick_open') === '1'; } catch (e) { return false; } };
function toggleQuickOpen(el) { try { localStorage.setItem('mz_quick_open', el.checked ? '1' : ''); } catch (e) {} }

// Everything a crate can drop, grouped by rarity
function cratePool(crate) {
  const pool = {};
  crate.sets.forEach(set => COSMETIC_SETS[set].forEach(item => {
    const r = rarityOf(item).id;
    if (r === 'starter' || item.id === 'none' || (r === 'admin') !== !!crate.adminOnly) return;
    (pool[r] = pool[r] || []).push({ set, item });
  }));
  return pool;
}
function rollRarity(odds, pool, minIdx) {
  const avail = RAR_ORDER.filter((r, i) => i >= (minIdx || 0) && odds[r] && pool[r] && pool[r].length);
  if (!avail.length) return rollRarity(odds, pool, 0);
  const total = avail.reduce((t, r) => t + odds[r], 0);
  let x = Math.random() * total;
  for (const r of avail) { if ((x -= odds[r]) < 0) return r; }
  return avail[avail.length - 1];
}
const pickFrom = list => list[Math.floor(Math.random() * list.length)];
// One real roll, with pity applied
function rollWithPity(crate, pool, id) {
  if (crate.adminOnly) return pickFrom(pool.admin);
  const p = getPity(id);
  const min = p.l + 1 >= PITY.legendary ? 3 : p.e + 1 >= PITY.epic ? 2 : 0;
  const r = rollRarity(crate.odds, pool, min);
  const idx = RAR_ORDER.indexOf(r);
  setPity(id, { e: idx >= 2 ? 0 : p.e + 1, l: idx >= 3 ? 0 : p.l + 1 });
  return { ...pickFrom(pool[r]), pity: min > 0 && idx >= min };
}
// Filler for the reel (no pity side effects)
const fillerDrop = (crate, pool) => pickFrom(pool[rollRarity(crate.odds, pool, 0)]);

// ── Item preview used on reel cards, flip cards and results ──
function itemPreview({ set, item }, size) {
  const av = getMyAvatar();
  if (set === 'icon')  return renderAvatar({ ...av, icon: item.id, frame: 'none' }, myName, size);
  if (set === 'color') return renderAvatar({ ...av, color: item.id, frame: 'none' }, myName, size);
  if (set === 'frame') return renderAvatar({ ...av, frame: item.id }, myName, Math.round(size * .86));
  if (set === 'trail') return trailPreviewSvg(item);
  return `<div class="title-swatch fit" data-max="14" data-min="7">${titleHtml(item.id)}</div>`;
}
const SET_LABEL = { icon: 'Icon', color: 'Colour', frame: 'Frame', trail: 'Trail', title: 'Title' };
function crateArt(tone) {
  return `<svg viewBox="0 0 64 64" class="crate-svg" style="--ct:var(--${tone}-rgb)">
    <path class="cr-lid" d="M8 22 L32 12 L56 22 L32 32 Z"/>
    <path class="cr-left" d="M8 22 L32 32 L32 56 L8 46 Z"/>
    <path class="cr-right" d="M56 22 L32 32 L32 56 L56 46 Z"/>
    <path class="cr-band" d="M20 17 L44 27 M32 32 L32 56 M8 34 L32 44 L56 34"/>
    <circle class="cr-lock" cx="32" cy="42" r="3.2"/></svg>`;
}

// ══════════════════════════════════════════════════
// STORE SECTION
// ══════════════════════════════════════════════════
function renderCrates() {
  const el = document.getElementById('store-crates'); if (!el) return;
  const gifts = giftList();
  el.innerHTML =
      (gifts.length ? `<button class="key-banner gift" onclick="openGift()">${ic('gift')}<span><b>${gifts.length} gift${gifts.length > 1 ? 's' : ''} waiting</b><small>From ${escapeHtml(gifts[0].fromName)}${gifts.length > 1 ? ' and others' : ''} · tap to open</small></span>${ic('chevR')}</button>` : '')
    + Object.entries(CRATES).filter(([id]) => crateVisible(id)).map(([id, c]) => { const k = getKeys(id), cost = crateCost(id, 1); return `
      <button class="crate-card t-${c.tone}" onclick="openCrateSheet('${id}')">
        ${k ? `<span class="crate-keys">${ic('key')}${k}</span>` : ''}
        <div class="crate-art">${crateArt(c.tone)}</div>
        <b class="crate-name">${c.name}</b>
        <small class="crate-desc">${c.desc}</small>
        <div class="crate-odds">${RAR_ORDER.filter(r => c.odds[r]).map(r => `<span class="odd r-${r}">${c.odds[r]}%</span>`).join('')}</div>
        ${c.adminOnly ? '' : pityBars(id)}
        <span class="shop-buy${cost.ok ? '' : ' poor'}">${costHtml(cost)}</span>
      </button>`; }).join('');
}

// ── Crate sheet: pick ×1 / ×5 / ×10, or gift it ──
// Cost label: keys used and/or coins ("7 keys + 300")
function costHtml(cost) {
  if (cost.free) return 'Free';
  const parts = [];
  if (cost.keys) parts.push(`<span class="key-inline">${ic('key')}${cost.keys}</span>`);
  if (cost.coins || !cost.keys) parts.push(coinHtml(cost.coins));
  return parts.join('<i class="cost-plus">+</i>');
}
function pityBars(id) {
  const p = getPity(id);
  return `<div class="card-pity" title="Epic+ in ${PITY.epic - p.e} · Legendary+ in ${PITY.legendary - p.l}">
    <i style="--p:${p.e / PITY.epic * 100}%;--c:var(--xp-rgb)"></i><i style="--p:${p.l / PITY.legendary * 100}%;--c:var(--gold-rgb)"></i></div>`;
}
function openCrateSheet(id) {
  const c = CRATES[id]; if (!c || !crateVisible(id)) return;
  const keys = getKeys(id);
  const ov = document.getElementById('crate-open');
  ov.className = 'crate-overlay t-' + c.tone;
  const btn = n => {
    const cost = crateCost(id, n);
    if (c.adminOnly && !cost.free && cost.keys < n) return '';
    return `<button class="btn ${n === 1 ? 'primary' : 'secondary'}${cost.ok ? '' : ' poor'}" onclick="openCrates('${id}',${n})">Open ${n}<span class="sheet-cost">${costHtml(cost)}</span>${n === 10 && !cost.keys && !cost.free ? '<em>1 free</em>' : ''}</button>`;
  };
  ov.innerHTML = `
    <div class="crate-sheet">
      <button class="icon-btn sheet-x" onclick="closeCrate()">${ic('x')}</button>
      <div class="crate-art big">${crateArt(c.tone)}</div>
      <div class="crate-top"><b>${c.name}</b><span class="crate-kicker">${c.desc}${keys ? ` · you have ${keys} key${keys > 1 ? 's' : ''}` : ''}</span></div>
      <div class="sheet-odds">${RAR_ORDER.filter(r => c.odds[r]).map(r => `<span class="odd r-${r}">${r} ${c.odds[r]}%</span>`).join('')}</div>
      ${c.adminOnly ? '' : `<small class="sheet-pity">This crate's pity: Epic+ guaranteed within ${PITY.epic - getPity(id).e}, Legendary+ within ${PITY.legendary - getPity(id).l}</small>`}
      <div class="sheet-btns">${btn(1)}${btn(5)}${btn(10)}</div>
      <label class="quick-open"><input type="checkbox" ${quickOpen() ? 'checked' : ''} onchange="toggleQuickOpen(this)"><span></span>Quick open <small>skip the rolling</small></label>
      ${!c.adminOnly && authMode() === 'secure' ? `<button class="link-btn" onclick="openGiftForm('${id}')">${ic('gift')} Gift this crate to a friend</button>` : ''}
    </div>`;
  sfx('tap');
}

// ══════════════════════════════════════════════════
// OPENING
// ══════════════════════════════════════════════════
let _crateBusy = false, _reelAnim = null, _reelRaf = 0, _flipTimers = [];

// opts: { key:true } pay with keys · { gift:giftObj } already paid by a friend
async function openCrates(id, n, opts) {
  opts = opts || {};
  if (_crateBusy) return;
  const crate = CRATES[id]; if (!crate) return;
  n = MULTI[n] ? n : 1;
  if (crate.adminOnly && !isAdminUser() && !opts.gift && getKeys(id) < n) return;
  let payNote = '';
  if (opts.free) {
    if (!isAdminUser()) return;
    payNote = 'Admin';
  } else if (opts.gift) {
    try { await dbDelete('/gifts/' + currentAccount.id + '/' + opts.gift.id); }
    catch (e) { pushToast('Could not open the gift — check your internet', 'warn'); return; }
    delete _gifts[opts.gift.id];
    payNote = 'Gift from ' + opts.gift.fromName;
  } else {
    // Keys first, coins for the rest
    const cost = crateCost(id, n);
    if (!cost.ok) {
      sfx('err'); buzz(20);
      pushToast(crate.adminOnly ? 'You need an Admin Crate key' : `Need ${cost.coins - getCoins()} more coins — win levels to earn them`, 'warn', crate.adminOnly ? 'key' : 'coin');
      return;
    }
    if (cost.keys) addKeys(id, -cost.keys);
    if (cost.coins) writeSave({ coins: getCoins() - cost.coins });
    payNote = cost.free ? 'Admin' : [cost.keys ? cost.keys + ' key' + (cost.keys > 1 ? 's' : '') : '', cost.coins ? cost.coins + ' coins' : ''].filter(Boolean).join(' + ');
  }

  // Roll + save everything first
  const pool = cratePool(crate), drops = [];
  for (let i = 0; i < n; i++) {
    // Admin-crate gifts arrive with the item already chosen (and already granted by the admin)
    const pre = opts.gift && opts.gift.item ? String(opts.gift.item).split(':') : null;
    const preItem = pre && COSMETIC_SETS[pre[0]] && _find(COSMETIC_SETS[pre[0]], pre[1]);
    if (preItem) { grantItem(pre[0], preItem.id); drops.push({ set: pre[0], item: preItem, rar: rarityOf(preItem).id, dupe: false, refund: 0 }); continue; }
    const d = rollWithPity(crate, pool, id);
    const rar = rarityOf(d.item).id;
    const dupe = isUnlocked(d.item, d.set);
    const refund = dupe ? DUPE_REFUND[rar] : 0;
    if (dupe) addCoins(refund); else grantItem(d.set, d.item.id);
    drops.push({ ...d, rar, dupe, refund });
  }
  writeSave({ cratesOpened: (loadSave().cratesOpened | 0) + n });
  updateCoinUI();
  syncAccountToCloud().catch(() => {});

  _crateBusy = true;
  const again = () => opts.gift || opts.free ? false : crateCost(id, n).ok;
  const ctx = window._crateCtx = { id, n, opts, crate, pool, drops, payNote, again };
  if (quickOpen()) showGrid(ctx, true); else if (n === 1) showReel(ctx); else showStack(ctx);
}

function stageHtml(ctx, body) {
  const note = escapeHtml(ctx.payNote);
  return `<div class="crate-stage">
    <div class="crate-top"><span class="crate-kicker">${note}</span><b>${ctx.n > 1 ? ctx.n + ' × ' : ''}${ctx.crate.name}</b></div>
    ${body}
    <div class="crate-result" id="crate-result"></div>
    <div class="crate-actions" id="crate-actions"><button class="btn secondary" onclick="skipCrate()">Skip</button></div>
  </div>`;
}

// Where the reel must stop so card i sits under the centre marker (+ optional jitter)
function reelTarget(reel, i, jitter) {
  const c = reel.children[i], wrapW = reel.parentElement.clientWidth;
  return c.offsetLeft + c.offsetWidth / 2 - wrapW / 2 + (jitter || 0) * c.offsetWidth;
}
// After the spin: glide the last few pixels so the prize sits exactly centred under the marker
function settleReel(reel, i, done) {
  const now = new DOMMatrixReadOnly(getComputedStyle(reel).transform).m41;
  const pin = () => { reel.getAnimations().forEach(an => an.cancel()); reel.dataset.win = i; centerReel(reel); done(); };
  const c = reel.children[i], wrapW = reel.parentElement.clientWidth;
  const tgt = -(c.offsetLeft + c.offsetWidth / 2 - wrapW / 2);        // exact centre
  if (Math.abs(now - tgt) < 0.5) return pin();
  const a = reel.animate([{ transform: 'translateX(' + now + 'px)' }, { transform: 'translateX(' + tgt + 'px)' }], { duration: 260, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' });
  a.onfinish = pin;
}
function centerReel(reel) {
  const c = reel.children[+reel.dataset.win]; if (!c) return;
  reel.style.transform = 'translateX(' + -(c.offsetLeft + c.offsetWidth / 2 - reel.parentElement.clientWidth / 2) + 'px)';
}
// Page resized / phone rotated: keep every finished reel centred on its prize
window.addEventListener('resize', () => document.querySelectorAll('#crate-open .reel[data-win]').forEach(centerReel));

// ── ×1: the rolling reel ──
function showReel(ctx) {
  const { crate, pool, drops } = ctx, drop = drops[0];
  const ov = document.getElementById('crate-open');
  ov.className = 'crate-overlay t-' + crate.tone;
  ov.innerHTML = stageHtml(ctx, `<div class="crate-intro">${crateArt(crate.tone)}</div>
    <div class="reel-wrap" hidden><div class="reel" id="reel"></div><div class="reel-marker"></div></div>`);
  sfx('tap');
  const N = 46, WIN = 40, cards = [];
  for (let i = 0; i < N; i++) cards.push(i === WIN ? drop : fillerDrop(crate, pool));
  // A couple of teasers right next to the winner
  const teaseR = ['mythic', 'legendary'].find(r => pool[r]);
  if (teaseR) [WIN - 1, WIN + 1].forEach(i => { if (Math.random() < .5) cards[i] = pickFrom(pool[teaseR]); });
  const reel = ov.querySelector('#reel');
  reel.innerHTML = cards.map(c => {
    const r = rarityOf(c.item);
    return `<div class="reel-card r-${r.id}" style="--rar:${r.rgb}"><div class="rc-pv">${itemPreview(c, 50)}</div><small>${escapeHtml(c.item.name)}</small></div>`;
  }).join('');

  _flipTimers.push(setTimeout(() => { sfx('coin'); const i = ov.querySelector('.crate-intro'); if (i) i.classList.add('burst'); }, 650));
  _flipTimers.push(setTimeout(() => {
    if (ctx !== window._crateCtx) return;
    const intro = ov.querySelector('.crate-intro'); if (intro) intro.remove();
    ov.querySelector('.reel-wrap').hidden = false;
    fitText(reel);
    const wrapW = ov.querySelector('.reel-wrap').clientWidth;
    // Layout sizes (not getBoundingClientRect: the pop-in animation scales the reel while we measure)
    const card = reel.children[1].offsetLeft - reel.children[0].offsetLeft;
    const x = reelTarget(reel, WIN);
    _reelAnim = reel.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-x}px)` }],
      { duration: 5600, easing: 'cubic-bezier(.08,.6,.12,1)', fill: 'forwards' });
    let last = -1;
    const tick = () => {
      const tx = new DOMMatrixReadOnly(getComputedStyle(reel).transform).m41;
      const idx = Math.floor((-tx + wrapW / 2) / card);
      if (idx !== last) { last = idx; sfxCat('crates', () => reelTick(Math.floor(idx / 4))); buzz(4); }
      _reelRaf = requestAnimationFrame(tick);
    };
    _reelRaf = requestAnimationFrame(tick);
    _reelAnim.onfinish = () => settleReel(reel, WIN, () => {
      cancelAnimationFrame(_reelRaf);
      reel.classList.add('done'); reel.children[WIN].classList.add('won');
      finishReveal(ctx);
    });
  }, 1050));
}

// ── ×5 / ×10: one rolling reel per crate, stacked, stopping one after another ──
let _reelAnims = [];
function showStack(ctx) {
  const { crate, pool, drops } = ctx;
  const ov = document.getElementById('crate-open');
  ov.className = 'crate-overlay t-' + crate.tone;
  const N = 30, WIN = 24;
  ov.innerHTML = stageHtml(ctx, `<div class="crate-intro small">${crateArt(crate.tone)}</div>
    <div class="reel-stack n${ctx.n}" hidden>${drops.map((d, i) => `<div class="reel-wrap mini" style="--i:${i}"><div class="reel"></div><div class="reel-marker"></div><span class="reel-tag"></span></div>`).join('')}</div>`);
  sfx('tap');
  const reels = [...ov.querySelectorAll('.reel-stack .reel')];
  reels.forEach((reel, ri) => {
    const cards = [];
    for (let i = 0; i < N; i++) cards.push(i === WIN ? drops[ri] : fillerDrop(crate, pool));
    reel.innerHTML = cards.map(c => { const r = rarityOf(c.item); return `<div class="reel-card r-${r.id}" style="--rar:${r.rgb}"><div class="rc-pv">${itemPreview(c, 34)}</div></div>`; }).join('');
  });
  _flipTimers.push(setTimeout(() => { sfx('coin'); const i = ov.querySelector('.crate-intro'); if (i) i.classList.add('burst'); }, 550));
  _flipTimers.push(setTimeout(() => {
    if (ctx !== window._crateCtx) return;
    const intro = ov.querySelector('.crate-intro'); if (intro) intro.remove();
    ov.querySelector('.reel-stack').hidden = false;
    let left = reels.length;
    _reelAnims = reels.map((reel, ri) => {
      const wrap = reel.parentElement, wrapW = wrap.clientWidth;
      const x = reelTarget(reel, WIN);
      const anim = reel.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${-x}px)` }],
        { duration: 2600 + ri * 330, easing: 'cubic-bezier(.1,.65,.15,1)', fill: 'forwards' });
      anim.onfinish = () => settleReel(reel, WIN, () => {
        const d = drops[ri], rk = RAR_ORDER.indexOf(d.rar);
        reel.classList.add('done'); reel.children[WIN].classList.add('won');
        wrap.classList.add('landed', 'r-' + d.rar); wrap.style.setProperty('--rar', rarityOf(d.item).rgb);
        wrap.querySelector('.reel-tag').innerHTML = d.dupe ? coinHtml('+' + d.refund) : 'NEW';
        if (rk >= 3) { sfx('reward'); buzz([20, 30, 20]); spawnParticles(); } else { sfxCat('crates', () => pluck(scaleFreq(3 + rk * 2), .05)); buzz(8); }
        if (--left === 0) setTimeout(() => { if (ctx === window._crateCtx) showGrid(ctx); }, 650);
      });
      return anim;
    });
    // Ticks follow the slowest reel so it doesn't turn into noise
    const last = reels[reels.length - 1], lw = last.parentElement.clientWidth;
    const lc = last.children[1].offsetLeft - last.children[0].offsetLeft;
    let li = -1;
    const tick = () => {
      const tx = new DOMMatrixReadOnly(getComputedStyle(last).transform).m41;
      const idx = Math.floor((-tx + lw / 2) / lc);
      if (idx !== li) { li = idx; sfxCat('crates', () => reelTick(Math.floor(idx / 3))); }
      if (left > 0) _reelRaf = requestAnimationFrame(tick);
    };
    _reelRaf = requestAnimationFrame(tick);
  }, 900));
}
function skipCrate() {
  if (_reelAnim && _reelAnim.playState === 'running') { _reelAnim.finish(); return; }
  const ctx = window._crateCtx;
  if (ctx && ctx.n > 1 && !ctx.done) { cancelAnimationFrame(_reelRaf); _flipTimers.forEach(clearTimeout); _flipTimers = []; showGrid(ctx); }
}

// Results as a clean card grid (after the stacked reels, or straight away with Quick open)
function showGrid(ctx, quick) {
  if (ctx.gridShown) return; ctx.gridShown = true;
  _reelAnims.forEach(an => { try { an.cancel(); } catch (e) {} }); _reelAnims = [];
  cancelAnimationFrame(_reelRaf);
  const ov = document.getElementById('crate-open');
  if (quick) { ov.className = 'crate-overlay t-' + ctx.crate.tone; ov.innerHTML = stageHtml(ctx, ''); }
  const stage = ov.querySelector('.crate-stage');
  const old = stage.querySelector('.reel-stack, .crate-intro, .reel-wrap');
  const grid = document.createElement('div');
  grid.className = 'drop-grid n' + ctx.n;
  grid.innerHTML = ctx.drops.map((d, i) => {
    const r = rarityOf(d.item);
    return `<div class="drop-card r-${r.id}" style="--rar:${r.rgb};--i:${i}">
      <div class="rc-pv">${itemPreview(d, ctx.n === 1 ? 84 : 46)}</div>
      <b>${escapeHtml(d.item.name)}</b>
      <span class="dc-rar">${r.name}</span>
      ${d.dupe ? `<span class="fc-tag">${coinHtml('+' + d.refund)}</span>` : `<span class="fc-tag new">New</span>`}
      ${d.pity ? '<span class="fc-pity">Pity</span>' : ''}</div>`;
  }).join('');
  if (old) { old.classList.add('fold'); setTimeout(() => { old.replaceWith(grid); fitText(grid); }, 280); }
  else { stage.querySelector('.crate-top').after(grid); fitText(grid); }
  // A little sound per card as they pop in; rare ones get the big one
  ctx.drops.forEach((d, i) => _flipTimers.push(setTimeout(() => {
    const rk = RAR_ORDER.indexOf(d.rar);
    if (rk >= 3) { sfx('reward'); spawnParticles(); } else sfxCat('crates', () => pluck(scaleFreq(3 + rk * 2), .04));
  }, (old ? 300 : 0) + i * 70)));
  _flipTimers.push(setTimeout(() => finishReveal(ctx), (old ? 300 : 0) + ctx.drops.length * 70 + 150));
}

// ── Result panel + buttons ──
function finishReveal(ctx) {
  if (!ctx || ctx.done || ctx !== window._crateCtx) return; ctx.done = true;   // ignore callbacks from an older opening
  _flipTimers.forEach(clearTimeout); _flipTimers = [];
  const { drops, id, n, opts } = ctx;
  const best = drops.reduce((b, d) => RAR_ORDER.indexOf(d.rar) > RAR_ORDER.indexOf(b.rar) ? d : b, drops[0]);
  const r = rarityOf(best.item);
  const high = RAR_ORDER.indexOf(best.rar) >= 3;
  const el = document.getElementById('crate-result');
  el.style.setProperty('--rar', r.rgb);
  el.className = 'crate-result show r-' + r.id;
  if (n === 1 && !ctx.gridShown) {
    sfx(high ? 'level' : 'reward'); buzz(high ? [30, 50, 30, 50, 80] : [20, 40, 20]);
    spawnParticles(); if (high) setTimeout(spawnParticles, 350);
    el.innerHTML = `
      <div class="cres-pv">${itemPreview(best, 84)}</div>
      <div class="cres-rar">${r.name} ${SET_LABEL[best.set]}${best.pity ? ' · pity' : ''}</div>
      <div class="cres-name">${escapeHtml(best.item.name)}</div>
      <div class="cres-tag">${best.dupe ? `Duplicate · ${coinHtml('+' + best.refund)}` : `${ic('sparkle')}New! Added to your Locker`}</div>`;
  } else if (n === 1) {
    el.innerHTML = ''; el.className = 'crate-result';        // quick open: the grid card already shows it
  } else {
    const fresh = drops.filter(d => !d.dupe).length, refund = drops.reduce((t, d) => t + d.refund, 0);
    sfx(high ? 'level' : 'win'); spawnParticles();
    el.innerHTML = `<div class="cres-rar">Best: ${r.name} · ${escapeHtml(best.item.name)}</div>
      <div class="cres-tag">${ic('sparkle')}${fresh} new${refund ? ` · ${drops.length - fresh} duplicates ${coinHtml('+' + refund)}` : ''}</div>`;
  }
  fitText(el);
  document.getElementById('crate-actions').innerHTML =
    `<button class="btn secondary" onclick="closeCrate()">Close</button>`
    + (n === 1 && !best.dupe ? `<button class="btn secondary" onclick="equipDrop('${best.set}','${best.item.id}')">${ic('check')}Equip</button>` : '')
    + (ctx.again() ? `<button class="btn primary" onclick="openCrates('${id}',${n},{})">${ic('refresh')}Again</button>` : '')
    + (opts.gift && giftList().length ? `<button class="btn primary" onclick="openGift()">${ic('gift')}Next gift</button>` : '');
  _crateBusy = false;
}
function closeCrate() {
  cancelAnimationFrame(_reelRaf);
  _flipTimers.forEach(clearTimeout); _flipTimers = [];
  if (_reelAnim) { try { _reelAnim.cancel(); } catch (e) {} _reelAnim = null; }
  _reelAnims.forEach(an => { try { an.cancel(); } catch (e) {} }); _reelAnims = [];
  _crateBusy = false; window._crateCtx = null;
  const ov = document.getElementById('crate-open'); ov.className = 'crate-overlay hidden'; ov.innerHTML = '';
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
// ══════════════════════════════════════════════════
// GIFTS  (secure mode only)
// ══════════════════════════════════════════════════
let _gifts = {};
const giftList = () => Object.entries(_gifts).map(([id, g]) => ({ id, ...g })).filter(g => CRATES[g.crate]).sort((a, b) => a.at - b.at);

// Called by live.js whenever /gifts/<me> changes
function onGiftsChanged(all) {
  const prev = _gifts;
  _gifts = all && typeof all === 'object' ? all : {};
  Object.entries(_gifts).forEach(([id, g]) => {
    if (prev[id] || !g || !CRATES[g.crate]) return;
    sfx('reward'); buzz([20, 40, 20]);
    showReward({ icon: 'gift', tone: 'gold', kicker: 'Gift from ' + cleanName(g.fromName), title: CRATES[g.crate].name,
      sub: g.msg ? '"' + String(g.msg).slice(0, 60) + '"' : 'Open it in the Store', ms: 5000 });
  });
  if (isScreen('store')) renderCrates();
  const si = document.getElementById('store-info');
  if (si && giftList().length) { si.innerText = giftList().length + ' gift' + (giftList().length > 1 ? 's' : '') + '!'; si.classList.add('done'); }
}
function openGift() {
  const g = giftList()[0]; if (!g) return closeCrate();
  if (_crateBusy) return;
  closeCrate();
  openCrates(g.crate, 1, { gift: g });
}

function openGiftForm(crateId, toName) {
  const c = CRATES[crateId];
  const ov = document.getElementById('crate-open');
  ov.innerHTML = `
    <div class="crate-sheet">
      <button class="icon-btn sheet-x" onclick="closeCrate()">${ic('x')}</button>
      <div class="crate-art big">${crateArt(c.tone)}</div>
      <div class="crate-top"><b>Gift a ${c.name}</b><span class="crate-kicker">They open it themselves · costs ${coinHtml(c.price)}</span></div>
      <label class="field-box"><i data-ic="user"></i><input class="txt" id="gift-to" maxlength="16" placeholder="Friend's username" autocomplete="off" spellcheck="false"></label>
      <label class="field-box"><i data-ic="chat"></i><input class="txt" id="gift-msg" maxlength="60" placeholder="Message (optional)" autocomplete="off"></label>
      <div class="form-err" id="gift-err"></div>
      <div class="sheet-btns"><button class="btn secondary" onclick="openCrateSheet('${crateId}')">Back</button>
        <button class="btn primary" id="gift-send" onclick="sendGift('${crateId}')">${ic('gift')}Send gift</button></div>
    </div>`;
  hydrateIcons(ov);
  if (toName) document.getElementById('gift-to').value = toName;
  setTimeout(() => document.getElementById(toName ? 'gift-msg' : 'gift-to').focus(), 50);
}
async function sendGift(crateId, toNameArg, msgArg, free) {
  const c = CRATES[crateId];
  const toName = (toNameArg != null ? toNameArg : document.getElementById('gift-to').value).trim();
  const msg = (msgArg != null ? msgArg : (document.getElementById('gift-msg') || {}).value || '').trim().slice(0, 60);
  const err = t => { const e = document.getElementById('gift-err'); if (e) e.innerText = t; if (free) throw new Error(t); };
  if (authMode() !== 'secure' || !currentAccount || currentAccount.offline) return err('Gifting needs you to be signed in online.');
  if (!c || (c.adminOnly && !(free && isAdminUser()))) return err('That crate cannot be gifted.');
  if (!free && getCoins() < c.price) return err(`You need ${c.price - getCoins()} more coins.`);
  const btn = document.getElementById('gift-send'); if (btn) btn.disabled = true;
  try {
    const u = await dbGet('/usernames/' + nameKey(toName));
    const to = u && (u.acc || u.uid);
    if (!to) { if (btn) btn.disabled = false; return err('No player called "' + toName + '".'); }
    if (to === currentAccount.id) { if (btn) btn.disabled = false; return err("You can't gift yourself — open it instead!"); }
    const me = currentAccount.id;
    const gid = me + '_' + Date.now().toString(36) + randStr(4);
    const gift = { from: me, fromName: myName, crate: crateId, at: SERVER_TIME };
    if (msg) gift.msg = msg;
    if (free) {
      if (c.adminOnly) {
        // Admin crate: pick the prize now and grant it (only admins may write admin cosmetics)
        const d = pickFrom(cratePool(c).admin);
        gift.item = d.set + ':' + d.item.id;
        await dbPatch('/accounts/' + to + '/owned/' + d.set, { [d.item.id]: true });
      }
      await dbPut('/gifts/' + to + '/' + gid, gift);
      return { to, name: toName };
    }
    // One atomic multi-path write: pay + record which gift was paid for + deliver it
    const coins = getCoins() - c.price;
    await dbPatch('/', { ['accounts/' + me + '/coins']: coins, ['accounts/' + me + '/lastGift']: to + '/' + gid, ['gifts/' + to + '/' + gid]: gift });
    writeSave({ coins });
    updateCoinUI();
    sfx('buy'); buzz([10, 30, 10]);
    showReward({ icon: 'gift', tone: 'gold', kicker: 'Gift sent', title: c.name + ' → ' + cleanName(toName), chips: [{ html: coinHtml(-c.price), label: 'spent' }], quick: true });
    closeCrate();
  } catch (e) {
    if (btn) btn.disabled = false;
    if (free) throw e;
    err(e.message === 'DENIED' ? 'The server refused the gift (try again after your coins sync).' : 'Could not send — check your internet.');
  }
}
