/**
 * MAZZIE — Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * firebaseConfig: paste the "firebaseConfig" values from
 *   Firebase console → Project settings → General → Your apps → Web app.
 *   (These values are public by design — security comes from database.rules.json.)
 *   While apiKey is empty the game keeps using the old login system.
 *   Full step-by-step: FIREBASE_SETUP.md
 *
 * adminEmails: Google accounts that see the Admin button. The real power comes
 *   from the database: the same email must also be listed under /admins
 *   (dots replaced by commas), which only you can edit in the Firebase console.
 * ─────────────────────────────────────────────────────────────────────────────
 */
window.MAZZIE_CONFIG = {
  firebaseUrl: "https://mazzzie-7d6bb-default-rtdb.asia-southeast1.firebasedatabase.app",

  firebaseConfig: {
    apiKey:            "AIzaSyC6RUpdh8xvmCHvZfD10Tar0AYRO5DAO8M",                                   // ← paste from the Firebase console
    authDomain:        "mazzzie-7d6bb.firebaseapp.com",
    databaseURL:       "https://mazzzie-7d6bb-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId:         "mazzzie-7d6bb",
    appId:             "1:953193194214:web:93ba2a0f2c7051e9d65127"                                    // ← paste from the Firebase console
  },

  adminEmails: ["redjai1981@gmail.com"],

  // Old-login fallback only (used until apiKey above is filled in)
  adminUids: ["mz_mmw94igc_ftz83aq"],
  pinHash:   "5db1fee4b5703808c48078a76768b155b421b210c0761cd6a5d223f4d99f1eaa"
};
