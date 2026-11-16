# KALAI DIGITAL — Testing Report

**Version:** 1.0.0
**Report date:** 12 November 2026
**Scope:** Web build, Android debug APK, Windows installer
**Principle:** This report lists only checks that were actually executed in this workspace. Anything that could not be run is listed in §7 with the exact reason.

---

## 1. What was built

| Artifact | Path | Notes |
| --- | --- | --- |
| PWA / web build | `dist/` | Vite production build, service worker precache generated |
| Android APK | `release/KALAI DIGITAL 1.0.0.apk` | Debug-signed, package `com.kalaidigital.billing`, versionName `1.0` |
| Android APK (build output) | `android/app/build/outputs/apk/debug/app-debug.apk` | Identical file to the release copy |
| Windows installer | `release/KALAI DIGITAL Setup 1.0.0.exe` | NSIS installer, unsigned |
| Windows unpacked app | `release/win-unpacked/KALAI DIGITAL.exe` | Portable run of the same build |

The supplied round logo (`kalai_digital_round_logo.png`) was used unchanged as the source for the launcher icons, splash screens, PWA icons and the in-app logo. It was not redrawn, cropped or recoloured.

### Artifact fingerprints (SHA-256)

| File | Size | SHA-256 |
| --- | --- | --- |
| `release/KALAI DIGITAL 1.0.0.apk` | 10,412,160 bytes | `D041D00DDB2C32490F2859A622119312C46CD65826DF3D3093829CC44EC7BC89` |
| `release/KALAI DIGITAL Setup 1.0.0.exe` | 109,194,725 bytes | `EAEB3D69EE7892A4FBE89C2002B6EE4B0100DDAACDF7D37698946983881370BF` |
| `release/win-unpacked/KALAI DIGITAL.exe` | 186,362,880 bytes | `FC80AC946FABEBC195D854503D6B46616BBE8DF5D821E258B85F8EDB98220B62` |

These are the exact binaries produced from the source in this workspace on 12 November 2026.

---

## 2. Environment

| Item | Value |
| --- | --- |
| OS | Windows 11 Home Single Language, build 26300 |
| Node.js / npm | v24.19.0 / 11.17.0 |
| JDK (Android build) | OpenJDK 21.0.11 (JetBrains Runtime) |
| Gradle | 8.2.1 (wrapper) |
| Android SDK | `C:\Users\skmed\AppData\Local\Android\Sdk` |
| Android test device | Emulator `Small_Phone` (AVD), Android 17, `sdk_gphone16k_x86_64`, 720×1280 px @ 320 dpi |
| Electron | 32.x |
| Capacitor | 6.x (Android) |
| Firebase | Existing web config supplied in `.env`; Firestore rules restrict access to `users/{uid}/**` |

---

## 3. Automated checks

All commands were run from the project root.

| Check | Command | Result |
| --- | --- | --- |
| TypeScript | `npx tsc --noEmit` | Passed, no output |
| Unit tests | `npm test` | **53 / 53 passed** (6 files) |
| Production build | `npm run build` | Passed; PWA service worker generated, 64 precache entries |
| Android assemble | `cd android && .\gradlew.bat assembleDebug` | `BUILD SUCCESSFUL` (160 tasks) |
| Windows package | `npm run electron:build` | Installer + unpacked app produced |

### Test coverage (automated)

- `src/lib/pricing.test.ts` (22) — square-feet conversion, 16 sq.ft basis, minimum charge, rounding modes, frame fixed pricing, GST, discount and additional charges.
- `src/services/bills.test.ts` (9) — unique bill numbers, item totals, split payments, bill status transitions, edit and cancel audit.
- `src/services/customers.test.ts` (9) — name-only validation, optional mobile, duplicate detection, update and stats.
- `src/services/localService.test.ts` (5) — on-device CRUD, filtering/ordering, watchers, persistence.
- `src/services/pdf.test.ts` (5) — invoice PDF is a non-empty `%PDF` file, long invoices paginate, report PDF, filename sanitising.
- `src/services/backup.test.ts` (3) — export shape, validation of foreign files, merge-by-ID restore.

---

## 4. Manual QA — web / Windows UI

Performed on the production build in a desktop browser and in the packaged Electron app.

