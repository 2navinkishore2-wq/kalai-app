/**
 * Native Android Google Sign-In bridge (v1.7.0 hotfix 1).
 *
 * Web/Windows use the Firebase JS SDK popup. Inside the Capacitor Android
 * WebView the popup flow is unreliable, so Android obtains a Google ID token
 * natively (`KalaiGoogleSignInPlugin`, AndroidX Credential Manager) and
 * exchanges it with the same Firebase JS SDK. Firebase federates by Google
 * account, so the resulting UID is identical across platforms.
 *
 * WHY THE PLUGIN CHANGED
 * `@capgo/capacitor-social-login` 6.0.1 hangs on Android: after the account is
 * chosen it also asks Identity.getAuthorizationClient() for an access token,
 * starts an intent sender with its own request codes, and waits on a future
 * with no timeout. Its handleOnActivityResult() only forwards Facebook results
 * and Capacitor's Bridge only routes request codes declared on the plugin, so
 * that result is never delivered. The plugin promise then never settles — the
 * button spins forever with no account picker and no error. The app now uses
 * its own plugin that returns only the ID token, which is all Firebase needs.
 *
 * EVERY NATIVE CALL IS BOUNDED
 * A rejected or never-answered native call must never leave the UI spinning.
 * Each awaited step has a timeout, only one attempt can run at a time, and a
 * timed-out attempt is discarded (its native selection is cleared) so a late
 * answer can never sign the user in unexpectedly.
 *
 * ERROR [16] "Account reauth failed"
 * Google's Credential Manager refuses the cached account selection. The app
 * performs exactly ONE bounded recovery: clear the cached credential state
 * (fire-and-forget, never blocking) and ask once more with the standard
 * account chooser. If that also fails the user gets an explanation, not a loop.
 */
import { registerPlugin } from '@capacitor/core';
import { isNative } from './platform';

export type NativeGoogleErrorCode =
  | 'NOT_CONFIGURED'
  | 'CANCELLED'
  | 'NO_CREDENTIAL'
  | 'PLAY_SERVICES'
  | 'DEVELOPER_ERROR'
  | 'REAUTH_REQUIRED'
  | 'NETWORK'
  | 'NO_ID_TOKEN'
  | 'TIMEOUT'
  | 'FAILED';

export function nativeWebClientId(): string {
  return (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '').trim();
}

export function isNativeGoogleConfigured(): boolean {
  return isNative() && !!nativeWebClientId();
}

export class NativeGoogleSignInError extends Error {
  readonly code: NativeGoogleErrorCode;
  /** True when this happened after the one automatic recovery was used. */
  readonly retried: boolean;

  constructor(message: string, code: NativeGoogleErrorCode, retried = false) {
    super(message);
    this.name = 'NativeGoogleSignInError';
    this.code = code;
    this.retried = retried;
  }
}

export interface NativeGoogleUser {
  idToken: string;
  email?: string | null;
  name?: string | null;
}

/** The native plugin surface used by the app (mockable in tests). */
export interface NativeGoogleBridge {
  signIn(options: { webClientId: string }): Promise<{ idToken?: string | null; email?: string | null; name?: string | null }>;
  clearCredentialState(): Promise<unknown>;
}

/**
 * Registers the Capacitor plugin declared in
 * `android/app/src/main/java/com/kalaidigital/billing/KalaiGoogleSignInPlugin.java`.
 * `registerPlugin` is public Capacitor API; calling it on the web is harmless
 * because every entry point here is guarded by `isNative()`.
 */
const plugin = registerPlugin<NativeGoogleBridge>('KalaiGoogleSignIn');

/**
 * Capacitor's `registerPlugin()` returns a Proxy whose `get` answers EVERY
 * property with a function — including `then`. So the proxy itself is a
 * thenable: handing it to a promise (an async function's return value is
 * resolved like a promise) makes the engine call `plugin.then(resolve,
 * reject)`, which Capacitor turns into a native call for a method that does
 * not exist. That call never settles, the awaiting promise never settles, and
 * only the 10 s bound ends it — which is exactly the
 * "The Google sign-in module did not load." screen, with the account chooser
 * never even requested. Calling the proxy through explicit functions hands out
 * a plain, non-thenable bridge instead.
 */
