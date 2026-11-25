/**
 * Where the offline service worker is allowed to live.
 *
 * The browser build is a PWA, so `sw.js` caches the app shell and every asset.
 * Inside the Capacitor APK that cache is actively harmful: the WebView is served
 * from https://localhost, the worker precaches `index.html` and the hashed JS
 * bundle, and after a new APK is installed it keeps answering navigation
 * requests with the PREVIOUS APK's files. The new build then never runs — an
 * Android hotfix appears to change nothing, while `adb` shows the new APK
 * installed. Android therefore never registers the worker, and removes any
 * registration an older APK left behind.
 */
import { isNative } from './platform';

function isAndroidWebView(): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as unknown as { androidBridge?: unknown }).androidBridge;
  return !!bridge || isNative();
}

/** Browser/PWA only: same registration the old build injected into index.html. */
export function registerWebServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => undefined);
  });
}

/**
 * Android: drop a service worker (and its caches) installed by an earlier APK
 * and reload once so the files from this APK are actually the ones running.
 */
export async function clearStaleServiceWorker(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  if (!registrations.length) return;

  await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));

  if (typeof caches !== 'undefined') {
    const keys = await caches.keys().catch(() => [] as string[]);
    await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
  }

  // The page that is running was served by that worker, so it is still the old
  // bundle. Reload once per session to pick up this APK's own files.
  try {
    if (!sessionStorage.getItem('kalai:service-worker-cleared')) {
      sessionStorage.setItem('kalai:service-worker-cleared', '1');
      location.reload();
    }
  } catch {
    /* a reload is best effort; the app still works without it */
  }
}

/** Called once from main.tsx before the app renders. */
export function initOfflineCache(): void {
  if (isAndroidWebView()) void clearStaleServiceWorker();
  else registerWebServiceWorker();
}
