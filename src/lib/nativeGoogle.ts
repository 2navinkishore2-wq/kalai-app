/**
 * Native Android Google Sign-In bridge.
 *
 * Web/Windows use the Firebase JS SDK popup. Inside the Capacitor Android
 * WebView the popup flow is unreliable, so Android obtains a Google ID token
 * natively and exchanges it with the same Firebase JS SDK. Firebase federates
 * by Google account, so the resulting UID is identical across platforms.
 *
 * ERROR [16] "Account reauth failed"
 * This code comes from Google's Credential Manager while it is handing back an
 * account, i.e. BEFORE an ID token exists and long before Firebase is involved.
 * `@capgo/capacitor-social-login` 6.0.1 does not retry it and has no
 * `skipAuthOnlyAuthorizationAfterSignIn` option (that arrived in later plugin
 * majors), so the app performs exactly ONE bounded recovery itself: clear the
 * cached native selection, then ask again with authorized-account filtering
 * disabled. If that second attempt also fails we stop, explain the likeliest
 * configuration cause, and never loop.
 */
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

/** The subset of the plugin the app actually uses (mockable in tests). */
export interface NativeSocialLoginBridge {
  initialize(options: { google: { webClientId: string } }): Promise<unknown>;
  login(options: {
    provider: 'google';
    options: Record<string, unknown>;
  }): Promise<{
    provider: string;
    result?: {
      responseType?: string;
      idToken?: string | null;
      profile?: { email?: string | null; name?: string | null } | null;
    };
  }>;
  logout(options: { provider: 'google' }): Promise<unknown>;
}

export interface NativeGoogleDeps {
  isNative(): boolean;
  webClientId(): string;
  loadBridge(): Promise<NativeSocialLoginBridge>;
}

const defaultDeps: NativeGoogleDeps = {
  isNative,
  webClientId: nativeWebClientId,
  loadBridge: async () => {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    return SocialLogin as unknown as NativeSocialLoginBridge;
  }
};

const CONFIG_MESSAGE =
  'This APK’s Google sign-in configuration does not match the installed build. In Firebase → Project settings → Your apps, the Android app for package com.kalaidigital.billing must include this APK’s SHA-1 fingerprint, and the Web client ID must come from the same Firebase project.';

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

  if (/cancel|user_cancelled|12501|activity\s*result/i.test(msg)) {
    return { code: 'CANCELLED', message: 'Google sign-in was cancelled.' };
  }

  // Credential Manager rejects an app whose package/certificate is not
  // registered on the Android OAuth client (Google surfaces this as 10).
  if (/developer_error|apiexception:\s*10\b|28444|signature|sha-?1|certificate/i.test(msg)) {
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

  if (/network|timeout|timed\s*out|unreachable|offline|enotfound|unavailable/i.test(msg)) {
    return {
      code: 'NETWORK',
      message: 'Google could not be reached. Check the internet connection and try again.'
    };
  }

  return { code: 'FAILED', message: `Native Google sign-in failed: ${msg}` };
}

function isRecoverable(code: NativeGoogleErrorCode): boolean {
  return code === 'REAUTH_REQUIRED';
}

/**
 * One sign-in attempt. The recovery attempt deliberately disables
 * authorized-account filtering: Google's own guidance for [16] is that the
 * cached account-selection state, or a filter, is what fails, while a plain
 * account chooser usually succeeds.
 */
async function attempt(
  bridge: NativeSocialLoginBridge,
  options: Record<string, unknown>
): Promise<NativeGoogleUser> {
  const res = await bridge.login({ provider: 'google', options });
  if (res.provider !== 'google' || res.result?.responseType !== 'online') {
    throw new NativeGoogleSignInError('Native Google sign-in did not return an online credential.', 'NO_ID_TOKEN');
  }
  if (!res.result.idToken) {
    throw new NativeGoogleSignInError('Native Google sign-in returned no ID token.', 'NO_ID_TOKEN');
  }
  // Never log or include the token in an error path.
  return {
    idToken: res.result.idToken,
    email: res.result.profile?.email ?? null,
    name: res.result.profile?.name ?? null
  };
}

async function clearCachedSession(bridge: NativeSocialLoginBridge): Promise<void> {
  try {
    await bridge.logout({ provider: 'google' });
  } catch {
    // Best effort only: the retry is still worth attempting.
  }
}

export async function signInWithNativeGoogle(
  deps: NativeGoogleDeps = defaultDeps
): Promise<NativeGoogleUser> {
  const webClientId = deps.webClientId();
  if (!deps.isNative()) {
    throw new NativeGoogleSignInError('Native Google sign-in is only available on Android.', 'NOT_CONFIGURED');
  }
  if (!webClientId) {
    throw new NativeGoogleSignInError(
      'VITE_GOOGLE_WEB_CLIENT_ID is not set. Add the Firebase project Web OAuth client ID to enable native Google sign-in.',
      'NOT_CONFIGURED'
    );
  }

  let bridge: NativeSocialLoginBridge;
  try {
    bridge = await deps.loadBridge();
    await bridge.initialize({ google: { webClientId } });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const classified = classifyNativeGoogleFailure(raw);
    throw new NativeGoogleSignInError(classified.message, classified.code);
  }

  try {
    return await attempt(bridge, {});
  } catch (firstError) {
    const raw = firstError instanceof Error ? firstError.message : String(firstError);
    const classified =
      firstError instanceof NativeGoogleSignInError && firstError.code !== 'FAILED'
        ? { code: firstError.code, message: firstError.message }
        : classifyNativeGoogleFailure(raw);

    if (!isRecoverable(classified.code)) {
      throw new NativeGoogleSignInError(classified.message, classified.code);
    }

    // Exactly one recovery: clear the stale Credential Manager selection, then
    // ask again without authorized-account filtering.
    await clearCachedSession(bridge);
    try {
      return await attempt(bridge, { filterByAuthorizedAccounts: false, forcePrompt: true });
    } catch (secondError) {
      const secondRaw = secondError instanceof Error ? secondError.message : String(secondError);
      const second = classifyNativeGoogleFailure(secondRaw);
      const code: NativeGoogleErrorCode = second.code === 'FAILED' ? 'REAUTH_REQUIRED' : second.code;
      throw new NativeGoogleSignInError(
        code === 'REAUTH_REQUIRED'
          ? 'Google still refuses this account after one retry. Check that the OAuth consent screen is External, that this Google account is listed under Audience → Test users (or the app is published), and that the APK’s SHA-1 is registered in Firebase → Project settings → Your apps.'
          : second.message,
        code,
        true
      );
    }
  }
}

export async function signOutNativeGoogle(): Promise<void> {
  if (!isNative()) return;
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.logout({ provider: 'google' });
  } catch {
    // Firebase sign-out is the source of truth.
  }
}