const nativeGoogleBridge: NativeGoogleBridge = {
  signIn: (options) => plugin.signIn(options),
  clearCredentialState: () => plugin.clearCredentialState()
};

export interface NativeGoogleDeps {
  isNative(): boolean;
  webClientId(): string;
  loadBridge(): Promise<NativeGoogleBridge>;
  /** How long the account chooser may stay open before the attempt is abandoned. */
  signInTimeoutMs?: number;
  /** Bound for clearing the cached Google selection; never blocks the retry. */
  clearTimeoutMs?: number;
}

const DEFAULT_SIGN_IN_TIMEOUT_MS = 90_000;
const DEFAULT_CLEAR_TIMEOUT_MS = 6_000;

/** The real bridge used by the app. Exported so tests can prove it is plain. */
export const defaultDeps: NativeGoogleDeps = {
  isNative,
  webClientId: nativeWebClientId,
  loadBridge: async () => nativeGoogleBridge
};

/**
 * Sanitized stage logging: stage names only, never tokens, emails or IDs.
 * Visible in `adb logcat` (Capacitor forwards console output) and DevTools.
 */
export function diag(stage: string, detail?: string): void {
  try {
    console.info(`[google-signin] ${stage}${detail ? `: ${detail}` : ''}`);
  } catch {
    /* logging must never break sign-in */
  }
}

const CONFIG_MESSAGE =
  'This APK’s Google sign-in configuration does not match the installed build. In Firebase → Project settings → Your apps, the Android app for package com.kalaidigital.billing must include this APK’s SHA-1 fingerprint, and the Web client ID must come from the same Firebase project.';

const MISSING_PLUGIN_MESSAGE =
  'This APK does not contain the native Google sign-in plugin. Install the latest KALAI DIGITAL build.';

const RETRY_MESSAGE =
  'Google still refuses this account after one retry. Check that the OAuth consent screen is External, that this Google account is listed under Audience → Test users (or the app is published), and that the APK’s SHA-1 is registered in Firebase → Project settings → Your apps.';

const TIMEOUT_MESSAGE =
  'Google did not answer in time, so the sign-in attempt was cancelled. Check the internet connection and that Google Play services is installed and updated, then tap Try again.';

/**
 * Maps a raw plugin/Google message to a stable code and a user-readable
 * explanation. Pure and exported so the wording and ordering are testable.
 */
export function classifyNativeGoogleFailure(rawMessage: string): {
  code: NativeGoogleErrorCode;
  message: string;
} {
  const msg = String(rawMessage || '');

  // [16] Account reauth failed — checked before the generic "10" rules.
  if (/\[16\]|account\s*reauth|reauth\s*failed/i.test(msg)) {
    return {
      code: 'REAUTH_REQUIRED',
      message:
        'Google asked this account to sign in again. Open Google Play services / your Google account on this phone, confirm that “Sign in with Google” is allowed for KALAI DIGITAL, then try again. If it keeps failing, the account may need to be added as a test user of the app’s OAuth consent screen.'
    };
  }

  if (/timeout|timed\s*out|did\s*not\s*answer/i.test(msg)) {
    return { code: 'TIMEOUT', message: TIMEOUT_MESSAGE };
  }

  if (/cancel|user_cancelled|canceled|12501|activity\s*result/i.test(msg)) {
    return { code: 'CANCELLED', message: 'Google sign-in was cancelled.' };
  }

  // Credential Manager rejects an app whose package/certificate is not
  // registered on the Android OAuth client (Google surfaces this as 10).
  if (/developer_error|developer\s*console|apiexception:\s*10\b|28444|signature|sha-?1|certificate|not\s*set\s*up\s*correctly/i.test(msg)) {
    return { code: 'DEVELOPER_ERROR', message: CONFIG_MESSAGE };
  }

  if (/play\s*services|service_missing|service_version_update_required|com\.google\.android\.gms/i.test(msg)) {
    return {
      code: 'PLAY_SERVICES',
      message:
        'Google Play services is missing or out of date on this phone. Update it from the Play Store, then try again.'
    };
  }

  if (/no\s*credential|no_credential|no\s*accounts|nocredential/i.test(msg)) {
    return {
      code: 'NO_CREDENTIAL',
      message:
        'No Google account is available on this device. Add a Google account in Android Settings, then try again.'
    };
  }

  if (/network|unreachable|offline|enotfound|unavailable/i.test(msg)) {
    return {
      code: 'NETWORK',
      message: 'Google could not be reached. Check the internet connection and try again.'
    };
  }

  // A plugin missing from the native side rejects with Capacitor's message.
  if (/not\s*implemented|unimplemented/i.test(msg)) {
    return { code: 'NOT_CONFIGURED', message: MISSING_PLUGIN_MESSAGE };
  }

  return { code: 'FAILED', message: `Native Google sign-in failed: ${msg}` };
}

