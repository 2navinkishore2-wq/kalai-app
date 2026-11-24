/// <reference types="vite/client" />

import type { UpdatePlatform } from './lib/updates';

declare global {
  /** Injected by Vite from package.json `version` (see vite.config.ts). */
  const __APP_VERSION__: string;
  /** Android signing certificate SHA-1, injected at build time (see vite.config.ts). */
  const __ANDROID_SHA1__: string;

  interface Window {
    /** Exposed by electron/preload.cjs in the Windows build only. */
    kalaiDigital?: {
      isElectron?: boolean;
      platform?: string;
      installUpdate?: (payload: {
        url: string;
        fileName: string;
        sha256?: string;
        version?: string;
      }) => Promise<{ ok: boolean; path?: string; sha256?: string; size?: number; error?: string }>;
      openExternal?: (url: string) => Promise<boolean> | boolean;
      updatePlatform?: UpdatePlatform;
    };
    /** Set by the billing screen while a bill has unsaved items. */
    __kalaiUnsavedBill?: boolean;
  }
}

export {};
