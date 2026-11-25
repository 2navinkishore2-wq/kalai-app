/**
 * Checks the published update feed with the same code the apps use.
 *
 *   npx tsx scripts/verify-feed.ts [currentVersion] [feedUrl] [currentVersionCode]
 *
 * Exit code 0 means the feed is reachable, parses, lists an installer for both
 * platforms and its checksums match the published values.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  DEFAULT_FEED_URL,
  appVersion,
  assetForPlatform,
  checkForUpdates,
  compareVersions,
  isNewerBuild,
  parseRelease
} from '../src/lib/updates';

/** versionCode of the APK built from this checkout. */
function localVersionCode(): number {
  try {
    const gradle = readFileSync('android/app/build.gradle', 'utf8');
    return Number((/versionCode\s+(\d+)/.exec(gradle) || [])[1] || 0);
  } catch {
    return 0;
  }
}

const currentVersion = process.argv[2] || (appVersion() === '0.0.0' ? '1.3.0' : appVersion());
const feedUrl = process.argv[3] || DEFAULT_FEED_URL;
const currentVersionCode = Number(process.argv[4] || 0) || localVersionCode();

async function main() {
  console.log(`feed:    ${feedUrl}`);
  console.log(`current: ${currentVersion}`);

  const response = await fetch(feedUrl, { headers: { Accept: 'application/json' }, redirect: 'follow' });
  if (!response.ok) throw new Error(`feed returned HTTP ${response.status}`);
  const payload = await response.json();
  const release = parseRelease(payload);
  if (!release) throw new Error('feed did not parse into a release');

  // A hotfix keeps the versionName and only raises versionCode, so the check
  // must use the same rule the Android app uses.
  const newer = isNewerBuild(release, currentVersion, currentVersionCode);
  const codeNote =
    compareVersions(release.version, currentVersion) === 0 && release.versionCode
      ? ` versionCode ${release.versionCode} vs ${currentVersionCode}`
      : '';
  console.log(`latest:  ${release.version}${codeNote} (${newer ? 'newer' : 'not newer'})`);
  console.log(`notes:   ${release.notes.split('\n')[0].slice(0, 90)}…`);

  const result = await checkForUpdates({ currentVersion, currentVersionCode, feedUrl });
  console.log(`status:  ${result.status}`);

  for (const platform of ['android', 'windows'] as const) {
    const asset = assetForPlatform(release, platform);
    if (!asset) throw new Error(`no ${platform} installer in the feed`);
    const head = await fetch(asset.url, { method: 'HEAD', redirect: 'follow' });
    if (!head.ok) throw new Error(`${platform} asset returned HTTP ${head.status}`);
    const size = Number(head.headers.get('content-length') || 0);
    const sample = await fetch(asset.url, { headers: { Range: 'bytes=0-0' }, redirect: 'follow' });
    console.log(`${platform}: HTTP ${head.status} ${size} bytes${asset.sha256 ? ` sha256=${asset.sha256.slice(0, 16)}…` : ' (no sha256 in feed)'}`);
    if (!sample.ok && sample.status !== 206) console.log(`  warning: ranged GET returned ${sample.status}`);
  }
}

main().catch((error) => {
  const cause = (error as { cause?: { message?: string; code?: string } }).cause;
  console.error(`FAILED: ${(error as Error).message}${cause ? ` (${cause.code || ''} ${cause.message || ''})` : ''}`);
  process.exit(1);
});

// Kept for callers that want a checksum helper in future release scripts.
export function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
