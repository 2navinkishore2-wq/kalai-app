/**
 * KALAI DIGITAL — in-app update checks.
 *
 * The app reads one small JSON document ("release feed") that is published as a
 * release asset. Nothing about billing depends on it: the check runs after the
 * workspace is ready, never blocks sign-in, and every failure is non-fatal.
 */

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'current' | 'offline' | 'error' | 'installing' | 'opened';

export interface ReleaseAsset {
  url: string;
  size?: number;
  sha256?: string;
}

export interface ReleaseInfo {
  version: string;
  versionCode?: number;
  notes: string;
  notesTa?: string;
  releasedAt?: string;
  pageUrl?: string;
  assets: {
    android?: ReleaseAsset;
    windows?: ReleaseAsset;
  };
}

export interface UpdateResult {
  status: UpdateStatus;
  currentVersion: string;
  release?: ReleaseInfo;
  message?: string;
  checkedAt?: string;
}

export type UpdatePlatform = 'android' | 'windows' | 'web';

/**
 * Public release feed. Kept as a plain "latest download" URL so an installed
 * app needs no GitHub token, no login and no API quota: the URL redirects to
 * the newest published `latest.json`.
 */
export const DEFAULT_FEED_URL =
  'https://github.com/2navinkishore2-wq/kalai-app-releases/releases/latest/download/latest.json';

/** Human-readable release page, used when a browser fallback is needed. */
export const DEFAULT_RELEASE_PAGE =
  'https://github.com/2navinkishore2-wq/kalai-app-releases/releases/latest';

const FEED_OVERRIDE_KEY = 'kalai:update-feed:v1';

