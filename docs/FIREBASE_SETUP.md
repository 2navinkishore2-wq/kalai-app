# KALAI DIGITAL — Firebase setup

This guide configures cloud sync and Google Sign-In. If you only want local billing, skip this page: the app works fully offline in Demo mode with no Firebase project.

---

## 1. Create the Firebase project

1. Open <https://console.firebase.google.com> and create a project (the free **Spark** plan is enough for a single shop).
2. Disable Google Analytics if you do not need it.

## 2. Add the web app

1. **Project settings → General → Your apps → Web (`</>`)**.
2. Register the app (e.g. `KALAI DIGITAL Web`).
3. Copy the generated `firebaseConfig` values into `.env`:

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

The web API key is a public identifier, not a password. Access is controlled by Firestore rules and Firebase Auth.

## 3. Enable Google Sign-In

1. **Authentication → Sign-in method → Google → Enable**.
2. Set a support email.
3. Under **Authentication → Settings → Authorized domains**, add your production domain (if you host the web app). `localhost` is present by default and is what the Electron app uses.

## 4. Create Firestore and deploy rules

1. **Firestore Database → Create database → Production mode**.
2. Choose a region close to the shop (e.g. `asia-south1`).
3. Deploy `firebase/firestore.rules`:

```bash
npx firebase-tools login
npx firebase-tools use --add
npx firebase-tools deploy --only firestore:rules
```

Or paste the contents of `firebase/firestore.rules` into **Firestore → Rules → Publish**.

The rules allow a signed-in user to read/write only `users/{their-uid}/**`. KALAI stores every document under:

```
users/{uid}/apps/kalai/{collection}/{doc}
```

`users/{uid}/apps/kalai` is a document path (four segments). Firestore requires collection paths to have an odd number of segments, so an earlier `users/{uid}/kalai/{collection}` layout could not be opened with `collection()` and crashed cloud startup. `apps/kalai` keeps the app-specific namespace without that invalid segment count.

This keeps the data isolated even if the Firebase project is shared with another app.

### Collections

| Collection | Contents |
|---|---|
| `customers` | Customer profiles (name required, phone optional) |
| `bills` | Invoices, items, payments, status, version, cancellation |
| `payments` | Payment receipts (bill-level and standalone) |
| `expenses` | Shop expenses |
| `inventory` | Optional stock items |
| `stockTxns` | Stock movements |
| `auditLogs` | Create/update/payment/cancel/restore history |
| `productConfigs` | Five product pricing configurations |
| `frameSizes` | 19-size fixed frame price table |
| `settings` | Business identity, tax, invoice numbering, language, access |
| `counters` | Invoice sequence per prefix/year |

On first sign-in the app seeds the five product configs (sq.ft rates at 0), the 19 frame prices, default settings and one example inventory item. Seeding is idempotent and never overwrites existing edits.

## 5. Android Google Sign-In

The APK package name is:

```
com.kalaidigital.billing
```

Google requires an **Android OAuth client** for that exact package and signing certificate. Registering the web app alone is not enough.

### 5.1 Get the SHA-1

From the project root:

```bash
npm run android:shas
```

This prints the debug keystore fingerprint (and the release one when `android/keystore.properties` exists).

### 5.2 Register the Android app

1. Firebase Console → **Project settings → Your apps → Add app → Android**.
2. Package name: `com.kalaidigital.billing`.
3. Nickname: `KALAI DIGITAL`.
4. Paste the **debug SHA-1**.
5. Register the app.
6. Optionally download `google-services.json` to `android/app/google-services.json`.

### 5.3 Confirm the OAuth clients

In **Google Cloud Console → APIs & Services → Credentials** (same project):

- There must be an **Android OAuth 2.0 client** for `com.kalaidigital.billing` with the registered SHA-1.
- There must be a **Web OAuth 2.0 client** — its client ID goes into `.env` as:

```env
VITE_GOOGLE_WEB_CLIENT_ID=...
```

This is the **web** client ID (client_type 3), not the Android client ID. It is a public value embedded in the APK. It is used as the server client ID when exchanging the native Google ID token with Firebase Auth.

### 5.4 Rebuild

```bash
npm run android:apk
adb install -r "release/KALAI DIGITAL 1.2.0.apk"
```

For a release APK, add the **release keystore SHA-1** too. If you publish through Google Play with App Signing, add the Play App Signing SHA-1 as well.

### If sign-in still fails

| Message | Cause | Fix |
|---|---|---|
| `Developer console is not set up correctly` | No Android OAuth client for this package + SHA-1 | Repeat §5.2 with the correct fingerprint |
| `auth/unauthorized-domain` on web/Windows | Domain missing from authorized domains | Add it in Authentication → Settings |
| `VITE_GOOGLE_WEB_CLIENT_ID is not set` | `.env` missing the web client ID | Add it and rebuild |
| Sign-in works on web but not Android | APK signed with a different keystore or old install | Uninstall the old app, rebuild with the registered SHA-1 |

Until this is done, Android users can still open **Use this device without an account** and bill offline. The data stays on that device.

## 6. Data mode

`VITE_DATA_MODE` controls startup:

| Value | Behaviour |
|---|---|
| `auto` (default) | Cloud if all six Firebase values are present, otherwise local Demo mode |
| `cloud` | Force cloud; show setup guidance if config is incomplete |
| `local` | Force local-only Demo mode |

The mode is displayed in Settings and the sidebar.

## 7. Offline behaviour

- Firestore uses persistent IndexedDB cache, so previously loaded customers, bills and settings remain available without a connection.
- Writes are queued locally and replay when the connection returns.
- The sidebar shows `Synced`, `Syncing`, `Offline` or `Error`.
- Invoice numbers are reserved with a Firestore transaction when online. The app also reconciles duplicate numbers after reconnect as a safety net.
- Local Demo mode is a separate backend and never syncs.

## 8. Firebase emulator verification

`npm run cloud:verify` runs `scripts/verify-cloud.ts` against the Firebase Auth and Firestore emulators. It creates isolated test accounts, checks the canonical `users/{uid}/apps/kalai/...` paths for customers, bills, settings and product rates, data isolation, bill creation, payments, numbering, offline replay and the Google credential sign-in path. It never touches production data.

```bash
npx firebase-tools emulators:start --only auth,firestore --project demo-kalai
# in another terminal
npm run cloud:verify
```

The script requires Java 11+ for the emulators. It is optional; the shipped app does not depend on it.

## 9. Cost and limits

The free Spark plan includes 1 GiB storage, 50K document reads/day, 20K writes/day and 1K deletes/day, plus unlimited Google Auth. A single shop doing ~30 bills/day is comfortably inside this. If the shop grows, upgrade to Blaze (pay-as-you-go).
