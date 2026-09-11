// ══════════════════════════════════════════════════
// js/emotes.js — Battle emotes (quick reactions)
// Art: assets/emotes/*.png + emotes.json (made by tools/slice-emotes.js).
// Tap the emote button → pick one → everyone in the room sees it pop up with your avatar
// (in the lobby it pops right on your player card). Sent peer-to-peer through the host,
// max one every 1.5 s per player.
// ══════════════════════════════════════════════════

let EMOTES = [];
const EMOTE_GAP_MS = 1500;
let _lastEmote = 0;
const _hostEmoteAt = {};     // host: pid → last emote time (rate limit)

fetch('assets/emotes/emotes.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(m => {
  if (m && Array.isArray(m.emotes)) EMOTES = m.emotes.filter(e => /^em-[a-z0-9-]{1,28}$/.test(e.id) && /^[a-z0-9-]+\.png$/.test(e.file));
}).catch(() => {});
const emoteById = id => EMOTES.find(e => e.id === id);
const emoteImg = (e, cls) => `<img class="${cls || 'emote-img'}" src="assets/emotes/${e.file}" alt="${escapeHtml(e.name)}" draggable="false">`;

// ── Picker ──
function toggleEmotePicker(anchor) {
  const pop = document.getElementById('emote-pop');
  if (!pop.hidden) { pop.hidden = true; return; }
  if (!EMOTES.length) { pushToast('Emotes are still loading', 'info'); return; }
  pop.innerHTML = `<div class="emote-grid">${EMOTES.map(e => `<button class="emote-btn" onclick="sendEmote('${e.id}')" title="${escapeHtml(e.name)}">${emoteImg(e)}</button>`).join('')}</div>`;
  pop.hidden = false;
  // Open next to the button: above it when it's low on the screen, below it when it's near the top
  const r = anchor.getBoundingClientRect();
  if (r.top > window.innerHeight / 2) { pop.style.top = 'auto'; pop.style.bottom = Math.max(12, window.innerHeight - r.top + 8) + 'px'; }
  else { pop.style.bottom = 'auto'; pop.style.top = (r.bottom + 8) + 'px'; }
  sfx('tap');
}
document.addEventListener('pointerdown', e => {
  const pop = document.getElementById('emote-pop');
  if (pop && !pop.hidden && !e.target.closest('#emote-pop') && !e.target.closest('.emote-open')) pop.hidden = true;
});

function sendEmote(id) {
  document.getElementById('emote-pop').hidden = true;
  if (!emoteById(id) || !inBattleSession()) return;
  const now = Date.now();
  if (now - _lastEmote < EMOTE_GAP_MS) return;
  _lastEmote = now;
  const msg = { type: 'emote', id: myId, name: myName, e: id };
  if (isHost) relayEmote(myId, id);
  else if (hostConn && hostConn.open) hostConn.send(msg);
}
// Host: check + forward to everyone (and show it here)
function relayEmote(pid, id) {
  if (!emoteById(id) || !lobbyPlayers[pid]) return;
  const now = Date.now();
  if (now - (_hostEmoteAt[pid] || 0) < EMOTE_GAP_MS - 200) return;
  _hostEmoteAt[pid] = now;
  const out = { type: 'emote', id: pid, name: lobbyPlayers[pid].name, e: id };
  broadcastAll(out);
  showEmote(out);
}

// ── Show it ──
function showEmote(d) {
  const e = emoteById(d.e); if (!e) return;
  const p = lobbyPlayers[d.id] || playerCache[d.id] || {};
  const name = cleanName(d.name || p.name || 'Player');
  sfx('tap');
  // Lobby: pop the emote right on that player's card
  if (isScreen('lobby')) {
    const row = document.querySelector(`#players-box .p-row[data-pid="${CSS.escape(d.id)}"] .p-ava-wrap`);
    if (row) {
      const b = document.createElement('div'); b.className = 'emote-bubble'; b.innerHTML = emoteImg(e);
      row.querySelectorAll('.emote-bubble').forEach(x => x.remove());
      row.appendChild(b); setTimeout(() => b.remove(), 2600);
      return;
    }
  }
  // In a match / spectating: the emote floats up from the bottom-left with a tiny "who" tag
  const layer = document.getElementById('emote-float');
  while (layer.childElementCount >= 5) layer.firstChild.remove();
  const b = document.createElement('div');
  b.className = 'emote-rise' + (d.id === myId ? ' me' : '');
  b.style.left = Math.round(Math.random() * 36) + 'px';
  b.style.setProperty('--sway', (Math.random() < .5 ? -1 : 1) * (8 + Math.random() * 10) + 'px');
  // From someone who already finished (now watching) → say so, so players know who's cheering
  const watching = d.id !== myId && battleActive && (finishOrder.some(f => f.id === d.id) || (progressState[d.id] && progressState[d.id].done));
  if (isScreen('game')) b.classList.add('big');
  b.innerHTML = emoteImg(e, 'er-emote')
    + `<div class="er-who">${renderAvatar(sanitizeAvatar(p.avatar || {}), name, 18)}<b>${escapeHtml(d.id === myId ? 'You' : name)}</b>${watching ? '<span class="er-watch"><i data-ic="eye"></i></span>' : ''}</div>`;
  if (watching && typeof hydrateIcons === 'function') hydrateIcons(b);
  layer.appendChild(b);
  setTimeout(() => b.remove(), 3800);
}
