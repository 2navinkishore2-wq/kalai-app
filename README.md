# KALAI DIGITAL

**கலை டிஜிட்டல்** — a premium billing and business-management app for a photo-frame, flex, sunpack, vinyl and star-print shop.

One codebase runs on **Android (APK)**, **Windows (installer)** and the **web**, with an offline-first local database and optional Firebase cloud sync under the signed-in Google account.

> **Open → choose customer (or Walk-in) → add items → payment → save → print / share.**

---

## 0. Builds in this workspace

| Artifact | Path | Built from |
|---|---|---|
| Android release APK | `release/KALAI-DIGITAL-1.6.0.apk` (Gradle output `android/app/build/outputs/apk/release/app-release.apk`) | current source, package `com.kalaidigital.billing`, versionCode `7`, versionName `1.6.0`, signed with the stable release key (`android/kalai-release.jks`, not in git) |
| Windows installer | `release/KALAI-DIGITAL-Setup-1.6.0.exe` | current source, Electron 32, version `1.6.0`, identity `com.kalaidigital.billing` |
| Update feed | `release/latest.json` | published with every release; read by Settings → About & Updates |
| Web / PWA | `dist/` (after `npm run build`) | Vite production build |

`release/` keeps the installable artifacts of the current release plus `latest.json`, `SHA256SUMS.txt` and `build-info.json` (version, sizes, SHA-256).

From 1.5.0 onwards the APK is signed with the stable release keystore created for this app, so each new version installs over the previous one in place. APKs from 1.4.0 and older were signed with a different (debug) key and must be uninstalled once — see §7 and §14.

---

## 1. What the app does

### Billing
- Multiple line items per bill, each with its own product, size, quantity and price.
- Dimensions entered in **inches, centimetres or feet**; the app converts to inches and square feet.
- **FRAME** uses the fixed size-wise price table (19 supplied sizes, ₹250–₹5,750) with a **Beading** choice (1 inch, 1½ inches, 2 inches) recorded on the bill. The supplied chart has one price per size, so beading never changes the price.
- **FLEX / VINYL / STAR** are entered in **feet** by default and priced **per sq.ft** (opening rates ₹16 / ₹25 / ₹25). **SUNPACK** keeps its square-feet calculation with the configurable basis (default **16 sq.ft**) and owner-set rate.
- Discount as ₹ amount or %, additional charges (delivery, lamination, installation), optional GST (exclusive or inclusive), and a bill note.
- **Split payments** — Cash + UPI + Bank Transfer + Other, each with its own date and reference.
- Unique bill numbers (`KD-YYYY-0001` by default, pattern editable in Settings).
- **Save**, then **PDF**, **share**, **print A4**, **print 58/80 mm receipt**, or start a **new bill**. Save happens before any print/share attempt, so a printer failure can never lose the bill.
- Customer is optional: **Walk-in Customer** is always available. When creating a customer, only a **name** is required.
- Duplicate mobile numbers and similar names raise a confirmation dialog, but never block a legitimate second customer.

### After the bill
- Bill history with search, status filters, date grouping, PDF/reprint and edit.
- Every edit, payment and cancellation increments the bill version and writes an audit entry.
- Partial payments, "pay full balance", and cancellation that keeps the invoice visible and excluded from sales/outstanding reports.
- Customer profiles with ledger, purchase history and quick "new bill".
- Payments register, expenses, optional inventory with stock movements.
- Reports with real figures only: sales, payments by method, product mix, top customers, outstanding, expenses, estimated profit, CSV and PDF export.
- Settings: business identity, invoice numbering, GST, receipt width, theme, **English / தமிழ்**, owner/allowlist access, backup/restore, clear-data.
- Backup exports a JSON snapshot of every collection; restore merges by document ID and writes an audit entry.

### Platforms
- **Android:** Capacitor WebView; invoice PDFs, report PDFs, customer statements, CSV exports and JSON backups are written by a native plugin to `Downloads/KALAI DIGITAL`; native Google Sign-In bridge (`@capgo/capacitor-social-login`).
- **Windows:** Electron serves the built app from a fixed `http://localhost:38993` origin so Firebase Auth sessions and the offline cache survive restarts.
- **Offline:** Firestore persistent cache plus local-first writes. The app remains usable without a connection and syncs when it returns. Demo mode keeps everything on the device.

