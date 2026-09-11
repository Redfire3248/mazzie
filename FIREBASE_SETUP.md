# Turning on secure accounts (about 5 minutes)

The game ships in **old-login mode** and keeps working exactly as before until you finish
these steps. After them you get PIN and Google sign-in, Google linking, Forgot PIN, the
5-wrong-PINs = 15-minute lock, admin bans and the admin account list, all enforced by
Firebase's servers.

Everything happens at **https://console.firebase.google.com**, in the project **mazzzie-7d6bb**.

---

## 1. Get the web keys

1. Click the gear icon next to *Project Overview*, then **Project settings**.
2. Scroll to **Your apps**. If there's no web app yet, click the **`</>`** icon, name it
   `Mazzie` and click **Register app** (skip Hosting).
3. You'll see a `firebaseConfig = { … }` block. Copy **`apiKey`** and **`appId`**.
4. Paste them into `config.js` (or send them to Claude to do it):

```js
firebaseConfig: {
  apiKey: "AIza…",            // ← here
  ...
  appId:  "1:…:web:…"         // ← and here
},
```

> These values are public by design. Every website that uses Firebase exposes them.
> Security comes from the database rules in step 4, not from hiding the key.

## 2. Switch on the sign-in methods

**Build → Authentication → Get started → Sign-in method**

- **Email/Password**: turn on the first switch only (leave "Email link" off). The game uses
  it behind the scenes for name + PIN logins.
- **Google**: turn it on and pick `redjai1981@gmail.com` as the support email.

Then go to **Authentication → Settings → Authorized domains → Add domain** and add
`redfire3248.github.io`.

## 3. Make yourself admin

**Build → Realtime Database → Data**

Hover over the top line (the database URL), click **+** and add:

| Key | Value |
|---|---|
| `admins` | *(leave empty, then click + on it)* |
| └ `redjai1981@gmail,com` | `true` |

Use a **comma** instead of each dot. Firebase keys can't contain dots.
To add another admin later, add their Gmail here the same way, and also list it in
`adminEmails` in `config.js`.

## 4. Lock the database (do this right after the new config.js is live)

**Realtime Database → Rules**: delete everything, paste the whole contents of
`database.rules.json` from this repo, then click **Publish**.

> Order matters: once these rules are live, the *old* version of the game can no longer
> read accounts. Publish the rules within a minute or two of the updated `config.js`
> going live on GitHub Pages.

## 5. Try it

1. Open the site, tap **Continue with Google** and pick `redjai1981@gmail.com`.
2. Choose a username. Save the recovery code it shows you.
3. The **Admin** button appears (a terminal icon at the top left of the menu, also in
   Settings). On a keyboard, **F2** opens it.
4. Type `accounts` to see every player, then `help account` for bans, unlocks and PIN resets.

## What happens to existing players

The first time an existing player signs in with their name + PIN, their account is
upgraded automatically, with their XP and progress kept. They're shown a recovery code, and
their old PIN hash is deleted from the database.

## Admin cheat-sheet

| Command | What it does |
|---|---|
| `accounts [search]` | Every account: level, clears, last seen, locked / banned / Google |
| `account info <name>` | Full details |
| `account ban <name> <minutes> [reason]` | Ban (the player sees the reason and a countdown) |
| `account unban <name>` | Lift a ban |
| `account unlock <name>` | Clear a 5-wrong-PIN lock early |
| `account resetpin <name>` | Give a player a temporary PIN (for players with no Google and no code) |
| `account setxp <name> <xp> [clears]` | Correct a cheater's progress |

Anyone can open the terminal panel from the browser console, but the database refuses
every account command unless you're signed in with a verified Google account that's listed
under `/admins`.

## Testing rules changes (optional)

`tools/build-rules.js` generates `database.rules.json`. `tools/rules-test.js` runs 76
security tests against the local Firebase emulator
(`npx firebase emulators:start --only auth,database`).
