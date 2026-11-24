/**
 * Publishes the current version to both GitHub repositories.
 *
 *  • `kalai-app` (private source): the release with the installers.
 *  • `kalai-app-releases` (public): the same release, plus `latest.json`
 *    committed to `main`, which is what the app's update feed reads
 *    (raw.githubusercontent.com serves it with CORS enabled and no token).
 *
 * Uses the GitHub credential already stored by git — no token is written
 * anywhere. Version comes from package.json, so this script is reusable.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OWNER = '2navinkishore2-wq';
const VERSION = require('../package.json').version;
const TAG = `v${VERSION}`;
const NAME = `KALAI DIGITAL ${VERSION}`;
const NOTES = fs.readFileSync(path.join('release', 'RELEASE_NOTES.md'), 'utf8');
const ASSETS = [
  [`release/KALAI-DIGITAL-${VERSION}.apk`, `KALAI-DIGITAL-${VERSION}.apk`],
  [`release/KALAI-DIGITAL-Setup-${VERSION}.exe`, `KALAI-DIGITAL-Setup-${VERSION}.exe`],
  ['release/SHA256SUMS.txt', 'SHA256SUMS.txt'],
  ['release/latest.json', 'latest.json'],
  ['release/build-info.json', 'build-info.json']
];
const REPOS = ['kalai-app', 'kalai-app-releases'];

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

/** Commits latest.json to the public repository's main branch (raw feed). */
async function publishFeedFile() {
  const content = fs.readFileSync('release/latest.json');
  const base64 = content.toString('base64');
  let sha;
  try {
    const existing = await api(`https://api.github.com/repos/${OWNER}/kalai-app-releases/contents/latest.json?ref=main`);
    sha = existing.sha;
  } catch {
    sha = undefined; // first publish
  }
  await api(`https://api.github.com/repos/${OWNER}/kalai-app-releases/contents/latest.json`, {
    method: 'PUT',
    body: JSON.stringify({
      message: `Update feed for ${TAG}`,
      content: base64,
      branch: 'main',
      ...(sha ? { sha } : {})
    })
  });
  console.log('published latest.json to kalai-app-releases@main');
}

(async () => {
  await publishFeedFile();

  for (const repo of REPOS) {
    const releases = await api(`https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=50`);
    let release = releases.find((r) => r.tag_name === TAG);
    if (release) {
      console.log(`${repo}: reusing existing release ${release.id}`);
    } else {
      release = await api(`https://api.github.com/repos/${OWNER}/${repo}/releases`, {
        method: 'POST',
        body: JSON.stringify({
          tag_name: TAG,
          target_commitish: 'main',
          name: NAME,
          body: NOTES,
          draft: false,
          prerelease: false
        })
      });
      console.log(`${repo}: created release ${release.id} ${release.html_url}`);
    }

    // Refresh the asset list after the (possible) creation.
    release = await api(`https://api.github.com/repos/${OWNER}/${repo}/releases/${release.id}`);

    for (const [file, name] of ASSETS) {
      const data = fs.readFileSync(file);
      const existing = (release.assets || []).find((a) => a.name === name);
      if (existing) {
        await api(`https://api.github.com/repos/${OWNER}/${repo}/releases/assets/${existing.id}`, { method: 'DELETE' });
      }
      const asset = await api(
        `https://uploads.github.com/repos/${OWNER}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: data }
      );
      console.log(`  uploaded ${asset.name} (${asset.size} bytes)`);
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