---

## 2. Pricing rules (no invented rates)

### FRAME — fixed price per piece
The supplied rate chart is seeded exactly as given:

| Size (in) | Price | Size (in) | Price |
|---|---:|---|---:|
| 8 × 6 | ₹250 | 18 × 24 | ₹2,500 |
| 10 × 8 | ₹350 | 36 × 12 | ₹2,000 |
| 12 × 8 | ₹650 | 20 × 24 | ₹2,750 |
| 12 × 10 | ₹800 | 20 × 30 | ₹2,900 |
| 15 × 10 | ₹900 | 36 × 24 | ₹3,500 |
| 15 × 12 | ₹900 | 30 × 40 | ₹4,750 |
| 18 × 12 | ₹1,200 | 36 × 40 | ₹5,200 |
| 24 × 12 | ₹1,500 | 36 × 48 | ₹5,750 |
| 16 × 20 | ₹2,200 | | |
| 16 × 24 | ₹2,350 | | |
| 30 × 12 | ₹1,700 | | |

Frame beading does not have separate prices in the supplied chart. The **Beading / பீடிங்** selection (1 inch, 1½ inches, 2 inches) is saved on the bill item and printed on the invoice/receipt; the listed size price is kept.

### FLEX / VINYL / STAR — square feet, entered in feet
```
Area (sq.ft)     = Width (ft) × Height (ft)
Line total       = Area × Rate per sq.ft × Quantity
```
Opening rates for this release: **Flex ₹16/sq.ft, Vinyl ₹25/sq.ft, Star ₹25/sq.ft**. They are applied **once** by the first-run migration; after that the saved rates in **Products & Rates → Flex, Vinyl & Star rates** are authoritative and survive restarts and sync. Rates are stored per account, and saved bills keep the rate and amount charged at the time.

### SUNPACK — square feet
```
Area (sq.ft)     = Width (in) × Height (in) ÷ 144
Chargeable area  = max(Area, configured minimum) when minimum charge is enabled
Amount           = (Chargeable area ÷ Basis) × Configured rate × Quantity
```
SUNPACK keeps the existing 16 sq.ft basis and owner-set rate. No rate is guessed.

---

## 3. Tech stack

- **UI:** React 18 + TypeScript + Vite, custom burgundy/gold/cream design system, responsive bottom navigation (mobile) and sidebar (desktop), light/dark themes.
- **Android:** Capacitor 6, native social-login plugin, native Downloads plugin.
- **Windows:** Electron 32 + electron-builder (NSIS).
- **Cloud:** Firebase Auth (Google) + Firestore with persistent offline cache.
- **PDF/CSV:** jsPDF + jspdf-autotable, on-device.
- **Money:** `decimal.js` for rounding-safe totals.

### Data isolation
All KALAI data is written under:

```
users/{uid}/apps/kalai/{customers|bills|payments|expenses|inventory|stockTxns|auditLogs|productConfigs|frameSizes|settings|counters}
```

`users/{uid}/apps/kalai` is a Firestore **document** path (four segments), which is what lets each name after it be a collection. The earlier `users/{uid}/kalai/{collection}` layout was invalid because a collection path needs an odd number of segments, so `collection()` threw on startup.

The supplied Firestore rules allow a signed-in user to read/write only `users/{their-uid}/**`, so KALAI data never mixes with another app that may share the same Firebase project.

---

## 4. Quick start (no cloud — Demo mode)

```bash
npm install
npm run dev          # http://localhost:5173
```

On the login screen choose **“Use this device without an account”**, enter a display name, and open the demo workspace. Everything works locally in the browser: customers, billing, payments, bills, reports, PDF/CSV, backup/restore.

Run the automated suite:

```bash
npm test             # 58 tests, Vitest + jsdom
```

---

## 5. Firebase setup (cloud sync + Google Sign-In)

The supplied `.env` already contains a working Firebase web config and a Google **web** client ID, so cloud mode works on web/Windows as soon as the app is built. Your data is isolated under `users/{uid}/apps/kalai`.

### 5.1 Use the existing project or create your own

