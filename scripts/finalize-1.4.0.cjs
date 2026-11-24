/**
 * Builds the 1.4.0 release metadata from the files that were actually built:
 * copies the debug APK under its release name, then writes SHA256SUMS.txt,
 * latest.json (the update feed) and build-info.json from real hashes/sizes.
 *
 * Run after `npm run electron:build` and `gradlew assembleDebug`.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const VERSION = require('../package.json').version;
const VERSION_CODE = 5;
const TAG = `v${VERSION}`;
const REPO = 'https://github.com/2navinkishore2-wq/kalai-app-releases';
const ANDROID_ASSET = `KALAI-DIGITAL-${VERSION}.apk`;
const WINDOWS_ASSET = `KALAI-DIGITAL-Setup-${VERSION}.exe`;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const builtApk = path.join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');
const apk = path.join('release', ANDROID_ASSET);
const exe = path.join('release', WINDOWS_ASSET);

if (!fs.existsSync(builtApk)) throw new Error(`missing ${builtApk}`);
if (!fs.existsSync(exe)) throw new Error(`missing ${exe}`);
fs.copyFileSync(builtApk, apk);

const apkSha = sha256(apk);
const exeSha = sha256(exe);
const apkSize = fs.statSync(apk).size;
const exeSize = fs.statSync(exe).size;

// The APK signer, read from the built file itself.
let certificate = process.env.APK_CERT_SHA256 || null;
try {
  if (certificate) throw new Error('using the certificate supplied in APK_CERT_SHA256');
  const out = execFileSync(
    '.tools/android-sdk/build-tools/34.0.0/apksigner.bat',
    ['verify', '--print-certs', apk],
    { encoding: 'utf8' }
  );
  const line = out.split(/\r?\n/).find((l) => /SHA-256 digest/i.test(l));
  certificate = line ? line.split(':').slice(-1)[0].trim() : null;
} catch (error) {
  console.warn('could not read APK certificate:', error.message);
}

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const notes = fs.readFileSync(path.join('release', 'RELEASE_NOTES.md'), 'utf8');

const feed = {
  version: VERSION,
  versionCode: VERSION_CODE,
  notes,
  notesTa:
    'சன்பேக் இப்போது ஃபிளக்ஸ் போல ஒரே சதுர அடி கணக்கு: அகலம் (அடி) × உயரம் (அடி) × ₹/சதுர அடி × எண்ணிக்கை. 10 × 10 அடி = 100 சதுர அடி × ₹16 = ₹1,600. அடி இயல்பான அளவு; இன்ச் தேவைப்பட்டால் மாற்றப்படும்.\n\nSettings → Payment QR இல் UPI ID, வணிக மொபைல் எண், QR படத்தை பதிவேற்ற/மாற்ற/நீக்க, QR காட்டு, பண முறை லேபிள்கள், இன்வாய்ஸ் கீழ் வரி ஆகியவை உள்ளன. QR A4 PDF, A4 அச்சு, 58/80 மி.மீ ரசீது அனைத்திலும் அளவு மாறாமல் அச்சிடப்படும். பழைய பில் அதன் அசல் QR மற்றும் UPI ID-ஐ தக்க வைத்திருக்கும்.\n\nபுதிய தீம்கள்: Neon Blue, Neon Purple, Neon Green, Dark Red, Dark Gold, Clean White, Modern Blue. KB லோகோ மாறவில்லை.',
  releasedAt: new Date().toISOString(),
  pageUrl: `${REPO}/releases/tag/${TAG}`,
  assets: {
    android: {
      url: `${REPO}/releases/download/${TAG}/${ANDROID_ASSET}`,
      size: apkSize,
      sha256: apkSha
    },
    windows: {
      url: `${REPO}/releases/download/${TAG}/${WINDOWS_ASSET}`,
      size: exeSize,
      sha256: exeSha
    }
  }
};

fs.writeFileSync(path.join('release', 'latest.json'), `${JSON.stringify(feed, null, 2)}\n`);

fs.writeFileSync(
  path.join('release', 'SHA256SUMS.txt'),
  `KALAI DIGITAL ${VERSION} — SHA-256 checksums
Built from source revision ${commit} (tag ${TAG})

${apkSha}  ${ANDROID_ASSET}
${exeSha}  ${WINDOWS_ASSET}

Verify on Windows:
  certutil -hashfile ${ANDROID_ASSET} SHA256
  certutil -hashfile ${WINDOWS_ASSET} SHA256

Android APK: package com.kalaidigital.billing, versionCode ${VERSION_CODE}, versionName ${VERSION},
signed with certificate SHA-256 ${certificate || '(see apksigner verify --print-certs)'}

NOTE: the 1.3.0 APK was signed with a different debug key (7fe43dfc...) that was
lost with the old Android Studio installation. Uninstall 1.3.0 before installing
1.4.0; cloud data is restored on the next Google sign-in. Later releases signed
with ${certificate || 'this key'} install in place.
`
);

fs.writeFileSync(
  path.join('release', 'build-info.json'),
  `${JSON.stringify(
    {
      version: VERSION,
      versionCode: VERSION_CODE,
      sourceCommit: commit,
      tag: TAG,
      builtAt: new Date().toISOString(),
      android: {
        package: 'com.kalaidigital.billing',
        versionName: VERSION,
        versionCode: VERSION_CODE,
        fileName: ANDROID_ASSET,
        sizeBytes: apkSize,
        sha256: apkSha.toUpperCase(),
        certificateSha256: certificate
      },
      windows: {
        fileName: WINDOWS_ASSET,
        sizeBytes: exeSize,
        sha256: exeSha.toUpperCase()
      }
    },
    null,
    2
  )}\n`
);

console.log(`APK  ${apkSize} bytes ${apkSha}`);
console.log(`EXE  ${exeSize} bytes ${exeSha}`);
console.log(`cert ${certificate}`);
console.log(`feed release/latest.json for ${TAG} @ ${commit}`);
