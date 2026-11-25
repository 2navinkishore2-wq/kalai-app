import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import pkg from './package.json';

/**
 * versionCode from android/app/build.gradle. Two builds can share a
 * versionName (1.7.0 and its hotfix), so the update check needs the code to
 * tell them apart on Android.
 */
function androidVersionCode(): number {
  try {
    const gradle = readFileSync(new URL('./android/app/build.gradle', import.meta.url), 'utf8');
    return Number((/versionCode\s+(\d+)/.exec(gradle) || [])[1] || 0);
  } catch {
    return 0;
  }
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_VERSION_CODE__: JSON.stringify(androidVersionCode()),
    // SHA-1 of the certificate used to sign the Android APK. Shown in
    // Settings so the owner can register it in the Firebase console for
    // Google Sign-In. Public information; injected at build time.
    __ANDROID_SHA1__: JSON.stringify((process.env.ANDROID_SHA1 || '').trim())
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered at runtime instead (src/lib/serviceWorker.ts): inside the
      // Android WebView the worker would keep serving the previous APK's files.
      injectRegister: false,
      includeAssets: ['logo.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png'],
      manifest: {
        name: 'KALAI DIGITAL',
        short_name: 'KALAI',
        description: 'Billing and business management for printing, flex, photo frame and digital printing',
        theme_color: '#7B1220',
        background_color: '#FAF7F1',
        display: 'standalone',
        start_url: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        navigateFallback: 'index.html'
      }
    })
  ],
  server: {
    port: 5176,
    strictPort: false,
    host: true,
    // Build output and toolchains are not source: watching them made the dev
    // server crash with EBUSY while a Windows/Android build was running.
    watch: { ignored: ['**/release/**', '**/android/**', '**/.tools/**', '**/dist/**'] }
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020'
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
