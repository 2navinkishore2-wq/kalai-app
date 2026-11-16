const fs = require('fs');

const APK = {
  size: 10078089,
  sha: '5473369e8b081e0c9c046613c412f00cf2b61b819ef3175fc0d5dd30272c5b44'
};
const EXE = {
  size: 109200180,
  sha: '034f385dfed36fd7c7a6f60b9eec7fb9ecc58d296a7c9accf028d6d7ebedac79'
};
const BUNDLE = {
  entry: 'assets/index-Cl3-IPk7.js',
  sha: 'b8fde933f0874f75b0b4fb52cbfee6c5a8eb23e71c8e6920e9b4cb08e1695c62'
};
const COMMIT = 'e535504';

// latest.json
const feed = JSON.parse(fs.readFileSync('release/latest.json', 'utf8'));
feed.assets.android.size = APK.size;
feed.assets.android.sha256 = APK.sha;
feed.assets.windows.size = EXE.size;
feed.assets.windows.sha256 = EXE.sha;
fs.writeFileSync('release/latest.json', `${JSON.stringify(feed, null, 2)}\n`);

// build-info.json
const info = JSON.parse(fs.readFileSync('release/build-info.json', 'utf8'));
info.sourceCommit = COMMIT;
info.webBundle = {
  entry: BUNDLE.entry,
  sha256: BUNDLE.sha,
  identicalInApkAndExe: true
};
info.android.sizeBytes = APK.size;
info.android.sha256 = APK.sha.toUpperCase();
info.windows.sizeBytes = EXE.size;
info.windows.sha256 = EXE.sha.toUpperCase();
fs.writeFileSync('release/build-info.json', `${JSON.stringify(info, null, 2)}\n`);

// SHA256SUMS.txt
fs.writeFileSync(
  'release/SHA256SUMS.txt',
  `KALAI DIGITAL 1.3.0 — SHA-256 checksums
Built from source revision ${COMMIT} (tag v1.3.0)

${APK.sha}  KALAI-DIGITAL-1.3.0.apk
${EXE.sha}  KALAI-DIGITAL-Setup-1.3.0.exe

Verify on Windows:
  certutil -hashfile KALAI-DIGITAL-1.3.0.apk SHA256
  certutil -hashfile KALAI-DIGITAL-Setup-1.3.0.exe SHA256

Android APK: package com.kalaidigital.billing, versionCode 4, versionName 1.3.0,
signed with certificate SHA-256 7fe43dfc69310fdc4c966c92caefbeb1d9d08dee2f072be6fdc8e971c599defd
(the same key as the 1.2.0 build, so it installs over it in place).
`
);

// RELEASE_NOTES.md
let notes = fs.readFileSync('release/RELEASE_NOTES.md', 'utf8');
notes = notes
  .replace(/`5bc03d014e03d21a7439fd507cc71579444f319ff9594feac33670e97f42eac5`/g, `\`${APK.sha}\``)
  .replace(/`13c4d9e0673409814d120dead6f35383a73889b98c5e736d7748413e460bd907`/g, `\`${EXE.sha}\``)
  .replace(/commit `e30a0b2`/g, `commit \`${COMMIT}\``)
  .replace(/index-z58-N8r1\.js/g, 'index-Cl3-IPk7.js')
  .replace(
    'Saved data stays in place.',
    'Saved data stays in place, and if a bill is open with unsaved items the app asks you to save or reset it first.'
  );
fs.writeFileSync('release/RELEASE_NOTES.md', notes);

console.log('updated release metadata');