1. Create/choose a project at <https://console.firebase.google.com>.
2. **Add app → Web**, copy the config into `.env` (see `.env.example`).
3. **Authentication → Sign-in method → Google → Enable**.
4. **Firestore Database → Create database** in production mode.
5. Deploy the rules in `firebase/firestore.rules` (Firebase Console → Firestore → Rules, or `firebase deploy --only firestore:rules`).
6. Add your production web domain under **Authentication → Settings → Authorized domains**. `localhost` is authorised by default, which is what the Electron build uses.

### 5.2 Android Google Sign-In — required extra step

The APK package is **`com.kalaidigital.billing`**. Native Google Sign-In will fail until this Android app is registered in the **same Firebase project** as the web config:

1. Print the debug signing fingerprints:

   ```bash
   npm run android:shas
   ```

2. Firebase Console → **Project settings → Your apps → Add app → Android**
   - Package name: `com.kalaidigital.billing`
   - App nickname: `KALAI DIGITAL`
   - Debug SHA-1: paste the `SHA1` printed above.
3. Download `google-services.json` and place it at `android/app/google-services.json` if you also want native Firebase/Google services metadata. The app's JS Firebase SDK uses the `.env` values, but keeping this file makes the native Google setup explicit.
4. Confirm in **Google Cloud Console → APIs & Services → Credentials** that an **Android OAuth client** exists for `com.kalaidigital.billing` with that SHA-1, and that the **Web OAuth client ID** in `.env` (`VITE_GOOGLE_WEB_CLIENT_ID`) is the same project's web client.
5. Rebuild and reinstall the APK.

For a **release** APK, add the release keystore's SHA-1 as well (Google Play App Signing uses yet another SHA-1; add all that apply). Without these registrations the app still bills offline in Demo mode, but Google account sign-in on Android is not usable.

### 5.3 Environment variables

Copy `.env.example` to `.env`:

| Variable | Meaning |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web API key (public, protected by rules) |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | `<project>.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `VITE_FIREBASE_APP_ID` | Web app ID |
| `VITE_GOOGLE_WEB_CLIENT_ID` | Web OAuth client ID used by native Android sign-in |
| `VITE_DATA_MODE` | `auto` (default), `cloud` or `local` |

> `.env` is git-ignored. Never commit real credentials. The Firebase web API key is not a secret, but the file is still kept local.

---

## 6. Windows build

```bash
npm run electron:build
```

Output:

- `release/KALAI DIGITAL Setup 1.2.0.exe` — NSIS installer, per-user, choose install directory.
- `release/win-unpacked/KALAI DIGITAL.exe` — portable unpacked app.

The installer is **not code-signed** (no certificate in this workspace), so Windows SmartScreen may show “Unknown publisher”. Code signing is optional for internal shop use; obtain a certificate before public distribution.

The Electron process serves `dist/` on a fixed local port (`38993`) so the Firebase session and offline IndexedDB cache survive an app restart. Only `localhost` is used; nothing is exposed to the network.

---

## 7. Android build

### Prerequisites
- Node 20+ and npm.
- Android SDK (platform 34, build-tools 34) and a JDK 17 or 21.
- `android/local.properties` pointing at the SDK (created automatically by Android Studio; otherwise add `sdk.dir=...`).

### Debug APK (installable now)

```bash
npm run android:apk
```

This runs the web build, `cap sync android`, and `gradlew assembleDebug`. Output:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

A copy is kept at `release/KALAI DIGITAL 1.2.0.apk`.

### Release APK

1. Create a keystore:

   ```bash
   keytool -genkeypair -v -keystore android/release.keystore \
     -alias kalaidigital -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Copy `android/keystore.properties.example` to `android/keystore.properties` and fill in the passwords/paths.
3. Build:

   ```bash
   npm run android:release
   ```

The release build type picks up the signing config automatically when `keystore.properties` exists.

### Install on a phone
Enable **Install unknown apps** for your file manager/browser, copy the APK, and install. Or with USB debugging:

```bash
adb install -r "release/KALAI DIGITAL 1.2.0.apk"
```

---

## 8. Printing

- **A4 invoice:** the Bill screen renders a print-ready invoice and calls the system print dialog.
- **Thermal receipt:** 58 mm or 80 mm HTML receipt through the platform print dialog.
- Works with any printer that the operating system exposes as a print service (USB, Bluetooth, Wi-Fi or a vendor driver).
- **Direct ESC/POS commands are not enabled in this build.** A raw Bluetooth/USB thermal printer that only accepts ESC/POS bytes needs a vendor SDK/plugin and is not claimed as tested.