| # | Scenario | Expected | Observed | Status |
| --- | --- | --- | --- | --- |
| W1 | Demo sign-in (`Use this device without an account` → `Open Demo Workspace`) | Dashboard opens, no cloud required | Dashboard opened with the real empty dataset | Pass |
| W2 | Empty dashboard | Real zeros, no invented figures | `₹0.00`, 0 bills, 0 customers | Pass |
| W3 | Create customer with only a name | Saved without mobile | Saved and listed | Pass |
| W4 | Duplicate customer name | Confirmation before saving | Duplicate warning shown | Pass |
| W5 | Frame bill 8×6 | ₹250 from the supplied frame rate card | Total ₹250, saved as `KD-2026-0001` | Pass |
| W6 | Bill PDF | A4 invoice downloads | `KD-2026-0001_...pdf` downloaded, opens correctly | Pass |
| W7 | Record full payment | Status becomes Paid, balance 0 | Paid, balance ₹0.00 | Pass |
| W8 | Cancel bill with reason | Bill kept, marked cancelled, audit entry written | Cancelled, audit row present | Pass |
| W9 | Reports after cancellation | Cancelled bill excluded from sales | Excluded | Pass |
| W10 | Report CSV + PDF export | Both files download with real figures | Both downloaded and opened | Pass |
| W11 | Tamil switch | UI switches and stays after reload | Persisted | Pass |
| W12 | Backup export | JSON snapshot of all collections | Downloaded, valid JSON | Pass |
| W13 | Restore from backup | Documents merged by ID, audit entry | Restored counts matched file | Pass |
| W14 | Windows app launch (portable) | Serves built app on fixed port | `release\win-unpacked\KALAI DIGITAL.exe` → `http://localhost:38993/` returned HTTP 200, window title `KALAI DIGITAL` | Pass |
| W15 | Browser/Electron export path | Blob download, no native bridge | Intercepted `URL.createObjectURL` + anchor click: `kalai-report-2026-11-12.csv` (657 B, `text/csv;charset=utf-8`) and `kalai-report-2026-11-12.pdf` (5,790 B, `application/pdf`), toasts shown | Pass |
| W16 | Windows installer | Installs and the installed app runs | Silent install (`/S`) exit code 0 → `%LOCALAPPDATA%\Programs\KALAI DIGITAL`; installed `KALAI DIGITAL.exe` launched, HTTP 200, title `KALAI DIGITAL` | Pass |

---

## 5. Manual QA — Android APK (emulator)

Installed with `adb install -r "release/KALAI DIGITAL 1.0.0.apk"` on the emulator described in §2 and driven through the WebView debugging bridge.

| # | Scenario | Expected | Observed | Status |
| --- | --- | --- | --- | --- |
| A1 | Install and launch | App opens with KALAI icon/splash | Installed as `com.kalaidigital.billing`, launched to login screen | Pass |
| A2 | Layout | Mobile layout, bottom navigation, no clipping | Renders correctly at 720×1280 | Pass |
| A3 | Demo sign-in | Works offline | Dashboard opened | Pass |
| A4 | Save frame bill | Bill number assigned | `KD-2026-0001`, ₹250 | Pass |
| A5 | **Invoice PDF** → `Downloads/KALAI DIGITAL` | Native save, valid PDF | `KD-2026-0001_Walk-in_Customer.pdf`, 4,754 bytes, header `%PDF-1.3` | Pass |
| A6 | **Report PDF** → same folder | Native save, valid PDF | `kalai-report-2026-11-12.pdf`, 5,866 bytes, header `%PDF-1.3` | Pass |
| A7 | **Report CSV** → same folder | UTF-8 with BOM for Excel/Tamil | `kalai-report-2026-11-12.csv`, 775 bytes, first bytes `EF BB BF` | Pass |
| A8 | **Bills CSV** → same folder | UTF-8 with BOM | `kalai-bills-2026-11-12.csv`, 192 bytes | Pass |
| A9 | **JSON backup** → same folder | Parseable JSON, no BOM | `kalai-digital-backup-2026-11-12_1312.json`, 11,417 bytes, first byte `{`, parsed: 10 collections, 1 bill | Pass |
| A10 | Re-run on the final rebuilt APK | Fix survives a clean rebuild | Fresh demo workspace, new bill `KD-2026-0002`, PDF written (`KD-2026-0002_Walk-in_Customer.pdf`, 4,756 bytes) | Pass |

