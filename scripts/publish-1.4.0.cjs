/**
 * Publishes the 1.4.0 release to both GitHub repositories (source + public
 * releases) and uploads the APK, the Windows installer, the checksums and the
 * update feed. Uses the GitHub credential already stored by git — no token is
 * written anywhere.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OWNER = '2navinkishore2-wq';
const VERSION = require('../package.json').version;
const TAG = `v${VERSION}`;
const REPOS = ['kalai-app', 'kalai-app-releases'];
const NAME = `KALAI DIGITAL ${VERSION}`;
const NOTES = fs.readFileSync(path.join('release', 'RELEASE_NOTES.md'), 'utf8');
const ASSETS = [
  [`release/KALAI-DIGITAL-${VERSION}.apk`, `KALAI-DIGITAL-${VERSION}.apk`],
  [`release/KALAI-DIGITAL-Setup-${VERSION}.exe`, `KALAI-DIGITAL-Setup-${VERSION}.exe`],
  ['release/SHA256SUMS.txt', 'SHA256SUMS.txt'],
  ['release/latest.json', 'latest.json']
];

const cred = execFileSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n'
}).toString();
const token = (/password=(.*)/.exec(cred) || [])[1];
if (!token) throw new Error('no github credential available');

const headers = {
  Authorization: `token ${token.trim()}`,
  'User-Agent': 'kalai-release',
  Accept: 'application/vnd.github+json'
};

async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

(async () => {
  for (const repo of REPOS) {
    const releases = await api(`https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=50`);
    let release = releases.find((r) => r.tag_name === TAG);
    if (release) {
      console.log(`${repo}: reuse existing release ${release.id}`);
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
