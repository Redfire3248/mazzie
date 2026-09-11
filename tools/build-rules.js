// Builds database.rules.json from readable macros (Firebase rules have no variables)
const fs = require('fs');
const out = process.argv[2] || require('path').join(__dirname, '..', 'database.rules.json');

const ADMIN   = "(auth != null && auth.token.email_verified == true && root.child('admins').child(auth.token.email.replace('.', ',')).val() == true)";
const LOCK_MS = 900000; // 15 minutes
// Fastest legit earning: an expert solve (80 + 80 speed bonus) in ~15 s â‰ˆ 11 XP/s
const XP_PER_SEC = 12, XP_BURST = 300, MS_PER_CLEAR = 4000;
// No stamp yet (old accounts) â†’ only the small burst is allowed, never "since 1970"
const OLD_XPAT = "(data.parent().child('xpAt').isNumber() ? data.parent().child('xpAt').val() : now)";
const OLD_F   = "(data.exists() ? data.child('fails').val() : 0)";
const OLD_L   = "(data.exists() ? data.child('lockedAt').val() : 0)";
const NOT_LOCKED_NOW = `(${OLD_L} + ${LOCK_MS} < now)`;
const acctOwnerOf = (accExpr) => `root.child('accounts').child(${accExpr}).child('owner').val()`;
// Account read/write is refused while the owner is banned or under the 5-try lock
const NOT_BANNED = "(!root.child('bans').child($acc).exists() || root.child('bans').child($acc).child('until').val() < now)";
// Coins: the Store sells boosts at fixed prices, so for any write
//   earned = newCoins + cost of every boost added − oldCoins
// must be ≤ 0 (a purchase / spending), or be stamped with server time and fit the earning speed.
const BOOST_PRICES = { hint: 25, dash: 40, stop: 35, shield: 45, frost: 50, fog: 45 };
const COIN_PER_SEC = 2, COIN_BURST = 150;
const num = e => `(${e}.isNumber() ? ${e}.val() : 0)`;
const BNEW = k => num(`newData.child('boosts').child('${k}')`), BOLD = k => num(`data.child('boosts').child('${k}')`);
const BOOST_COST = Object.entries(BOOST_PRICES).map(([k, p]) => `(${BNEW(k)} > ${BOLD(k)} ? (${BNEW(k)} - ${BOLD(k)}) * ${p} : 0)`).join(' + ');
const EARNED = `(${num("newData.child('coins')")} + ${BOOST_COST} - ${num("data.child('coins')")})`;
// Crate keys come only from level-ups: every level needs ≥ 90 more XP, and XP itself is speed-limited,
// so new keys must arrive in the same write as an XP gain and fit it.
const XP_OLD = num("data.parent().child('xp')"), XP_NEW = num("newData.parent().child('xp')");
const KEYS_OK = `(newData.val() <= ${num('data')} || (${XP_NEW} > ${XP_OLD} && newData.val() - ${num('data')} <= 1 + (${XP_NEW} - ${XP_OLD}) / 90))`;
const ACC_XPAT = "(data.child('xpAt').isNumber() ? data.child('xpAt').val() : now)";
const ECONOMY = `(${ADMIN} || ${EARNED} <= 0 || (newData.child('xpAt').val() == now && ${EARNED} <= ${COIN_BURST} + (now - ${ACC_XPAT}) / 1000 * ${COIN_PER_SEC}))`;
const NOT_PIN_LOCKED =`(!data.child('nameLower').isString() || !root.child('locks').child(data.child('nameLower').val()).exists() || root.child('locks').child(data.child('nameLower').val()).child('lockedAt').val() + ${LOCK_MS} < now)`;

