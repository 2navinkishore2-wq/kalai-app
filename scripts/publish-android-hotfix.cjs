/**
 * Publishes an Android-only hotfix for an already released version.
 *
 * A published release is treated as immutable: the hotfix APK is uploaded to a
 * NEW release (`v<version>-hotfix<N>`) under a distinct file name, and the
 * public feed is republished with the same `version` plus the hotfix
 * `versionCode`, so Android sees a higher build while Windows (which compares
 * versionName only) is not offered a non-existent new build.
 *
 * Usage:  node scripts/publish-android-hotfix.cjs [hotfixLabel]
 * Default label: hotfix1
 *
 * Uses the GitHub credential already stored by git — no token is written
 * anywhere.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const OWNER = '2navinkishore2-wq';
const VERSION = require('../package.json').version;
const LABEL = (process.argv[2] || 'hotfix1').replace(/[^a-z0-9]/gi, '').toLowerCase();
const HOTFIX_TAG = `v${VERSION}-${LABEL}`;
const gradle = fs.readFileSync(path.join('android', 'app', 'build.gradle'), 'utf8');
const VERSION_CODE = Number((/versionCode\s+(\d+)/.exec(gradle) || [])[1] || 0);
const gradleVersionName = (/versionName\s+"([^"]+)"/.exec(gradle) || [])[1];
if (!VERSION_CODE) throw new Error('could not read versionCode from android/app/build.gradle');
if (gradleVersionName !== VERSION) throw new Error(`android versionName ${gradleVersionName} != package.json ${VERSION}`);

const BUILT_APK = path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
const APK_NAME = `KALAI-DIGITAL-${VERSION}-${LABEL}.apk`;
const APK_PATH = path.join('release', APK_NAME);
const NOTES = fs.readFileSync(path.join('release', `RELEASE_NOTES-${VERSION}-${LABEL}.md`), 'utf8');
const REPOS = ['kalai-app', 'kalai-app-releases'];

if (!fs.existsSync(BUILT_APK)) throw new Error('no built APK — run the Gradle release build first');
fs.copyFileSync(BUILT_APK, APK_PATH);

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const apkSha = sha256(APK_PATH);
const apkSize = fs.statSync(APK_PATH).size;

// The Windows installer is NOT rebuilt for an Android-only hotfix: it keeps
// the URL, size and checksum of the published 1.7.0 release.
const previousFeedPath = path.join('release', 'latest.json');
const previous = JSON.parse(fs.readFileSync(previousFeedPath, 'utf8'));
const windows = previous.assets && previous.assets.windows;
if (!windows || !windows.url) throw new Error('the previous feed has no Windows asset to preserve');

const feed = {
  version: VERSION,
  versionCode: VERSION_CODE,
  notes: NOTES,
  notesTa: previous.notesTa || '',
  releasedAt: new Date().toISOString(),
  pageUrl: `https://github.com/${OWNER}/kalai-app-releases/releases/tag/${HOTFIX_TAG}`,
  assets: {
    android: {
      url: `https://github.com/${OWNER}/kalai-app-releases/releases/download/${HOTFIX_TAG}/${APK_NAME}`,
      size: apkSize,
      sha256: apkSha
    },
    windows
  }
};
fs.writeFileSync(path.join('release', 'latest.json'), `${JSON.stringify(feed, null, 2)}\n`);

const sums = [
  `KALAI DIGITAL ${VERSION} — Android ${LABEL} (versionCode ${VERSION_CODE})`,
  '',
  `sha256  ${apkSha}  ${APK_NAME}  (${apkSize} bytes)`,
  `sha256  ${windows.sha256}  KALAI-DIGITAL-Setup-${VERSION}.exe  (${windows.size} bytes, unchanged)`,
  ''
].join('\n');
fs.writeFileSync(path.join('release', `SHA256SUMS-${LABEL}.txt`), sums);

const buildInfo = {
  version: VERSION,
  versionCode: VERSION_CODE,
  label: LABEL,
  builtAt: new Date().toISOString(),
  android: { file: APK_NAME, size: apkSize, sha256: apkSha },
  windows: { unchanged: true, url: windows.url, size: windows.size, sha256: windows.sha256 }
};
fs.writeFileSync(path.join('release', `build-info-${LABEL}.json`), `${JSON.stringify(buildInfo, null, 2)}\n`);

const ASSETS = [
  [APK_PATH, APK_NAME],
  [path.join('release', `SHA256SUMS-${LABEL}.txt`), 'SHA256SUMS.txt'],
  [path.join('release', 'latest.json'), 'latest.json'],
  [path.join('release', `build-info-${LABEL}.json`), 'build-info.json']
];

const cred = execFileSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n'
}).toString();
const token = ((/password=(.*)/.exec(cred) || [])[1] || '').trim();
if (!token) throw new Error('no github credential available');

const headers = {
  Authorization: `token ${token}`,
  'User-Agent': 'kalai-release',
  Accept: 'application/vnd.github+json'
};

async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function publishFeedFile() {
  const content = fs.readFileSync(path.join('release', 'latest.json'));
  let sha;
  try {
    const existing = await api(`https://api.github.com/repos/${OWNER}/kalai-app-releases/contents/latest.json?ref=main`);
    sha = existing.sha;
  } catch {
    sha = undefined;
  }
  await api(`https://api.github.com/repos/${OWNER}/kalai-app-releases/contents/latest.json`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Update feed for ${HOTFIX_TAG} (versionCode ${VERSION_CODE})`,
      content: content.toString('base64'),
      branch: 'main',
      ...(sha ? { sha } : {})
    })
  });
  console.log('published latest.json to kalai-app-releases@main');
}

(async () => {
  await publishFeedFile();

  for (const repo of REPOS) {
    const releases = await api(`https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=100`);
    let release = releases.find((r) => r.tag_name === HOTFIX_TAG);
    if (release) {
      console.log(`${repo}: reusing ${HOTFIX_TAG} (${release.id})`);
    } else {
      release = await api(`https://api.github.com/repos/${OWNER}/${repo}/releases`, {
        method: 'POST',
        body: JSON.stringify({
          tag_name: HOTFIX_TAG,
          target_commitish: 'main',
          name: `KALAI DIGITAL ${VERSION} — Android ${LABEL} (versionCode ${VERSION_CODE})`,
          body: NOTES,
          draft: false,
          prerelease: false
        })
      });
      console.log(`${repo}: created ${HOTFIX_TAG} ${release.html_url}`);
    }

    release = await api(`https://api.github.com/repos/${OWNER}/${repo}/releases/${release.id}`);
    for (const [file, name] of ASSETS) {
      const existing = (release.assets || []).find((a) => a.name === name);
      if (existing) {
        await api(`https://api.github.com/repos/${OWNER}/${repo}/releases/assets/${existing.id}`, { method: 'DELETE' });
      }
      const asset = await api(
        `https://uploads.github.com/repos/${OWNER}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: fs.readFileSync(file) }
      );
      console.log(`  uploaded ${asset.name} (${asset.size} bytes)`);
    }
  }

  console.log(`\nAPK   ${apkSize} bytes ${apkSha}`);
  console.log(`feed  https://raw.githubusercontent.com/${OWNER}/kalai-app-releases/main/latest.json`);
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