/** Reads the "CODE: message" prefix the native plugin sends. */
export function nativeCodeOf(rawMessage: string): NativeGoogleErrorCode | null {
  const prefix = /^\s*(NOT_CONFIGURED|CANCELLED|NO_CREDENTIAL|PLAY_SERVICES|CONFIG|REAUTH|NETWORK|NO_ID_TOKEN|FAILED)\s*:/i.exec(
    String(rawMessage || '')
  );
  if (!prefix) return null;
  const value = prefix[1].toUpperCase();
  if (value === 'CONFIG') return 'DEVELOPER_ERROR';
  if (value === 'REAUTH') return 'REAUTH_REQUIRED';
  return value as NativeGoogleErrorCode;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Turns anything thrown by the native layer into a stable, explained error. */
function toSignInError(error: unknown, retried = false): NativeGoogleSignInError {
  if (error instanceof NativeGoogleSignInError) {
    return error.retried === retried ? error : new NativeGoogleSignInError(error.message, error.code, retried);
  }
  const raw = messageOf(error);
  const byPrefix = nativeCodeOf(raw);
  const byText = classifyNativeGoogleFailure(raw);
  const code = byPrefix ?? byText.code;
  if (code === 'REAUTH_REQUIRED') {
    return new NativeGoogleSignInError(retried ? RETRY_MESSAGE : byText.message, code, retried);
  }
  const text = byPrefix ? raw.replace(/^\s*[A-Z_]+\s*:\s*/, '') : byText.message;
  return new NativeGoogleSignInError(code === 'FAILED' ? `Native Google sign-in failed: ${text}` : byText.message, code, retried);
}

/**
 * Rejects when `work` has not settled within `ms`, and refuses to attach any
 * later result: the caller has already moved on, so a late native answer can
 * never complete a sign-in the user is no longer waiting for.
 */
export function withTimeout<T>(work: Promise<T>, ms: number, message = TIMEOUT_MESSAGE): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new NativeGoogleSignInError(message, 'TIMEOUT'));
    }, Math.max(0, ms));
    work.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

async function oneAttempt(bridge: NativeGoogleBridge, webClientId: string, timeoutMs: number): Promise<NativeGoogleUser> {
  diag('chooser-requested');
  const result = await withTimeout(bridge.signIn({ webClientId }), timeoutMs);
  if (!result || !result.idToken) {
    throw new NativeGoogleSignInError('Native Google sign-in returned no ID token.', 'NO_ID_TOKEN');
  }
  diag('id-token-received');
  return {
    idToken: result.idToken,
    email: result.email ?? null,
    name: result.name ?? null
  };
}

/**
 * Best effort, always bounded, never awaited for correctness: an unresponsive
 * Play services must not be able to block the retry or the error message.
 */
