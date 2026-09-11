// ══════════════════════════════════════════════════
// js/auth-ui.js — Sign-in / register / Google / Forgot PIN / lock screen / Settings
// ══════════════════════════════════════════════════

let _authTab = 'login';          // 'login' | 'register'
let _forgotViaGoogle = false;    // Google sign-in started from the Forgot PIN screen

function $(id) { return document.getElementById(id); }
function setBusy(btn, busy, label) {
  if (!btn) return;
  if (busy) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  else { btn.disabled = false; btn.innerHTML = label || btn.dataset.label || btn.innerHTML; }
}

// ── Entering the game after any successful sign-in ──
function enterGame(msg) {
  accountReady = true;
  hideConnecting();
  updateMenuProfile();
  _setupContinueBtn();
  show('menu');
  if (msg) pushToast(msg, 'acc');
  if (typeof startLive === 'function') startLive();
  if (typeof migrateOwned === 'function') migrateOwned().then(() => syncAccountToCloud().catch(() => {}));
}

// Central handler for every auth result
function handleAuthResult(r, ctx) {
  if (!r) return;
  if (r.cancelled || r.redirect) return;
  hideConnecting();
  if (r.locked) { showLocked({ ms: r.locked }); return; }
  if (r.banned) { showLocked({ ms: r.banned.until - Date.now(), reason: r.banned.reason, ban: true }); return; }
  if (r.needsName) {
    if (_forgotViaGoogle) {
      _forgotViaGoogle = false;
      fbSignOut();
      showForgot(); $('forgot-err').innerText = 'That Google account is not linked to any player.';
      return;
    }
    showGoogleSetup(r.email); return;
  }
  if (r.error) {
    if (ctx === 'auto') { showAuthScreen(); $('auth-err').innerText = r.error; return; }
    const errEl = { forgot: 'forgot-err', setup: 'setup-err' }[ctx] || 'auth-err';
    $(errEl).innerText = r.error; sfx('err');
    return;
  }
  if (!r.ok) return;
  const name = r.account && r.account.name;
  const welcome = r.created ? 'Account created — welcome, ' + name + '!'
    : r.recovered ? 'PIN reset — welcome back, ' + name + '!'
    : r.migrated ? 'Account upgraded — welcome back, ' + name + '!'
    : ctx === 'auto' ? '' : 'Welcome back, ' + name + '!';
  const after = () => {
    if (_forgotViaGoogle) { _forgotViaGoogle = false; openPinModal(true, () => enterGame('PIN updated')); return; }
    enterGame(welcome);
  };
  if (r.recoveryCode) showRecoveryCode(r.recoveryCode, after, r.recovered ? 'Your old code is used up. Here is your new one:' : null);
  else after();
}

// ══════════════════════════════════════════════════
// SIGN IN / REGISTER
// ══════════════════════════════════════════════════
function showAuthScreen() {
  _authTab = 'login';
  show('auth');
  $('auth-main').hidden = false; $('auth-setup').hidden = true;
  const secure = authMode() === 'secure';
  $('auth-google-btn').hidden = !secure;
  $('auth-or').hidden = !secure;
  $('auth-forgot-link').hidden = !secure;
  renderAuthTab();
  setTimeout(() => { if (!matchMedia('(pointer:coarse)').matches) $('auth-name-input').focus(); }, 250);
}
function authSwitchTab(tab) { _authTab = tab; renderAuthTab(); }
function renderAuthTab() {
  const reg = _authTab === 'register';
  $('auth-tab-login').classList.toggle('active', !reg);
  $('auth-tab-reg').classList.toggle('active', reg);
  $('auth-heading').innerText = reg ? 'Create account' : 'Welcome back';
  $('auth-sub').innerText     = reg ? 'Pick a unique name and a PIN' : 'Sign in with your name and PIN';
  $('auth-submit-btn').innerHTML = (reg ? 'Create account' : 'Sign in') + ic('arrowR');
  $('auth-pin2-field').hidden = !reg;
  $('auth-forgot-link').style.visibility = reg ? 'hidden' : '';
  $('auth-err').innerText = '';
  $('auth-name-status').innerText = '';
  $('auth-pin-input').value = ''; $('auth-pin2-input').value = '';
}

