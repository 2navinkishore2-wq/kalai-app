// Replaces the assets of an existing release with freshly built files and
// updates the release body from release/RELEASE_NOTES.md.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OWNER = '2navinkishore2-wq';
const REPOS = process.argv.slice(2).length ? process.argv.slice(2) : ['kalai-app', 'kalai-app-releases'];
const TAG = 'v1.3.0';
const NOTES = fs.readFileSync(path.join('release', 'RELEASE_NOTES.md'), 'utf8');
const ASSETS = [
  ['release/KALAI-DIGITAL-1.3.0.apk', 'KALAI-DIGITAL-1.3.0.apk'],
  ['release/KALAI-DIGITAL-Setup-1.3.0.exe', 'KALAI-DIGITAL-Setup-1.3.0.exe'],
  ['release/SHA256SUMS.txt', 'SHA256SUMS.txt'],
  ['release/latest.json', 'latest.json']
];

const cred = execFileSync('git', ['credential', 'fill'], { input: 'protocol=https\nhost=github.com\n\n' }).toString();
const token = (/password=(.*)/.exec(cred) || [])[1].trim();
const headers = {
  Authorization: `token ${token}`,
  'User-Agent': 'kalai-release',
  Accept: 'application/vnd.github+json'
};

async function api(url, options = {}) {
  const res = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

(async () => {
  for (const repo of REPOS) {
    const releases = await api(`https://api.github.com/repos/${OWNER}/${repo}/releases`);
    const release = releases.find((r) => r.tag_name === TAG);
    if (!release) throw new Error(`${repo}: no release for ${TAG}`);

    await api(`https://api.github.com/repos/${OWNER}/${repo}/releases/${release.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: release.name, body: NOTES })
    });

    for (const asset of release.assets) {
      if (ASSETS.some(([, name]) => name === asset.name)) {
        await api(`https://api.github.com/repos/${OWNER}/${repo}/releases/assets/${asset.id}`, { method: 'DELETE' });
        console.log(`${repo}: deleted old ${asset.name}`);
      }
    }

    for (const [file, name] of ASSETS) {
      const data = fs.readFileSync(file);
      const uploaded = await api(
        `https://uploads.github.com/repos/${OWNER}/${repo}/releases/${release.id}/assets?name=${encodeURIComponent(name)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: data }
      );
      console.log(`${repo}: uploaded ${uploaded.name} (${uploaded.size} bytes)`);
    }
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
