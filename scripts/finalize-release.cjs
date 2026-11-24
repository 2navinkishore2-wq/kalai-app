/**
 * Builds the release metadata from the files that were actually built:
 * copies the signed APK under its release name, then writes SHA256SUMS.txt,
 * latest.json (the update feed) and build-info.json from real hashes/sizes.
 *
 * Run after `npm run electron:build` and `gradlew assembleRelease`.
 * Version and versionCode are read from package.json / build.gradle, so this
 * script does not need editing for the next release.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const VERSION = require('../package.json').version;
const gradle = fs.readFileSync(path.join('android', 'app', 'build.gradle'), 'utf8');
const VERSION_CODE = Number((/versionCode\s+(\d+)/.exec(gradle) || [])[1] || 0);
const gradleVersionName = (/versionName\s+"([^"]+)"/.exec(gradle) || [])[1];
if (!VERSION_CODE) throw new Error('could not read versionCode from android/app/build.gradle');
if (gradleVersionName !== VERSION) {
  throw new Error(`android versionName ${gradleVersionName} does not match package.json ${VERSION}`);
}

const TAG = `v${VERSION}`;
const REPO = 'https://github.com/2navinkishore2-wq/kalai-app-releases';
const ANDROID_ASSET = `KALAI-DIGITAL-${VERSION}.apk`;
const WINDOWS_ASSET = `KALAI-DIGITAL-Setup-${VERSION}.exe`;

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const candidates = [
  path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
  path.join('android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk')
];
const builtApk = candidates.find((p) => fs.existsSync(p));
const apk = path.join('release', ANDROID_ASSET);
const exe = path.join('release', WINDOWS_ASSET);

if (!builtApk) throw new Error('no built APK found — run the Gradle build first');
if (!fs.existsSync(exe)) throw new Error(`missing ${exe} — run npm run electron:build first`);
fs.copyFileSync(builtApk, apk);

const apkSha = sha256(apk);
const exeSha = sha256(exe);
const apkSize = fs.statSync(apk).size;
const exeSize = fs.statSync(exe).size;

// Signing certificate, read from the built APK itself.
let certificate = process.env.APK_CERT_SHA256 || null;
let certificateSha1 = process.env.APK_CERT_SHA1 || null;
try {
  if (!certificate || !certificateSha1) {
    const javaHome = process.env.JAVA_HOME || path.join(__dirname, '..', '.tools', 'jdk-17.0.21.1+2');
    // apksigner.bat cannot be spawned directly from Node on Windows (EINVAL),
    // so run its jar with the local JDK instead.
    const out = execFileSync(
      path.join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
      ['-jar', '.tools/android-sdk/build-tools/34.0.0/lib/apksigner.jar', 'verify', '--print-certs', apk],
      { encoding: 'utf8', env: { ...process.env, JAVA_HOME: javaHome } }
    );
    const line256 = out.split(/\r?\n/).find((l) => /SHA-256 digest/i.test(l));
    const line1 = out.split(/\r?\n/).find((l) => /SHA-1 digest/i.test(l));
    certificate = certificate || (line256 ? line256.split(':').slice(-1)[0].trim() : null);
    certificateSha1 = certificateSha1 || (line1 ? line1.split(':').slice(-1)[0].trim() : null);
  }
} catch (error) {
  console.warn('could not read APK certificate:', error.message);
}

const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
const notes = fs.readFileSync(path.join('release', 'RELEASE_NOTES.md'), 'utf8');
const notesTaFile = path.join('release', 'RELEASE_NOTES.ta.txt');
const notesTa = fs.existsSync(notesTaFile) ? fs.readFileSync(notesTaFile, 'utf8') : undefined;

const feed = {
  version: VERSION,
  versionCode: VERSION_CODE,
  notes,
  ...(notesTa ? { notesTa } : {}),
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
signed with certificate
  SHA-256 ${certificate || '(see apksigner verify --print-certs)'}
  SHA-1   ${certificateSha1 || '(see apksigner verify --print-certs)'}

Signing history: 1.3.0 and 1.4.0 were signed with throwaway debug keys that no
longer exist, so an installed 1.4.0 or older must be uninstalled once before
this build. 1.5.0 onward share one stable release key, so later versions
install in place.
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
        certificateSha256: certificate,
        certificateSha1
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
console.log(`cert sha1 ${certificateSha1} sha256 ${certificate}`);
console.log(`feed release/latest.json for ${TAG} @ ${commit} (versionCode ${VERSION_CODE})`);
