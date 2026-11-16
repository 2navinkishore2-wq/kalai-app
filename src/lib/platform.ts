export function isNative(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}

export function isAndroid(): boolean {
  return isNative() && /android/i.test(navigator.userAgent);
}

export function isElectron(): boolean {
  return typeof window !== 'undefined' && !!(window as unknown as { kalaiDigital?: { isElectron?: boolean } }).kalaiDigital?.isElectron;
}

export function platformLabel(): string {
  if (isAndroid()) return 'Android';
  if (isElectron()) return 'Windows';
  return 'Web';
}

/** Secure context required by WebUSB, Web Bluetooth and service workers. */
export function hasSecureContext(): boolean {
  return typeof window !== 'undefined' && (window.isSecureContext || location.hostname === 'localhost');
}