---

## 9. Access control and security

- Google Sign-In identifies the account; all cloud reads/writes are enforced by Firestore rules on `request.auth.uid`.
- **Owner email** in Settings marks the workspace owner. Only the owner can change rates, settings, access and backups.
- **Authorised accounts** is an optional device-level allowlist. When enabled, other Google accounts see a clear “not authorised on this device” screen. This is a UI gate, not a cloud security boundary — Firestore rules remain the real boundary.
- Demo mode is device-only and clearly labelled; it never writes to Firestore.
- Bill cancellation is non-destructive; the original bill, version history and audit trail remain.

---

## 10. Testing

### Automated
```
npm test        → 58/58 passing
npx tsc --noEmit → clean
npm run build   → succeeds
```

Covers square-feet/frame pricing, minimum charge, rounding, GST, invoice numbering, bill creation, split payments, edits, cancellations, customer name-only validation and duplicates, local persistence, backup/restore, PDF generation and Firestore account-path construction.

### Manual checks performed on the built web app
- Demo sign-in, name-only customer creation, 19-size frame table.
- Frame bill (8×6, ₹250) saved as `KD-2026-0001`, PDF downloaded, full payment recorded, status → Paid, cancellation with audit.
- Reports excluded the cancelled bill and exported CSV + PDF.
- Tamil UI switch persisted; theme/business settings saved.
- Dashboard shows real zeros on an empty workspace — no sample figures.

### Manual checks performed on the built Android APK (emulator, Android 17)
- APK installs and launches as `com.kalaidigital.billing` with the KALAI launcher icon and splash.
- Demo sign-in works offline; a frame bill saved as `KD-2026-0001`.
- Invoice PDF, report PDF, report CSV, bills CSV and the JSON backup all arrived in `Downloads/KALAI DIGITAL` and were verified by pulling them back (valid `%PDF-1.3` header, UTF-8 BOM CSV, parseable JSON, no BOM).

The full results, including what could not be tested in this environment, are in [`docs/TESTING_REPORT.md`](docs/TESTING_REPORT.md).

---

## 11. Known limitations (honest list)

- **Android native Google Sign-In is not verified** in this workspace because the Android app/SHA-1 is not yet registered in the Firebase project. See §5.2. Offline/demo billing works without it.
- The APK in `release/` is **debug-signed**, not Play-Store ready.
- The Windows installer is **unsigned**.
- **No physical thermal printer** was available, so hardware receipt printing was not tested. The print-dialog path is implemented; direct ESC/POS is not.
- Cloud sync is exercised by `npm run cloud:verify` against the Firebase Auth + Firestore emulators (sign-in, UID-scoped paths, customer/bill/settings/product-rate writes, isolation, offline replay and the Google credential path). A live production `signInWithPopup` still needs an interactive Google account, which cannot be automated here.
- Profit is an **estimate** based on the optional cost-per-sq.ft and recorded expenses. Frame material cost is not estimated.
- SMS/WhatsApp sending is not included; sharing uses the system share sheet with a generated PDF.

---

## 12. Project structure

```
src/
  lib/          types, pricing, money, formatting, invoice numbers, constants, platform
  services/     data interface, Firestore + local backends, bills, customers, PDF, printer, backup, expenses, inventory
  store/        AppContext (auth, live collections, settings, access gate)
  components/   UI kit, layout, invoice document, charts
  pages/        Login, Dashboard, Billing, Bills, BillDetail, Customers, CustomerDetail,
                Products, Payments, Expenses, Inventory, Reports, Settings, About
electron/       main process + preload bridge
android/        Capacitor Android project
firebase/       Firestore rules + indexes
public/         supplied KB logo, PWA icons
scripts/        icon/splash generator, SHA-1 helper, Firebase emulator verification
release/        built APK and Windows installer
docs/           Firebase setup and testing report
```

### Branding and logo
The supplied round KB logo (`public/logo.png`, 632×632 transparent PNG) is used **unchanged** in the app, invoices, launcher icons and splash screens. Icons are generated by `npm run icons`, which only scales and pads the logo on a white/cream background — it never redraws or distorts it.

---

