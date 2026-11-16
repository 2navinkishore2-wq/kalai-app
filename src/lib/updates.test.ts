import { describe, expect, it } from 'vitest';
import {
  appVersion,
  assetForPlatform,
  checkForUpdates,
  compareVersions,
  isNewerVersion,
  normalizeVersion,
  parseRelease,
  type ReleaseInfo
} from './updates';
import { FRAME_BEADINGS, normalizeBeading } from './constants';

const feed = {
  version: '1.4.0',
  versionCode: 5,
  notes: 'Frame beading field and responsive bill layout.',
  notesTa: 'பிரேம் பீடிங் மற்றும் திரை அமைப்பு.',
  releasedAt: '2026-12-01T10:00:00Z',
  pageUrl: 'https://example.test/releases/1.4.0',
  assets: {
    android: { url: 'https://example.test/KALAI-DIGITAL-1.4.0.apk', size: 10, sha256: 'abc' },
    windows: { url: 'https://example.test/KALAI-DIGITAL-Setup-1.4.0.exe', size: 20, sha256: 'def' }
  }
};

function respond(payload: unknown, ok = true, status = 200) {
  return (async () => ({
    ok,
    status,
    json: async () => payload
  })) as unknown as typeof fetch;
}

describe('version comparison', () => {
  it('normalises tags and build metadata', () => {
    expect(normalizeVersion('v1.3.0')).toBe('1.3.0');
    expect(normalizeVersion(' 1.3.0+build7 ')).toBe('1.3.0');
  });

  it('compares numerically, not alphabetically', () => {
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareVersions('1.3.0', '1.3.0')).toBe(0);
    expect(compareVersions('1.2.9', '1.3.0')).toBe(-1);
    expect(compareVersions('2.0', '1.99.99')).toBe(1);
  });

  it('only reports strictly newer versions', () => {
    expect(isNewerVersion('1.3.0', '1.2.0')).toBe(true);
    expect(isNewerVersion('1.3.0', '1.3.0')).toBe(false);
    expect(isNewerVersion('1.2.9', '1.3.0')).toBe(false);
  });

  it('exposes the version compiled into the build', () => {
    expect(appVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});

describe('release feed parsing', () => {
  it('reads the app feed schema', () => {
    const release = parseRelease(feed);
    expect(release?.version).toBe('1.4.0');
    expect(release?.assets.android?.url).toContain('.apk');
    expect(release?.assets.windows?.sha256).toBe('def');
  });

  it('reads a GitHub release document as a fallback', () => {
    const release = parseRelease({
      tag_name: 'v1.4.0',
      body: 'Notes',
      html_url: 'https://github.com/o/r/releases/tag/v1.4.0',
      published_at: '2026-12-01T10:00:00Z',
      assets: [
        { name: 'KALAI-DIGITAL-1.4.0.apk', browser_download_url: 'https://x.test/a.apk', size: 1 },
        { name: 'KALAI-DIGITAL-Setup-1.4.0.exe', browser_download_url: 'https://x.test/a.exe', size: 2 }
      ]
    });
    expect(release?.version).toBe('1.4.0');
    expect(release?.assets.android?.url).toBe('https://x.test/a.apk');
    expect(release?.assets.windows?.url).toBe('https://x.test/a.exe');
  });

  it('rejects documents without a usable installer', () => {
    expect(parseRelease({ version: '1.4.0', releases: [] })).toBeNull();
    expect(parseRelease(null)).toBeNull();
    expect(parseRelease({ version: 'latest' })).toBeNull();
  });

  it('selects the right asset per platform', () => {
    const release = parseRelease(feed) as ReleaseInfo;
    expect(assetForPlatform(release, 'android')?.url).toContain('.apk');
    expect(assetForPlatform(release, 'windows')?.url).toContain('.exe');
  });
});

describe('checkForUpdates', () => {
  it('reports an available update when the feed is newer', async () => {
    const result = await checkForUpdates({ currentVersion: '1.3.0', fetchImpl: respond(feed) });
    expect(result.status).toBe('available');
    expect(result.release?.version).toBe('1.4.0');
    expect(result.checkedAt).toBeTruthy();
  });

  it('reports up to date for the same or older feed', async () => {
    const same = await checkForUpdates({ currentVersion: '1.4.0', fetchImpl: respond(feed) });
    expect(same.status).toBe('current');
    const older = await checkForUpdates({ currentVersion: '1.5.0', fetchImpl: respond(feed) });
    expect(older.status).toBe('current');
  });

  it('reports offline without calling the network', async () => {
    let called = false;
    const result = await checkForUpdates({
      currentVersion: '1.3.0',
      online: false,
      fetchImpl: (async () => {
        called = true;
        return { ok: true, status: 200, json: async () => feed };
      }) as unknown as typeof fetch
    });
    expect(result.status).toBe('offline');
    expect(called).toBe(false);
  });

  it('reports feed failures and bad payloads instead of throwing', async () => {
    const notFound = await checkForUpdates({ currentVersion: '1.3.0', fetchImpl: respond({}, false, 404) });
    expect(notFound.status).toBe('error');
    expect(notFound.message).toContain('404');

    const bad = await checkForUpdates({ currentVersion: '1.3.0', fetchImpl: respond({ hello: 'world' }) });
    expect(bad.status).toBe('error');

    const network = await checkForUpdates({
      currentVersion: '1.3.0',
      fetchImpl: (async () => {
        throw new Error('network down');
      }) as unknown as typeof fetch
    });
    expect(network.status).toBe('error');
    expect(network.message).toContain('network down');
  });
});

describe('frame beading options', () => {
  it('offers 1 inch, 1½ inches and 2 inches', () => {
    expect(FRAME_BEADINGS.map((b) => b.value)).toEqual(['1 inch', '1½ inches', '2 inches']);
  });

  it('upgrades the 1.2.0 singular label when editing an old bill', () => {
    expect(normalizeBeading('1½ inch')).toBe('1½ inches');
    expect(normalizeBeading('2 inches')).toBe('2 inches');
    expect(normalizeBeading(undefined)).toBe('1 inch');
  });
});