let _nameCheckT = null;
function liveNameCheck(inputId, statusId, onlyWhen) {
  if (onlyWhen && !onlyWhen()) return;
  const val = $(inputId).value.trim(), el = $(statusId);
  clearTimeout(_nameCheckT);
  if (val.length < 2) { el.innerText = ''; el.className = 'name-status'; return; }
  el.innerText = 'Checking…'; el.className = 'name-status';
  _nameCheckT = setTimeout(async () => {
    const st = await checkNameAvailable(val);
    if ($(inputId).value.trim() !== val) return;
    el.className = 'name-status ' + (st === 'available' ? 'ok' : 'bad');
    el.innerHTML = st === 'available' ? ic('check') + 'Available' : st === 'taken' ? ic('x') + 'Already taken' : st === 'invalid' ? ic('x') + 'Letters, numbers and spaces only' : 'Could not check';
  }, 450);
}
function authCheckName() { liveNameCheck('auth-name-input', 'auth-name-status', () => _authTab === 'register'); }

async function authSubmit() {
  const name = $('auth-name-input').value.trim();
  const pin  = $('auth-pin-input').value.trim();
  const btn  = $('auth-submit-btn');
  $('auth-err').innerText = '';
  if (_authTab === 'register' && pin !== $('auth-pin2-input').value.trim()) { $('auth-err').innerText = 'The two PINs do not match.'; return; }
  setBusy(btn, true);
  const secure = authMode() === 'secure';
  const r = _authTab === 'register'
    ? await (secure ? secureRegister(name, pin) : legacyRegister(name, pin))
    : await (secure ? secureSignInPin(name, pin) : legacyLogin(name, pin));
  setBusy(btn, false, (_authTab === 'register' ? 'Create account' : 'Sign in') + ic('arrowR'));
  if (!secure && r.ok) { r.created = _authTab === 'register'; }
  handleAuthResult(r, 'auth');
}

async function authGoogle(fromForgot) {
  _forgotViaGoogle = !!fromForgot;
  const btn = fromForgot ? $('forgot-google-btn') : $('auth-google-btn');
  setBusy(btn, true);
  const r = await secureGoogleSignIn();
  setBusy(btn, false);
  handleAuthResult(r, fromForgot ? 'forgot' : 'auth');
}

// ── First Google sign-in: pick a username ──
function showGoogleSetup(email) {
  show('auth');
  $('auth-main').hidden = true; $('auth-setup').hidden = false;
  $('setup-email').innerText = email ? 'Signed in as ' + email : 'Signed in with Google';
  $('setup-name-input').value = ''; $('setup-err').innerText = ''; $('setup-name-status').innerText = '';
}
function setupCheckName() { liveNameCheck('setup-name-input', 'setup-name-status'); }
async function setupSubmit() {
  const btn = $('setup-submit-btn');
  setBusy(btn, true);
  const r = await completeGoogleSignup($('setup-name-input').value);
  setBusy(btn, false);
  handleAuthResult(r, 'setup');
}
function setupCancel() { fbSignOut(); showAuthScreen(); }

// ══════════════════════════════════════════════════
// FORGOT PIN
// ══════════════════════════════════════════════════
function showForgot() {
  show('forgot');
  ['forgot-err'].forEach(id => $(id).innerText = '');
  $('forgot-name').value = $('auth-name-input').value.trim();
  ['forgot-code', 'forgot-pin', 'forgot-pin2'].forEach(id => $(id).value = '');
}
async function forgotSubmitCode() {
  const pin = $('forgot-pin').value.trim();
  if (pin !== $('forgot-pin2').value.trim()) { $('forgot-err').innerText = 'The two PINs do not match.'; return; }
  const btn = $('forgot-code-btn');
  setBusy(btn, true);
  const r = await recoverWithCode($('forgot-name').value, $('forgot-code').value, pin);
  setBusy(btn, false);
  handleAuthResult(r, 'forgot');
}