const rules = {
  rules: {
    '.read': false,
    '.write': false,

    // Admin list â€” only editable from the Firebase console
    admins: { '.read': ADMIN, '.write': false },

    // username key â†’ { acc, email } (public: needed to sign in by name)
    usernames: {
      '.read': true,
      '$key': {
        '.write': `${ADMIN} || (auth != null && (
            (newData.exists() && newData.child('acc').isString() && ${acctOwnerOf("newData.child('acc').val()")} == auth.uid
              && (!data.exists() || data.child('acc').val() == newData.child('acc').val() || data.child('uid').val() == newData.child('acc').val()))
         || (!newData.exists() && data.child('acc').isString() && ${acctOwnerOf("data.child('acc').val()")} == auth.uid)))`,
        '.validate': "!newData.exists() || (newData.child('acc').isString() && (!newData.child('email').exists() || newData.child('email').isString()))"
      }
    },

    // Game data. Legacy (pre-Firebase-Auth) records have no owner and stay readable until claimed.
    accounts: {
      '.read': ADMIN,
      '.indexOn': ['owner', 'nameLower'],
      '$acc': {
        '.read': `${ADMIN} || !data.child('owner').exists() || (auth != null && data.child('owner').val() == auth.uid && ${NOT_BANNED} && ${NOT_PIN_LOCKED})`,
        '.write': `${ADMIN} || (auth != null && newData.child('owner').val() == auth.uid && (
            (data.child('owner').val() == auth.uid && ${NOT_BANNED} && ${NOT_PIN_LOCKED})
         || !data.exists()
         || (data.exists() && !data.child('owner').exists() && newData.child('legacyProof').val() == data.child('pinHash').val())
         || (root.child('recovery').child($acc).child('code').isString() && newData.child('recoveryProof').val() == root.child('recovery').child($acc).child('code').val())))`,
        '.validate': `newData.child('name').isString() && newData.child('nameLower').isString() && ${ECONOMY}`,
        coins: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 10000000' },
        crateKeys: { '.validate': `newData.isNumber() && newData.val() >= 0 && newData.val() <= 9999 && (${ADMIN} || ${KEYS_OK})` },
        // Owned cosmetics: { icon|color|frame|trail|title: { id: true } }
        owned: {
          '$set': {
            '.validate': "$set.matches(/^(icon|color|frame|trail|title)$/)",
            // "a-" ids are admin cosmetics: only an admin can grant one (keeping one you were given is fine)
            '$id': { '.validate': `newData.val() == true && $id.length <= 32 && (!$id.beginsWith('a-') || data.val() == true || ${ADMIN})` }
          }
        },
        ownedV1: { '.validate': 'newData.isBoolean()' },
        pity: { '.validate': "newData.child('e').isNumber() && newData.child('l').isNumber()" },
        lastGift: { '.validate': 'newData.isString() && newData.val().length <= 64' },
        boosts: {
          ...Object.fromEntries(Object.keys(BOOST_PRICES).map(k => [k, { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 999' }])),
          '$other': { '.validate': false }
        },
        // Anti-cheat: progress can only grow at a humanly possible speed, measured with the
        // SERVER clock (xpAt must be stamped with server time whenever xp/clears go up).
        xp: { '.validate': `newData.isNumber() && newData.val() >= 0 && newData.val() <= 50000000 && (${ADMIN} || (data.exists()
              ? (newData.val() <= data.val() || (newData.parent().child('xpAt').val() == now && newData.val() - data.val() <= ${XP_BURST} + (now - ${OLD_XPAT}) / 1000 * ${XP_PER_SEC}))
              : newData.val() == 0))` },
        totalCleared: { '.validate': `newData.isNumber() && newData.val() >= 0 && (${ADMIN} || (data.exists()
              ? (newData.val() <= data.val() || (newData.parent().child('xpAt').val() == now && newData.val() - data.val() <= 3 + (now - ${OLD_XPAT}) / ${MS_PER_CLEAR}))
              : newData.val() == 0))` },
        xpAt: { '.validate': `newData.isNumber() && (${ADMIN} || newData.val() == now || newData.val() == data.val())` }
      }
    },

    // Firebase user â†’ account id
    owners: {
      '$uid': {
        '.read': `(auth != null && auth.uid == $uid) || ${ADMIN}`,
        '.write': `${ADMIN} || (auth != null && auth.uid == $uid && (!newData.exists() || ${acctOwnerOf('newData.val()')} == auth.uid))`,
        '.validate': '!newData.exists() || newData.isString()'
      }
    },

    // Recovery codes: nobody can read them back; rules compare against them during recovery
    recovery: {
      '$acc': {
        '.read': false,
        '.write': `${ADMIN} || (auth != null && ${acctOwnerOf('$acc')} == auth.uid)`,
        '.validate': "!newData.exists() || (newData.child('code').isString() && newData.child('code').val().length >= 10)"
      }
    },

    // 5 wrong PINs â†’ 15 minute lock. Counters can only move forward; only the owner
    // (after a successful sign-in, once the lock expired) or an admin can reset them.
    locks: {
      '.read': ADMIN,
      '$key': {
        '.read': true,
        '.write': `newData.exists() || ${ADMIN}`,
        '.validate': `newData.child('fails').isNumber() && newData.child('lockedAt').isNumber() && (
            ${ADMIN}
         || (${NOT_LOCKED_NOW} && newData.child('fails').val() == ${OLD_F} + 1 && newData.child('fails').val() < 5 && newData.child('lockedAt').val() == ${OLD_L})
         || (${NOT_LOCKED_NOW} && ${OLD_F} == 4 && newData.child('fails').val() == 0 && newData.child('lockedAt').val() == now)
         || (auth != null && data.exists() && ${NOT_LOCKED_NOW} && newData.child('fails').val() == 0 && newData.child('lockedAt').val() == ${OLD_L}
              && root.child('usernames').child($key).child('acc').isString()
              && ${acctOwnerOf("root.child('usernames').child($key).child('acc').val()")} == auth.uid))`
      }
    },

    // Admin bans (public read so the sign-in screen can say why)
    bans: {
      '.read': ADMIN,
      '$acc': {
        '.read': true,
        '.write': ADMIN,
        '.validate': "!newData.exists() || (newData.child('until').isNumber() && (!newData.child('reason').exists() || newData.child('reason').isString()))"
      }
    },

    // Worldwide admin message (everyone signed in listens)
    broadcast: {
      '.read': 'auth != null',
      '.write': ADMIN,
      '.validate': "newData.child('msg').isString() && newData.child('msg').val().length <= 200 && newData.child('at').val() == now"
    },

    // One-shot admin effects aimed at a single player; the player deletes it after it fires
    troll: {
      '$acc': {
        '.read': `auth != null && ${acctOwnerOf('$acc')} == auth.uid`,
        '.write': `${ADMIN} || (auth != null && !newData.exists() && ${acctOwnerOf('$acc')} == auth.uid)`,
        '.validate': "newData.child('kind').isString() && newData.child('kind').val().length <= 16 && newData.child('at').val() == now"
      }
    },

    // Gift crates. The sender pays in the SAME multi-path write that delivers the gift:
    //   accounts/<from>/coins     drops by the crate price (checked against the old value)
    //   accounts/<from>/lastGift  = this gift's id  → one paid gift per write, no double-spend
    // Recipients can read and delete (open) their own gifts; admins can send free ones.
    gifts: {
      '$to': {
        '.read': `(auth != null && ${acctOwnerOf('$to')} == auth.uid) || ${ADMIN}`,
        '$gid': {
          '.write': `${ADMIN} || (auth != null && (
              (!newData.exists() && ${acctOwnerOf('$to')} == auth.uid)
           || (newData.exists() && !data.exists() && newData.child('from').isString() && ${acctOwnerOf("newData.child('from').val()")} == auth.uid && newData.child('from').val() != $to)))`,
          '.validate': `newData.child('crate').isString() && newData.child('crate').val().matches(/^(basic|icon|style|elite)$/)
            && newData.child('at').val() == now && newData.child('fromName').isString() && newData.child('fromName').val().length <= 16
            && (!newData.child('msg').exists() || (newData.child('msg').isString() && newData.child('msg').val().length <= 60))
            && (${ADMIN} || (
                 newData.child('fromName').val() == root.child('accounts').child(newData.child('from').val()).child('name').val()
              && newData.parent().parent().parent().child('accounts').child(newData.child('from').val()).child('lastGift').val() == $to + '/' + $gid
              && newData.parent().parent().parent().child('accounts').child(newData.child('from').val()).child('coins').val()
                   <= root.child('accounts').child(newData.child('from').val()).child('coins').val()
                      - (newData.child('crate').val() == 'basic' ? 100 : newData.child('crate').val() == 'icon' ? 80 : newData.child('crate').val() == 'style' ? 140 : 350)))`
        }
      }
    },

    // Presence heartbeat (admins see who is online)
    online: {
      '.read': ADMIN,
      '$acc': {
        '.write': `auth != null && ${acctOwnerOf('$acc')} == auth.uid`,
        '.validate': "newData.child('name').isString() && newData.child('name').val().length <= 24 && newData.child('at').val() == now"
      }
    }
  }
};

// Collapse the readable whitespace inside expressions
const clean = o => { for (const k in o) { if (typeof o[k] === 'string') o[k] = o[k].replace(/\s+/g, ' ').trim(); else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) clean(o[k]); } };
clean(rules);
fs.writeFileSync(out, JSON.stringify(rules, null, 2) + '\n');
console.log('wrote', out);
