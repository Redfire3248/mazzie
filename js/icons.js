// ══════════════════════════════════════════════════
// js/icons.js — Hand-drawn SVG icon set (no emoji anywhere)
//   ic(name, cls?)      → inline <svg> string (24×24 line icons, currentColor)
//   avatarGlyph(id)     → inline <svg> string (48×48 filled avatar characters)
//   hydrateIcons(root)  → replaces every <i data-ic="name"></i> with its svg
// ══════════════════════════════════════════════════

const ICONS = {
  x:        '<path d="M6 6l12 12M18 6L6 18"/>',
  check:    '<path d="M5 12.5l4.5 4.5L19 7"/>',
  undo:     '<path d="M9 5.5L4 10.5l5 5"/><path d="M4 10.5h10.5a5.5 5.5 0 0 1 0 11H10"/>',
  reset:    '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.2v4.6h4.6"/>',
  menu:     '<path d="M4 7h16M4 12h16M4 17h10"/>',
  home:     '<path d="M4 11l8-7 8 7v9.5H4z"/><path d="M10 20.5V15h4v5.5"/>',
  chat:     '<path d="M5 4.5h14a2 2 0 0 1 2 2V15a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z"/><path d="M8 10.5h.01M12 10.5h.01M16 10.5h.01"/>',
  send:     '<path d="M12 19.5V5M6 11l6-6 6 6"/>',
  copy:     '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  arrowR:   '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowL:   '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  chevL:    '<path d="M15 5l-7 7 7 7"/>',
  chevR:    '<path d="M9 5l7 7-7 7"/>',
  gear:     '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.6-2-3.4-2.4.9a7.5 7.5 0 0 0-2.6-1.5L14 2.5h-4l-.4 2.4A7.5 7.5 0 0 0 7 6.4l-2.4-.9-2 3.4 2 1.6a7.6 7.6 0 0 0 0 3l-2 1.6 2 3.4 2.4-.9a7.5 7.5 0 0 0 2.6 1.5l.4 2.4h4l.4-2.4a7.5 7.5 0 0 0 2.6-1.5l2.4.9 2-3.4z"/>',
  sound:    '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18.2 6.3a7.8 7.8 0 0 1 0 11.4"/>',
  mute:     '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>',
  vibrate:  '<rect x="7.5" y="3.5" width="9" height="17" rx="2"/><path d="M3.5 9v6M20.5 9v6"/>',
  lock:     '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>',
  unlock:   '<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.5"/>',
  user:     '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  users:    '<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M15.5 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14a6.5 6.5 0 0 1 4 6"/>',
  userX:    '<circle cx="9.5" cy="8.5" r="3.5"/><path d="M3 20a6.5 6.5 0 0 1 13 0M17 8l4 4M21 8l-4 4"/>',
  eye:      '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  trophy:   '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 5.5H5.5a2.8 2.8 0 0 0 2.8 4M16 5.5h2.5a2.8 2.8 0 0 1-2.8 4M12 13v3.5M8.5 20.5h7M10 16.5h4v4h-4z"/>',
  crown:    '<path d="M3.5 8.5l4.5 3.8 4-6.3 4 6.3 4.5-3.8-2 9.5h-13z"/><path d="M6 20.5h12"/>',
  flag:     '<path d="M5 21V4M5 4.5h11l-2.2 4 2.2 4H5"/>',
  target:   '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  swords:   '<path d="M14.5 17.5L3.5 6.5v-3h3l11 11"/><path d="M13 19l6-6M16.5 16.5l3.5 3.5"/><path d="M9.5 17.5l11-11v-3h-3l-11 11"/><path d="M11 19l-6-6M7.5 16.5L4 20"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M8 14h2M14 14h2M8 17h2"/>',
  palette:  '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.6-2.2-.5-1.3.4-2.3 1.7-2.3H18a3 3 0 0 0 2.5-3A8.5 8.5 0 0 0 12 3.5z"/><circle cx="7.6" cy="11.2" r="1.2" fill="currentColor"/><circle cx="10.6" cy="7.4" r="1.2" fill="currentColor"/><circle cx="15.2" cy="8" r="1.2" fill="currentColor"/>',
  logout:   '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h9"/>',
  login:    '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4M14 8l4 4-4 4M18 12H9"/>',
  terminal: '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M7 9.5l3 2.5-3 2.5M12.5 15H17"/>',
  link:     '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  unlink:   '<path d="M15.7 14l3-3a4 4 0 0 0-5.7-5.7l-1 1M8.3 10l-3 3a4 4 0 0 0 5.7 5.7l1-1M4 4l16 16"/>',
  key:      '<circle cx="8" cy="15.5" r="4"/><path d="M10.9 12.6L19.5 4M16 7.5l2.5 2.5M13.8 9.7l2 2"/>',
  shield:   '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/>',
  shieldOk: '<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-4.5"/>',
  bolt:     '<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>',
  bulb:     '<path d="M9 17.5h6M10 20.5h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1v1.5h5V16c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  pause:    '<circle cx="12" cy="12" r="8.5"/><path d="M10 9v6M14 9v6"/>',
  snow:     '<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>',
  fog:      '<path d="M7 14.5a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.4 1.5 3.8 3.8 0 0 1-.5 7.5z"/><path d="M4 18h12M8 21h12"/>',
  star:     '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  sparkle:  '<path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6-5.6-1.9 5.6-1.9z"/><path d="M19 3v4M17 5h4"/>',
  flame:    '<path d="M12 21.5c-3.9 0-6.5-2.7-6.5-6.2 0-3.8 3-5.8 3.5-9.3 2.2 1.3 3.2 3.3 3.2 5.2 1-.7 1.6-1.8 1.8-3.2 2.5 2 4.5 4.6 4.5 7.3 0 3.5-2.6 6.2-6.5 6.2z"/>',
  clock:    '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  plus:     '<path d="M12 5v14M5 12h14"/>',
  minus:    '<path d="M5 12h14"/>',
  dice:     '<rect x="4" y="4" width="16" height="16" rx="3.5"/><g fill="currentColor" stroke="none"><circle cx="8.5" cy="8.5" r="1.3"/><circle cx="15.5" cy="15.5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="15.5" cy="8.5" r="1.3"/><circle cx="8.5" cy="15.5" r="1.3"/></g>',
  offline:  '<path d="M3 3l18 18M8.5 6.5A6 6 0 0 1 18 9a3.8 3.8 0 0 1 2.2 6.5M16.5 16.5H7a4.5 4.5 0 0 1-1.4-8.8"/>',
  info:     '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8h.01"/>',
  alert:    '<path d="M12 3.5L2.5 20h19z"/><path d="M12 10v4.5M12 17.3h.01"/>',
  search:   '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  seed:     '<path d="M12 21v-8.5"/><path d="M12 12.5C12 8.5 9 6 4.5 6c0 4 3 6.5 7.5 6.5zM12 14.5c0-3.5 2.5-6 6.5-6 0 3.5-2.5 6-6.5 6z"/>',
  gem:      '<path d="M6.5 4h11L21 9l-9 11L3 9z"/><path d="M3 9h18M9.5 4L8 9l4 11 4-11-1.5-5"/>',
  orb:      '<circle cx="12" cy="10.5" r="6.8"/><path d="M8 20.5h8M9.8 7.8a3 3 0 0 1 3-1.8"/>',
  tier:     '<path d="M12 3l7 3v5c0 4.3-3 7.8-7 9-4-1.2-7-4.7-7-9V6z"/><path d="M8.5 9.5L12 12l3.5-2.5M8.5 13L12 15.5l3.5-2.5"/>',
  radar:    '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l6-6"/>',
  mail:     '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  refresh:  '<path d="M19.5 12a7.5 7.5 0 0 1-13 5.1M4.5 12a7.5 7.5 0 0 1 13-5.1"/><path d="M17.5 3v4h-4M6.5 21v-4h4"/>',
  grid:     '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  play:     '<path d="M7.5 5v14l11-7z"/>',
  medal:    '<circle cx="12" cy="14.5" r="5.8"/><path d="M8.6 9.8L6 3.5h4l2 4.5M15.4 9.8L18 3.5h-4l-2 4.5"/>',
  coin:     '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="5.2"/><path d="M12 9.2v5.6"/>',
  bag:      '<path d="M5 8.5h14l-1.2 11a1.8 1.8 0 0 1-1.8 1.5H8a1.8 1.8 0 0 1-1.8-1.5z"/><path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5"/>',
  shop:     '<path d="M4 9.5L5.5 4h13L20 9.5"/><path d="M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0"/><path d="M5.5 12v8.5h13V12M10 20.5v-5h4v5"/>',
  chest:    '<path d="M3.5 10.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M3.5 10.5V9a5 5 0 0 1 5-5h7a5 5 0 0 1 5 5v1.5"/><path d="M10.5 10.5v3.5h3v-3.5M3.5 14h17"/>',
  gift:     '<rect x="3.5" y="9" width="17" height="4" rx="1"/><path d="M5 13v7.5h14V13M12 9v11.5"/><path d="M12 9C10 5 6.5 5.5 7.5 7.5 8.2 9 12 9 12 9zM12 9c2-4 5.5-3.5 4.5-1.5C15.8 9 12 9 12 9z"/>',
  megaphone:'<path d="M4 10v4h3l7 4.5v-13L7 10z"/><path d="M17.5 9a4 4 0 0 1 0 6M7 14l1.5 5.5h2.5L10 14.5"/>',
  expand:   '<path d="M7 14l5-5 5 5"/>',
  collapse: '<path d="M7 10l5 5 5-5"/>',
  google:   '<g fill="none" stroke-width="3.3" stroke-linecap="butt"><path d="M12 12h8" stroke="#4285F4"/><path d="M20 12a8 8 0 0 1-2.34 5.66" stroke="#4285F4"/><path d="M17.66 17.66A8 8 0 0 1 6.34 17.66" stroke="#34A853"/><path d="M6.34 17.66A8 8 0 0 1 4.48 9.26" stroke="#FBBC05"/><path d="M4.48 9.26A8 8 0 0 1 17.66 6.34" stroke="#EA4335"/></g>'
};
// Filled (not stroked) icons
const ICON_FILLED = new Set(['bolt', 'crown', 'star', 'sparkle', 'flame', 'play']);