// ══════════════════════════════════════════════════
// LOCKED / BANNED SCREEN (live countdown)
// ══════════════════════════════════════════════════
let _lockT = null;
function showLocked({ ms, reason, ban }) {
  show('locked');
  const end = Date.now() + Math.max(0, ms);
  $('locked-title').innerText = ban ? 'Account banned' : 'Too many wrong PINs';
  $('locked-sub').innerText   = ban ? 'An admin has banned this account.' : 'For your safety this account is locked. Try again when the timer ends.';
  $('locked-reason').innerText = reason ? 'Reason: ' + reason : '';
  $('locked-reason').hidden = !reason;
  clearInterval(_lockT);
  const tick = () => {
    const left = end - Date.now();
    if (left <= 0) { clearInterval(_lockT); $('locked-time').innerText = '0:00'; $('locked-back').innerHTML = ic('arrowL') + 'Back to sign in'; return; }
    const total = ms > 86400000 ? null : ms;
    $('locked-time').innerText = left > 3600000 ? Math.ceil(left / 3600000) + 'h' : fmtWait(left);
    if (total) $('locked-ring').style.setProperty('--p', (left / total * 100).toFixed(1));
  };
  tick(); _lockT = setInterval(tick, 250);
  sfx('err'); buzz([40, 30, 40]);
}
function lockedBack() { clearInterval(_lockT); showAuthScreen(); }

// ══════════════════════════════════════════════════
// RECOVERY CODE MODAL + PIN MODAL
// ══════════════════════════════════════════════════
let _codeDone = null;
function showRecoveryCode(code, done, lead) {
  _codeDone = done;
  $('code-lead').innerText = lead || 'If you ever forget your PIN, this code gets you back in.';
  $('code-value').innerText = code;
  $('code-modal').classList.remove('hidden');
}
function copyRecoveryCode() {
  const code = $('code-value').innerText;
  navigator.clipboard && navigator.clipboard.writeText(code).then(() => pushToast('Code copied', 'acc')).catch(() => {});
}
function closeRecoveryCode() { $('code-modal').classList.add('hidden'); const f = _codeDone; _codeDone = null; if (f) f(); }

let _pinDone = null, _pinForced = false;
function openPinModal(forced, done) {
  _pinDone = done || null; _pinForced = !!forced;
  const hasPin = authMode() === 'secure' && accountHasPin();
  $('pin-modal-title').innerText = forced ? 'Set a new PIN' : hasPin ? 'Change PIN' : 'Set a PIN';
  $('pin-modal-sub').innerText = forced ? 'You are signed in with Google. Choose the PIN you will use from now on.'
    : hasPin ? 'Enter your current PIN, then the new one.' : 'Add a PIN so you can also sign in with your name.';
  $('pin-cur-field').hidden = forced || !hasPin;
  ['pin-cur', 'pin-new', 'pin-new2'].forEach(id => $(id).value = '');
  $('pin-err').innerText = '';
  $('pin-cancel').hidden = forced;
  $('pin-modal').classList.remove('hidden');
}
async function savePinModal() {
  const p1 = $('pin-new').value.trim();
  if (p1 !== $('pin-new2').value.trim()) { $('pin-err').innerText = 'The two PINs do not match.'; return; }
  const btn = $('pin-save');
  setBusy(btn, true);
  const r = await setAccountPin(p1, $('pin-cur-field').hidden ? null : $('pin-cur').value.trim());
  setBusy(btn, false);
  if (r.locked) { closePinModal(true); logoutAccount(); showLocked({ ms: r.locked }); return; }
  if (r.error) { $('pin-err').innerText = r.error; sfx('err'); return; }
  closePinModal(true);
  pushToast('PIN saved', 'acc');
  renderSettings();
  if (_pinDone) { const f = _pinDone; _pinDone = null; f(); }
}
function closePinModal(ok) {
  if (_pinForced && !ok) return;
  $('pin-modal').classList.add('hidden');
  if (!ok && _pinDone) { const f = _pinDone; _pinDone = null; f(); }
}