/** Test/dev override: Settings → About → release feed, or a build-time env var. */
export function feedUrl(): string {
  try {
    const stored = localStorage.getItem(FEED_OVERRIDE_KEY);
    if (stored && /^https?:\/\//i.test(stored)) return stored;
  } catch {
    /* storage unavailable */
  }
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_UPDATE_FEED;
  return env && /^https?:\/\//i.test(env) ? env : DEFAULT_FEED_URL;
}

export function setFeedUrlOverride(url: string | null): void {
  try {
    if (url) localStorage.setItem(FEED_OVERRIDE_KEY, url);
    else localStorage.removeItem(FEED_OVERRIDE_KEY);
  } catch {
    /* storage unavailable */
  }
}

/** The version compiled into this installer (vite `define`). */
export function appVersion(): string {
  try {
    return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function normalizeVersion(value: string): string {
  return String(value || '')
    .trim()
    .replace(/^v/i, '')
    .split(/[+\s]/)[0];
}

/** Numeric, locale-free comparison: 1.10.0 > 1.9.9. */
export function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

function asAsset(input: unknown): ReleaseAsset | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const url = typeof raw.url === 'string' ? raw.url : typeof raw.browser_download_url === 'string' ? raw.browser_download_url : '';
  if (!/^https?:\/\//i.test(url)) return null;
  return {
    url,
    size: typeof raw.size === 'number' ? raw.size : undefined,
    sha256: typeof raw.sha256 === 'string' ? raw.sha256 : typeof raw.digest === 'string' ? raw.digest.replace(/^sha256:/i, '') : undefined
  };
}

/**
 * Accepts the app's own `latest.json` and, defensively, a GitHub release API
 * document, so a feed can be swapped without shipping a new build.
 */
export function parseRelease(payload: unknown): ReleaseInfo | null {
  if (!payload || typeof payload !== 'object') return null;
  const raw = payload as Record<string, unknown>;

  const isGithubRelease = typeof raw.tag_name === 'string';
  const version = normalizeVersion(
    (typeof raw.version === 'string' && raw.version) || (isGithubRelease ? String(raw.tag_name) : '')
  );
  if (!version || !/^\d+(\.\d+)*$/.test(version)) return null;

  let android: ReleaseAsset | null = null;
  let windows: ReleaseAsset | null = null;

  if (raw.assets && !Array.isArray(raw.assets) && typeof raw.assets === 'object') {
    const grouped = raw.assets as Record<string, unknown>;
    android = asAsset(grouped.android);
    windows = asAsset(grouped.windows);
  } else if (Array.isArray(raw.assets)) {
    for (const entry of raw.assets) {
      const asset = asAsset(entry);
      if (!asset) continue;
      const name = String((entry as Record<string, unknown>).name || asset.url).toLowerCase();
      if (name.endsWith('.apk') && !android) android = asset;
      if (name.endsWith('.exe') && !windows) windows = asset;
    }
  }

  if (!android && !windows) return null;

  return {
    version,
    versionCode: typeof raw.versionCode === 'number' ? raw.versionCode : undefined,
    notes: typeof raw.notes === 'string' ? raw.notes : typeof raw.body === 'string' ? raw.body : '',
    notesTa: typeof raw.notesTa === 'string' ? raw.notesTa : undefined,
    releasedAt: typeof raw.releasedAt === 'string' ? raw.releasedAt : typeof raw.published_at === 'string' ? raw.published_at : undefined,
    pageUrl: typeof raw.pageUrl === 'string' ? raw.pageUrl : typeof raw.html_url === 'string' ? raw.html_url : undefined,
    assets: { android: android || undefined, windows: windows || undefined }
  };
}

export function assetForPlatform(release: ReleaseInfo | undefined, platform: UpdatePlatform): ReleaseAsset | null {
  if (!release) return null;
  if (platform === 'android') return release.assets.android || null;
  if (platform === 'windows') return release.assets.windows || null;
  return release.assets.windows || release.assets.android || null;
}

interface CheckOptions {
  currentVersion?: string;
  feedUrl?: string;
  fetchImpl?: typeof fetch;
  online?: boolean;
  timeoutMs?: number;
}

/**
 * Downloads and parses the feed. Never throws: the result carries the status so
 * the UI can explain "up to date", "offline" or a failed download.
 */
export async function checkForUpdates(options: CheckOptions = {}): Promise<UpdateResult> {
  const currentVersion = options.currentVersion || appVersion();
  const online =
    options.online !== undefined
      ? options.online
      : typeof navigator === 'undefined'
        ? true
        : navigator.onLine !== false;

  if (!online) {
    return { status: 'offline', currentVersion, message: 'No internet connection.' };
  }

  const doFetch = options.fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!doFetch) {
    return { status: 'error', currentVersion, message: 'This device cannot check for updates.' };
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), options.timeoutMs ?? 12000) : null;

  try {
    const response = await doFetch(options.feedUrl || feedUrl(), {
      method: 'GET',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller ? controller.signal : undefined
    });
    if (!response.ok) {
      return { status: 'error', currentVersion, message: `Update feed returned ${response.status}.` };
    }
    const payload = await response.json();
    const release = parseRelease(payload);
    if (!release) {
      return { status: 'error', currentVersion, message: 'The update feed did not list a usable installer.' };
    }
    const checkedAt = new Date().toISOString();
    if (isNewerVersion(release.version, currentVersion)) {
      return { status: 'available', currentVersion, release, checkedAt };
    }
    return { status: 'current', currentVersion, release, checkedAt };
  } catch (error) {
    const message =
      (error as Error)?.name === 'AbortError'
        ? 'The update check timed out.'
        : (error as Error)?.message || 'The update check failed.';
    return {
      status: online ? 'error' : 'offline',
      currentVersion,
      message: online ? message : 'No internet connection.'
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Opens a URL outside the app: system browser on Android, desktop browser on the web. */
export function openExternalUrl(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = window.kalaiDigital;
  if (bridge?.openExternal) {
    void bridge.openExternal(url);
    return true;
  }
  // Capacitor maps `_system` to the Android system browser.
  const opened = window.open(url, '_system');
  if (opened) return true;
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}

export interface InstallOutcome {
  status: 'started' | 'opened' | 'unsupported';
  message?: string;
}

/**
 * Hands the installer over to the platform.
 * Windows: the Electron main process downloads, verifies the SHA-256 and runs
 * the NSIS installer, then quits so the files can be replaced.
 * Android: the APK is opened in the system browser, which downloads it and
 * passes it to Android's package installer for the user to confirm.
 */
export async function installRelease(release: ReleaseInfo, platform: UpdatePlatform): Promise<InstallOutcome> {
  const asset = assetForPlatform(release, platform);
  if (!asset) return { status: 'unsupported', message: 'This release has no installer for this device.' };

  if (platform === 'windows') {
    const bridge = typeof window !== 'undefined' ? window.kalaiDigital : undefined;
    if (bridge?.installUpdate) {
      const fileName = asset.url.split('/').pop() || `KALAI-DIGITAL-Setup-${release.version}.exe`;
      await bridge.installUpdate({ url: asset.url, fileName, sha256: asset.sha256, version: release.version });
      return { status: 'started' };
    }
  }

  const opened = openExternalUrl(asset.url);
  return opened
    ? { status: 'opened' }
    : { status: 'unsupported', message: 'Could not open the download link. Use the release page instead.' };
}