function ic(name, cls) {
  const body = ICONS[name]; if (!body) return '';
  const filled = ICON_FILLED.has(name);
  return `<svg class="ic ic-${name}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true" `
    + (filled ? 'fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"'
              : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"')
    + `>${body}</svg>`;
}
function hydrateIcons(root) {
  (root || document).querySelectorAll('i[data-ic]').forEach(el => {
    const t = document.createElement('template');
    t.innerHTML = ic(el.dataset.ic, el.className);
    if (t.content.firstChild) el.replaceWith(t.content.firstChild);
  });
}

// Medal for placements 1–3, plain number badge after that
function medal(i) {
  const cls = ['gold', 'silver', 'bronze'][i];
  return cls ? `<span class="medal ${cls}">${ic('medal')}<b>${i + 1}</b></span>` : `<span class="medal">#${i + 1}</span>`;
}

// ══════════════════════════════════════════════════
// AVATAR CHARACTERS (48×48, ink on the avatar colour)
// ══════════════════════════════════════════════════
const INK = '#0b0b14', WH = '#f6f6fb';
const eyes = (y, dx, r) => `<circle cx="${24 - dx}" cy="${y}" r="${r}" fill="${WH}"/><circle cx="${24 + dx}" cy="${y}" r="${r}" fill="${WH}"/>`
  + `<circle cx="${24 - dx + .6}" cy="${y + .4}" r="${r * .48}" fill="${INK}"/><circle cx="${24 + dx + .6}" cy="${y + .4}" r="${r * .48}" fill="${INK}"/>`;

const AVATAR_GLYPHS = {
  cat:
    `<path d="M11 19L12.5 6.5 20 13h8l7.5-6.5L37 19a13 12 0 1 1-26 0z" fill="${INK}"/>`
    + eyes(24, 5.5, 3) + `<path d="M22.4 29.3h3.2L24 31.2z" fill="#ff8fb1"/>`
    + `<path d="M8 27.5l7 .8M8.5 31l6.5-1M40 27.5l-7 .8M39.5 31l-6.5-1" stroke="${WH}" stroke-width="1.2" stroke-linecap="round" opacity=".7"/>`,
  dog:
    `<ellipse cx="11" cy="21" rx="5" ry="10" transform="rotate(18 11 21)" fill="${INK}"/><ellipse cx="37" cy="21" rx="5" ry="10" transform="rotate(-18 37 21)" fill="${INK}"/>`
    + `<circle cx="24" cy="24.5" r="12.5" fill="${INK}"/><ellipse cx="24" cy="30.5" rx="7" ry="5.2" fill="${WH}" opacity=".92"/>`
    + eyes(22, 5, 2.8) + `<ellipse cx="24" cy="28.2" rx="2.6" ry="1.8" fill="${INK}"/><path d="M24 30v2.2" stroke="${INK}" stroke-width="1.2" stroke-linecap="round"/>`,
  fox:
    `<path d="M8 9l12 7h8l12-7-4 18-12 12-12-12z" fill="${INK}"/><path d="M13 27l11 11.5L35 27l-5 1.5-6 4-6-4z" fill="${WH}" opacity=".92"/>`
    + eyes(23, 5.5, 2.6) + `<circle cx="24" cy="36" r="1.8" fill="${INK}"/>`,
  panda:
    `<circle cx="13" cy="13.5" r="5.5" fill="${INK}"/><circle cx="35" cy="13.5" r="5.5" fill="${INK}"/><circle cx="24" cy="25" r="14" fill="${WH}"/>`
    + `<ellipse cx="18" cy="24" rx="4" ry="5.2" transform="rotate(-25 18 24)" fill="${INK}"/><ellipse cx="30" cy="24" rx="4" ry="5.2" transform="rotate(25 30 24)" fill="${INK}"/>`
    + `<circle cx="18.6" cy="24" r="1.6" fill="${WH}"/><circle cx="29.4" cy="24" r="1.6" fill="${WH}"/><ellipse cx="24" cy="30.2" rx="2.4" ry="1.6" fill="${INK}"/>`,
  frog:
    `<circle cx="15" cy="15" r="6.5" fill="${INK}"/><circle cx="33" cy="15" r="6.5" fill="${INK}"/><ellipse cx="24" cy="28" rx="16" ry="11" fill="${INK}"/>`
    + `<circle cx="15" cy="15" r="3.6" fill="${WH}"/><circle cx="33" cy="15" r="3.6" fill="${WH}"/><circle cx="15.7" cy="15.4" r="1.8" fill="${INK}"/><circle cx="33.7" cy="15.4" r="1.8" fill="${INK}"/>`
    + `<path d="M15 29q9 7 18 0" stroke="${WH}" stroke-width="2" fill="none" stroke-linecap="round"/>`,
  octopus:
    `<path d="M10 24a14 14 0 0 1 28 0v4c0 2-1 3 1 6s0 5-2 3-3-3-4 0-3 4-4 0-2-3-3 0-3 4-4 0-2-3-3 0-3 4-4 0-3-4-5-2-3-1-1-4 2-3 1-6z" fill="${INK}"/>`
    + eyes(23, 5.5, 3) + `<path d="M21 29q3 2 6 0" stroke="${WH}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`,
  invader:
    `<path d="M14 12h4v4h-4zM30 12h4v4h-4zM18 16h12v4H18zM14 16h4v4h-4zM30 16h4v4h-4zM10 20h28v4H10zM10 24h4v4h-4zM18 24h12v4H18zM34 24h4v4h-4zM6 24h4v8H6zM38 24h4v8h-4zM10 28h28v4H10zM14 32h4v4h-4zM30 32h4v4h-4zM18 36h4v4h-4zM26 36h4v4h-4z" fill="${INK}"/>`
    + `<path d="M14 24h4v4h-4zM30 24h4v4h-4z" fill="${WH}"/>`,
  robot:
    `<path d="M24 5v5" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/><circle cx="24" cy="5" r="2.4" fill="${INK}"/>`
    + `<rect x="10" y="11" width="28" height="25" rx="7" fill="${INK}"/><rect x="6" y="19" width="4" height="9" rx="2" fill="${INK}"/><rect x="38" y="19" width="4" height="9" rx="2" fill="${INK}"/>`
    + `<rect x="14" y="16" width="20" height="9" rx="4.5" fill="#1d2b3a"/><circle cx="19" cy="20.5" r="2.4" fill="#4dfffe"/><circle cx="29" cy="20.5" r="2.4" fill="#4dfffe"/>`
    + `<path d="M17 30.5h14M20 30.5v2.5M24 30.5v2.5M28 30.5v2.5" stroke="${WH}" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>`,
  ghost:
    `<path d="M11 23a13 13 0 0 1 26 0v17l-4.3-3.5-4.4 3.5-4.3-3.5-4.3 3.5-4.4-3.5L11 40z" fill="${WH}"/>`
    + `<ellipse cx="19.5" cy="23" rx="2.6" ry="3.6" fill="${INK}"/><ellipse cx="28.5" cy="23" rx="2.6" ry="3.6" fill="${INK}"/><ellipse cx="24" cy="30.5" rx="2.4" ry="2" fill="${INK}"/>`,
  unicorn:
    `<path d="M24 3l3.5 12h-7z" fill="#ffd84d"/><path d="M21.6 8.5h4.8M20.9 11.5h6.2" stroke="${INK}" stroke-width=".9" opacity=".5"/>`
    + `<circle cx="24" cy="26" r="13" fill="${WH}"/><path d="M13 17c-4 4-4 12 0 16 0-6 2-10 6-13z" fill="#ff6bb5"/><path d="M35 17c4 4 4 12 0 16 0-6-2-10-6-13z" fill="#b67cff"/>`
    + `<path d="M17.5 25q2.5-2.4 5 0M25.5 25q2.5-2.4 5 0" stroke="${INK}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
    + `<circle cx="16.5" cy="30" r="2" fill="#ff8fb1" opacity=".8"/><circle cx="31.5" cy="30" r="2" fill="#ff8fb1" opacity=".8"/><path d="M21.5 32q2.5 1.8 5 0" stroke="${INK}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
  dragon:
    `<path d="M13 16L9 5l9 7zM35 16l4-11-9 7z" fill="${INK}"/><path d="M11 22q0-11 13-11t13 11v5q0 11-13 12-13-1-13-12z" fill="${INK}"/>`
    + `<path d="M17 13l2-5 2 4M27 12l2-4 2 5" fill="${INK}"/>`
    + `<ellipse cx="18.5" cy="23" rx="3.4" ry="2.6" fill="#ffd84d"/><ellipse cx="29.5" cy="23" rx="3.4" ry="2.6" fill="#ffd84d"/><rect x="17.9" y="20.6" width="1.2" height="4.8" rx=".6" fill="${INK}"/><rect x="28.9" y="20.6" width="1.2" height="4.8" rx=".6" fill="${INK}"/>`
    + `<circle cx="21" cy="31.5" r="1.1" fill="${WH}"/><circle cx="27" cy="31.5" r="1.1" fill="${WH}"/><path d="M18 35l2 2.5 2-2.5 2 2.5 2-2.5 2 2.5 2-2.5" stroke="${WH}" stroke-width="1.2" fill="none"/>`,
  skull:
    `<path d="M10 22a14 14 0 0 1 28 0c0 5-2 8-5 9.5V38H15v-6.5c-3-1.5-5-4.5-5-9.5z" fill="${WH}"/>`
    + `<circle cx="18.5" cy="23" r="4.2" fill="${INK}"/><circle cx="29.5" cy="23" r="4.2" fill="${INK}"/><path d="M24 27l-2.4 4h4.8z" fill="${INK}"/>`
    + `<path d="M19 38v-4M24 38v-4M29 38v-4" stroke="${INK}" stroke-width="1.6"/>`,
  flame:
    `<path d="M24 43c-8.5 0-14-5.8-14-13.2 0-8 6.4-12.4 7.4-19.8 4.7 2.8 6.8 7 6.8 11 2.1-1.5 3.4-3.8 3.9-6.8 5.3 4.2 9.9 9.8 9.9 15.6C38 37.2 32.5 43 24 43z" fill="${INK}"/>`
    + `<path d="M24 39c-3.8 0-6.3-2.5-6.3-5.8 0-3.6 3-5.4 3.6-8.6 3.8 2.2 9 5.4 9 8.6 0 3.3-2.5 5.8-6.3 5.8z" fill="#ffd84d"/>`,
  bolt:
    `<path d="M27 3L10 26.5h12.5L19.5 45 38 20H25z" fill="${INK}"/><path d="M26 8l-2.4 10.5" stroke="${WH}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`,
  gem:
    `<path d="M13 8h22l8 10.5L24 42 5 18.5z" fill="${INK}"/><path d="M5 18.5h38M17 8l-3.5 10.5L24 42l10.5-23.5L31 8" stroke="${WH}" stroke-width="1.3" fill="none" opacity=".55"/>`
    + `<path d="M13 8h8l-3.5 10.5H5z" fill="${WH}" opacity=".25"/>`,
  rocket:
    `<path d="M24 4c7 5 9.5 13 8 23H16c-1.5-10 1-18 8-23z" fill="${INK}"/><circle cx="24" cy="16.5" r="3.8" fill="${WH}"/><circle cx="24" cy="16.5" r="2" fill="#4dfffe"/>`
    + `<path d="M16 21l-6 7v5l6.8-3zM32 21l6 7v5l-6.8-3z" fill="${INK}"/>`
    + `<path d="M19 30h10l-2 6h-6z" fill="${INK}"/><path d="M21 37q3 7 6 0z" fill="#ff9f43"/>`,
  moon:
    `<path d="M33 35A15.5 15.5 0 0 1 19 8a15.5 15.5 0 1 0 20 20 15.5 15.5 0 0 1-6 7z" fill="${INK}"/>`
    + `<circle cx="36" cy="10" r="1.5" fill="${WH}"/><circle cx="41" cy="18" r="1" fill="${WH}"/><circle cx="30" cy="6" r="1" fill="${WH}"/>`,
  crown:
    `<path d="M6 16l9.5 8.5L24 11l8.5 13.5L42 16l-4 20H10z" fill="${INK}"/><rect x="10" y="37.5" width="28" height="4" rx="2" fill="${INK}"/>`
    + `<circle cx="6" cy="15" r="2.6" fill="${INK}"/><circle cx="24" cy="10" r="2.6" fill="${INK}"/><circle cx="42" cy="15" r="2.6" fill="${INK}"/>`
    + `<circle cx="24" cy="28" r="2.6" fill="${WH}"/><circle cx="16" cy="30" r="1.7" fill="${WH}" opacity=".7"/><circle cx="32" cy="30" r="1.7" fill="${WH}" opacity=".7"/>`,
  star:
    `<path d="M24 4.5l5.8 12 13.2 1.9-9.5 9.3 2.2 13.1L24 34.6l-11.7 6.2 2.2-13.1L5 18.4l13.2-1.9z" fill="${INK}"/>`
    + `<path d="M20.5 22q1.5-1.8 3 0M26.5 22q1.5-1.8 3 0M21 27q3 2.4 6 0" stroke="${WH}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
};
// Old saves / accounts stored emoji ids — map them onto the drawn set
const LEGACY_AVATAR_IDS = {
  '\u{1F431}':'cat', '\u{1F436}':'dog', '\u{1F98A}':'fox', '\u{1F43C}':'panda', '\u{1F438}':'frog', '\u{1F419}':'octopus',
  '\u{1F47E}':'invader', '\u{1F916}':'robot', '\u{1F47B}':'ghost', '\u{1F984}':'unicorn', '\u{1F432}':'dragon', '\u{1F480}':'skull',
  '\u{1F525}':'flame', '⚡':'bolt', '\u{1F48E}':'gem', '\u{1F680}':'rocket', '\u{1F319}':'moon', '\u{1F451}':'crown', '\u{1F31F}':'star'
};
function avatarGlyph(id) {
  const g = AVATAR_GLYPHS[id]; if (!g) return '';
  return `<svg class="ava-glyph" viewBox="0 0 48 48" aria-hidden="true">${g}</svg>`;
}