## 13. Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check + production web build |
| `npm test` | Vitest suite |
| `npm run icons` | Regenerate PWA/Android/Windows icons and splash screens |
| `npm run android:sync` | Build web + sync into the Android project |
| `npm run android:apk` | Build and assemble the debug APK |
| `npm run android:release` | Build and assemble the release APK |
| `npm run android:shas` | Print debug/release SHA-1 fingerprints for Firebase |
| `npm run electron:build` | Build the Windows installer |
| `npm run cloud:verify` | Run the Firebase emulator verification script (needs emulators) |

---

## 14. Releasing an update (GitHub + in-app updater)

Every release ships **both** platforms from **one source revision**, and the app discovers new
versions from a single public JSON feed. Do the steps in this order — the updater metadata must
match the exact binaries you publish.

### 14.1 Bump the versions (once, at the start)

1. `package.json` → `"version"` (this also feeds `__APP_VERSION__`, so Settings → About and the
   updater comparison both show it).
2. `android/app/build.gradle` → `versionName` (same string) and `versionCode` (**always +1**;
   Android refuses to install an APK with a versionCode that is not higher).
3. Never change `applicationId` (`com.kalaidigital.billing`) or the Electron `appId`
   (`com.kalaidigital.billing`) — that would break in-place upgrades on both platforms.

### 14.2 Verify, then build both platforms

```bash
npx tsc --noEmit
npx vitest run
npm run build                     # dist/ used by BOTH platforms
npx cap sync android
cd android && .\gradlew.bat assembleDebug     # -> app/build/outputs/apk/debug/app-debug.apk
cd .. && npm run electron:build               # -> release/KALAI-DIGITAL-Setup-<version>.exe
```

Check that both packages contain the new build: the APK's `assets/public/assets/index-*.js` and
the EXE's `resources/app.asar` → `dist/assets/index-*.js` must be the **same file** (same size and
SHA-256) as `dist/assets/index-*.js`.

### 14.3 Assemble the release files

```bash
copy android\app\build\outputs\apk\debug\app-debug.apk release\KALAI-DIGITAL-<version>.apk
# release\KALAI-DIGITAL-Setup-<version>.exe is produced by electron-builder
```

Then write `release/latest.json` (the updater feed — see §14.5) and a `SHA256SUMS.txt`:

```bash
certutil -hashfile release\KALAI-DIGITAL-<version>.apk SHA256
certutil -hashfile release\KALAI-DIGITAL-Setup-<version>.exe SHA256
```

### 14.4 Publish

Assets must keep **predictable names** so the feed can link to them directly:

- `KALAI-DIGITAL-<version>.apk`
- `KALAI-DIGITAL-Setup-<version>.exe`
- `latest.json`
- `SHA256SUMS.txt`

```bash
git add -A
git commit -m "Release <version>"
git tag v<version>
git push origin main --tags
```

**Source repository** `kalai-app` (private by default). **Distribution repository**
`kalai-app-releases` (public: installers + updater metadata only, no source, no credentials).
Create the GitHub Release from tag `v<version>` in **both** repositories and attach the four
assets above to each.

> Credentials: use `git` with the stored GitHub credential manager entry, or the REST API with a
> token that has `repo` scope. Never commit a token, `.env`, keystore, `keystore.properties` or
> customer data — `.gitignore` already blocks all of them.

### 14.5 The update feed (`latest.json`)

```json
{
  "version": "1.3.0",
  "versionCode": 4,
  "notes": "What changed, in plain language.",
  "notesTa": "தமிழில் சுருக்கம்.",
  "releasedAt": "2026-11-16T00:00:00Z",
  "pageUrl": "https://github.com/<owner>/kalai-app-releases/releases/tag/v1.3.0",
  "assets": {
    "android": {
      "url": "https://github.com/<owner>/kalai-app-releases/releases/download/v1.3.0/KALAI-DIGITAL-1.3.0.apk",
      "size": 10018877,
      "sha256": "<apk sha256>"
    },
    "windows": {
      "url": "https://github.com/<owner>/kalai-app-releases/releases/download/v1.3.0/KALAI-DIGITAL-Setup-1.3.0.exe",
      "size": 109000000,
      "sha256": "<exe sha256>"
    }
  }
}
```