function clearSelection(bridge: NativeGoogleBridge, timeoutMs: number): Promise<void> {
  diag('clearing-cached-selection');
  return withTimeout(
    Promise.resolve()
      .then(() => bridge.clearCredentialState())
      .then(() => undefined),
    timeoutMs,
    'Clearing the cached Google selection timed out.'
  ).catch((error) => {
    diag('clear-selection-failed', messageOf(error).slice(0, 80));
  });
}

let inFlight: Promise<NativeGoogleUser> | null = null;

async function runSignIn(deps: NativeGoogleDeps): Promise<NativeGoogleUser> {
  const signInTimeoutMs = deps.signInTimeoutMs ?? DEFAULT_SIGN_IN_TIMEOUT_MS;
  const clearTimeoutMs = deps.clearTimeoutMs ?? DEFAULT_CLEAR_TIMEOUT_MS;

  if (!deps.isNative()) {
    throw new NativeGoogleSignInError('Native Google sign-in is only available on Android.', 'NOT_CONFIGURED');
  }
  const webClientId = deps.webClientId();
  if (!webClientId) {
    throw new NativeGoogleSignInError(
      'VITE_GOOGLE_WEB_CLIENT_ID is not set. Add the Firebase project Web OAuth client ID to enable native Google sign-in.',
      'NOT_CONFIGURED'
    );
  }
  diag('native-detected');

  let bridge: NativeGoogleBridge;
  try {
    bridge = await withTimeout(Promise.resolve(deps.loadBridge()), 10_000, 'The Google sign-in module did not load.');
  } catch (error) {
    // A missing/old native side reads as "not implemented" from Capacitor.
    const e = /not implemented|unimplemented/i.test(messageOf(error))
      ? new NativeGoogleSignInError(MISSING_PLUGIN_MESSAGE, 'NOT_CONFIGURED')
      : toSignInError(error);
    diag('bridge-failed', e.code);
    throw e;
  }

  try {
    const user = await oneAttempt(bridge, webClientId, signInTimeoutMs);
    diag('signed-in');
    return user;
  } catch (firstError) {
    const first = toSignInError(firstError);
    diag('attempt-failed', first.code);

    if (first.code === 'TIMEOUT') {
      // Discard whatever the chooser may still return.
      void clearSelection(bridge, clearTimeoutMs);
      throw first;
    }
    if (first.code !== 'REAUTH_REQUIRED') {
      throw first;
    }

    diag('recovering-after-reauth');
    await clearSelection(bridge, clearTimeoutMs);
    try {
      const user = await oneAttempt(bridge, webClientId, signInTimeoutMs);
      diag('signed-in-after-recovery');
      return user;
    } catch (secondError) {
      const second = toSignInError(secondError, true);
      diag('recovery-failed', second.code);
      if (second.code === 'TIMEOUT') void clearSelection(bridge, clearTimeoutMs);
      throw second.code === 'REAUTH_REQUIRED' || second.code === 'FAILED'
        ? new NativeGoogleSignInError(RETRY_MESSAGE, 'REAUTH_REQUIRED', true)
        : second;
    }
  }
}

/**
 * One sign-in attempt at a time: a second tap while the chooser is open gets
 * the SAME promise instead of opening a second account chooser.
 */
export function signInWithNativeGoogle(deps: NativeGoogleDeps = defaultDeps): Promise<NativeGoogleUser> {
  if (inFlight) {
    diag('already-in-progress');
    return inFlight;
  }
  const run = runSignIn(deps).finally(() => {
    if (inFlight === run) inFlight = null;
  });
  inFlight = run;
  return run;
}

/** Test-only: forget any in-flight attempt. */
export function resetNativeGoogleForTests(): void {
  inFlight = null;
}

export async function signOutNativeGoogle(): Promise<void> {
  if (!isNative()) return;
  try {
    await clearSelection(nativeGoogleBridge, DEFAULT_CLEAR_TIMEOUT_MS);
  } catch {
    // Firebase sign-out is the source of truth.
  }
}