// ══════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════
function openSettings() { show('settings'); renderSettings(); }
function renderSettings() {
  const mode = authMode(), secure = mode === 'secure';
  const acc = currentAccount || {};
  $('set-ava').innerHTML  = renderAvatar(getMyAvatar(), myName, 48);
  $('set-name').innerText = myName;
  $('set-meta').innerText = mode === 'local' ? 'Offline guest profile'
    : acc.offline ? 'Offline — changes sync later'
    : secure ? (accountHasGoogle() && accountHasPin() ? 'Signs in with PIN or Google' : accountHasGoogle() ? 'Signs in with Google' : 'Signs in with PIN')
    : 'Signs in with PIN';

  // Google link row
  const gRow = $('set-google');
  if (!secure) {
    gRow.querySelector('.set-val').innerText = mode === 'local' ? 'Not available offline' : 'Not set up yet (admin: see FIREBASE_SETUP.md)';
    $('set-google-btn').hidden = true;
  } else {
    const linked = accountHasGoogle();
    const g = _authUser && _authUser.providerData.find(p => p.providerId === 'google.com');
    gRow.querySelector('.set-val').innerText = linked ? (g && g.email) || 'Linked' : 'Not linked';
    // Once linked it stays linked (no Unlink button)
    $('set-google-btn').hidden = linked;
    $('set-google-btn').innerHTML = ic('link') + 'Link';
  }
  // PIN + recovery rows (secure only)
  $('set-pin').hidden = !secure;
  $('set-recovery').hidden = true;          // the recovery-code row was removed from Settings
  if (secure) $('set-pin-btn').innerHTML = ic('key') + (accountHasPin() ? 'Change' : 'Set PIN');
  // Toggles
  setToggle('set-sound', getSetting('sound', true));
  setToggle('set-haptics', getSetting('haptics', true));
  setToggle('set-autonext', getSetting('autoNext', false));
  // Admin
  $('set-admin').hidden = !isAdminUser();
}
function setToggle(id, on) { const b = $(id); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }
function settingToggle(key, def) {
  setSetting(key, !getSetting(key, def));
  syncSoundBtn(); syncAutoNextToggle(); renderSettings(); sfx('tap');
}
async function settingsGoogle() {
  const btn = $('set-google-btn');
  setBusy(btn, true);
  if (accountHasGoogle()) { setBusy(btn, false); return; }
  const r = await linkGoogle();
  setBusy(btn, false);
  if (r && r.error) { pushToast(r.error, 'warn'); return; }
  if (r && r.ok) pushToast(r.email ? 'Google linked: ' + r.email : 'Google unlinked', 'acc');
  renderSettings();
}
async function settingsNewCode() {
  if (!confirm('Make a new recovery code? Your old one will stop working.')) return;
  const r = await regenerateRecoveryCode();
  if (r.error) { pushToast(r.error, 'warn'); return; }
  showRecoveryCode(r.code, null);
}

// ── Enter key on auth forms ──
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (isScreen('auth')) { e.preventDefault(); $('auth-setup').hidden ? authSubmit() : setupSubmit(); }
  else if (isScreen('forgot') && document.activeElement && document.activeElement.closest('#forgot-code-form')) { e.preventDefault(); forgotSubmitCode(); }
  else if (!$('pin-modal').classList.contains('hidden')) { e.preventDefault(); savePinModal(); }
});