Installed apps read
`https://raw.githubusercontent.com/2navinkishore2-wq/kalai-app-releases/main/latest.json`
(canonical — served with `Access-Control-Allow-Origin: *`, no token, no API quota), and fall back
to `https://github.com/2navinkishore2-wq/kalai-app-releases/releases/latest/download/latest.json`
if the first request fails. `scripts/publish-release.cjs` commits `latest.json` to the public
repository's `main` branch on every release, so the feed always tracks the newest version. The
feed can be overridden for testing with `localStorage['kalai:update-feed:v1'] = '<feed url>'` or
the `VITE_UPDATE_FEED` build variable.

> **Signing:** releases from 1.5.0 are signed with `android/kalai-release.jks`
> (`android/keystore.properties`, both git-ignored — back them up; losing the key means a future
> APK cannot upgrade in place). Its SHA-1 is `5B:6B:AE:01:5D:21:0F:FB:77:88:B4:A8:83:CB:AB:0F:17:E4:DC:9F`
> and must be registered in Firebase → Project settings → Your apps for Android Google Sign-In.
> `npm run build` embeds it (`ANDROID_SHA1=…`) so Settings → About & Updates can display it.

### 14.6 How the updater behaves

- **Check**: automatically ~2.5 s after the workspace opens (never blocks sign-in, billing or
  offline use) and on demand from **Settings → About & Updates → Check for Updates**.
- **Comparison**: numeric dotted versions (`1.10.0 > 1.9.9`); equal or older means "up to date".
- **Windows**: the main process downloads the installer to `%TEMP%`, verifies the published
  SHA-256, then starts the NSIS installer and quits so its files can be replaced. The installer
  keeps the existing `appId`, so the user's data in `%APPDATA%`/IndexedDB is untouched.
- **Android**: the APK URL is opened in the system browser; when the download finishes Android's
  package installer asks the user to confirm the install. The new APK must be signed with the
  **same key** and carry a higher `versionCode`, otherwise Android rejects it.
- **Failures**: offline, HTTP errors, malformed feeds and checksum mismatches each show their own
  message and never break billing. "Later" suppresses the prompt for the rest of the session.

The **first** updater-enabled release has to be installed by hand (older builds have no updater);
every later release is discoverable from inside the app.

### 14.7 Helper scripts

| Script | Purpose |
|---|---|
| `npx tsx scripts/verify-feed.ts [currentVersion] [feedUrl]` | Fetches the published feed, parses it with the app's own code and checks both installer URLs. Run it after publishing. |
| `node scripts/finalize-release.cjs` | Rewrites `latest.json`, `SHA256SUMS.txt`, `build-info.json` and the notes with the final sizes/hashes (edit the hashes at the top of the file first). |
| `node scripts/publish-release.cjs [repo…]` | Creates the GitHub Release for `v<version>` and uploads the four assets. |
| `node scripts/replace-release-assets.cjs [repo…]` | Replaces the assets and body of an existing release with rebuilt files. |

### 14.8 Product settings repair (1.6.0+)

`src/lib/products.ts` is the single normaliser for `productConfigs`, and
`src/services/products.ts` owns saving and migrating them.

- A product is unavailable **only** when a stored flag is explicitly false
  (`active`, `isActive`, `enabled`, `billingEnabled` or `status`). A missing flag
  from 1.3.0/1.4.0 means available — this is what produced "Flex (off)".
- The five products are always built from `PRODUCT_KEYS`, so a partial document
  (no `key`/`name`) can no longer remove a product from New Bill. Duplicate
  legacy documents resolve to the canonical `product-<key>` record, then the
  most recently updated one.
- A rate save writes the complete configuration (`productRateFields`) and
  then re-reads it (`verifyProductRates`). A failed or unconfirmed write shows an
  error instead of a success toast, and `FirestoreDataService.set` now propagates
  write errors instead of swallowing them.
- `migrateProductConfigs` runs after `seedWorkspace`, is idempotent (stamped with
  `configVersion`), never includes a valid saved `rate` in its patch, and never
  re-enables a deliberately disabled product. A legacy "₹ per 16 sq.ft" rate is
  folded into per-sq.ft (rate ÷ basis) so the money is unchanged.
- Customers: `archived` + `archivedAt` keep invoices and payments intact.
  `deleteCustomer` refuses when a bill or payment references the customer;
  the UI offers Archive instead.
