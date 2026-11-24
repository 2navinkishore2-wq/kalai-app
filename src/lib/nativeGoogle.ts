/**
 * Native Android Google Sign-In bridge.
 *
 * Web/Windows use the Firebase JS SDK popup. Inside the Capacitor Android
 * WebView the popup flow is unreliable, so Android obtains a Google ID token
 * natively and exchanges it with the same Firebase JS SDK. Firebase federates
 * by Google account, so the resulting UID is identical across platforms.
 */
import { isNative } from './platform';

export function nativeWebClientId(): string {
  return (import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '').trim();
}

export function isNativeGoogleConfigured(): boolean {
  return isNative() && !!nativeWebClientId();
}

export class NativeGoogleSignInError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'NativeGoogleSignInError';
    this.code = code;
  }
}

export interface NativeGoogleUser {
  idToken: string;
  email?: string | null;
  name?: string | null;
}

export async function signInWithNativeGoogle(): Promise<NativeGoogleUser> {
  const webClientId = nativeWebClientId();
  if (!isNative()) throw new NativeGoogleSignInError('Native Google sign-in is only available on Android.', 'NOT_CONFIGURED');
  if (!webClientId) {
    throw new NativeGoogleSignInError(
      'VITE_GOOGLE_WEB_CLIENT_ID is not set. Add the Firebase project Web OAuth client ID to enable native Google sign-in.',
      'NOT_CONFIGURED'
    );
  }
  try {
    const { SocialLogin } = await import('@capgo/capacitor-social-login');
    await SocialLogin.initialize({ google: { webClientId } });
    const res = await SocialLogin.login({ provider: 'google', options: {} });
    if (res.provider !== 'google' || res.result.responseType !== 'online') {
      throw new NativeGoogleSignInError('Native Google sign-in did not return an online credential.', 'NO_ID_TOKEN');
    }
    if (!res.result.idToken) throw new NativeGoogleSignInError('Native Google sign-in returned no ID token.', 'NO_ID_TOKEN');
    return { idToken: res.result.idToken, email: res.result.profile?.email ?? null, name: res.result.profile?.name ?? null };
  } catch (e) {
    if (e instanceof NativeGoogleSignInError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    if (/cancel/i.test(msg)) throw new NativeGoogleSignInError('Google sign-in was cancelled.', 'CANCELLED');
    // Credential Manager rejects an app whose signing certificate is not
    // registered on the Android OAuth client (Google surfaces this as 10).
    if (/developer_error|\b10\b|28444|apiexception: 10/i.test(msg)) {
      throw new NativeGoogleSignInError(
        'This APK\u2019s signing certificate is not registered for Google sign-in. Add the app\u2019s SHA-1 fingerprint to the Android app in Firebase (Project settings \u2192 Your apps).',
        'DEVELOPER_ERROR'
      );
    }
    if (/no credential|no_credential|no accounts/i.test(msg)) {
      throw new NativeGoogleSignInError(
        'No Google account is available on this device. Add a Google account in Android Settings, then try again.',
        'NO_CREDENTIAL'
      );
    }
    throw new NativeGoogleSignInError(`Native Google sign-in failed: ${msg}`, 'FAILED');
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
