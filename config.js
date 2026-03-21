/**
 * MAZZIE — Configuration
 * ─────────────────────────────────────────────────────────────────────────────
 * adminUids: list of full account UIDs that get admin access without a PIN.
 *            Anyone NOT in this list gets nothing when pressing F2.
 *
 * To find your UID: open the game → menu → your short ID shown under your name
 * (e.g. #_FTZ83AQ is the last 8 chars — the full UID is in localStorage under
 *  key "mazzie_uid". Open DevTools → Application → Local Storage to see it.)
 * ─────────────────────────────────────────────────────────────────────────────
 */
window.MAZZIE_CONFIG = {
  pinHash:     "5db1fee4b5703808c48078a76768b155b421b210c0761cd6a5d223f4d99f1eaa",
  firebaseUrl: "https://mazzzie-7d6bb-default-rtdb.asia-southeast1.firebasedatabase.app",

  // Add full UIDs here. These players get the admin panel instantly — no PIN.
  // Everyone else: F2 does absolutely nothing.
  adminUids: [
    "mz_mmw94igc_ftz83aq"   // placeholder — replace with your real full UID from localStorage
  ]
};