Files were pulled back with `adb pull` and inspected byte-for-byte, so the checks above are not based on the UI alone.

### Defect found and fixed during this test round

Before the fix, the PDF button used jsPDF's `doc.save()`, which relies on an `<a download>` click. The Android WebView silently ignores that, so no file appeared. A native Capacitor plugin (`DownloadPlugin`, MediaStore on Android 10+, legacy public Downloads below that) now receives the bytes and writes them to `Downloads/KALAI DIGITAL`. `downloadInvoicePdf`, `downloadReportPdf`, customer statements, all CSV exports and JSON backups now use it; the browser/Electron path keeps the normal download behaviour. A5–A9 confirm the fix.

---

## 6. Functional checks covered by the automated suite

These were verified in code and unit tests rather than by hand:

- FRAME prices seeded exactly from the supplied rate card (19 sizes, ₹250–₹5,750); no rate is hardcoded in the UI.
- Square-feet products (FLEX, SUNPACK, VINYL, STAR) start at ₹0 and require the admin to set the rate and the 16 sq.ft basis; billing refuses to price an unconfigured product instead of guessing.
- Minimum charge and rounding rules applied per product configuration.
- Bill numbering `KD-YYYY-NNNN` with a per-year counter, unique even across sync.
- Discount, additional charges, optional GST, split payments, edit with audit, cancel with audit.
- Local-first persistence with optional Firestore mirror under `users/{uid}/apps/kalai/...`.

---

## 7. Not tested / blocked (and why)

| Item | Reason | What is implemented |
| --- | --- | --- |
| Android **native Google Sign-In** | The Android package + debug SHA-1 are not registered in the Firebase project, and `google-services.json` cannot be generated without Firebase Console/CLI access. | Bridge via `@capgo/capacitor-social-login`; web Google Sign-In works on web/Windows. Offline/demo billing is unaffected. Steps: `docs/FIREBASE_SETUP.md`. |
| **Live cloud sync** against the real project | No interactive Google account was available in this environment. | Firestore backend with persistent offline cache; `npm run cloud:verify` script for the emulator suite. |
| **Physical thermal printer** (Bluetooth/USB, ESC/POS) | No printer hardware was available. | A4 print via the system print dialog and 58/80 mm receipt HTML. Direct ESC/POS byte output is deliberately **not** claimed. |
| **Release/Play Store signing** | No owner keystore or Play Console access. | `android:release` script and documented signing steps; the shipped APK is debug-signed. |
| **Code-signed Windows installer** | No code-signing certificate. | Unsigned NSIS installer; Windows SmartScreen will warn on first run. |
| **iOS** | Not part of the brief; no macOS available. | Code is Capacitor-portable but untested on iOS. |
| **Real Android phone** | Only the emulator was available. | Emulator run covers WebView, storage plugin and layout. |
| **Multi-device concurrent sync conflict** | Needs two signed-in devices. | Last-write-wins document merge with `updatedAt`; audit log records changes. |

---

## 8. How to reproduce the key checks

```powershell
# 1. Automated
npm install
npx tsc --noEmit
npm test
npm run build

# 2. Windows
npm run electron:build
# run release\KALAI DIGITAL Setup 1.0.0.exe

# 3. Android
$env:JAVA_HOME='C:\Users\skmed\.jdks\jbr-21.0.11'
npm run android:apk
adb install -r "release\KALAI DIGITAL 1.0.0.apk"
adb shell am start -n com.kalaidigital.billing/.MainActivity

# 4. Confirm native downloads (after tapping PDF / Export in the app)
adb shell ls -l "/sdcard/Download/KALAI DIGITAL/"
adb pull "/sdcard/Download/KALAI DIGITAL/<file>" .
```

---

## 9. Sign-off summary

| Area | Status |
| --- | --- |
| Type check, unit tests, production build | Pass |
| Web / Electron manual QA | Pass |
| Android install, layout, billing, native file exports | Pass (emulator) |
| Android native Google Sign-In | Blocked — Firebase registration required |
| Live cloud sync | Blocked — no interactive account |
| Thermal printer hardware | Blocked — no hardware |
| Release signing / store submission | Not included by design |
