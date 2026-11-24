import { describe, expect, it, vi, type Mock } from 'vitest';
import {
  NativeGoogleSignInError,
  classifyNativeGoogleFailure,
  signInWithNativeGoogle,
  type NativeGoogleDeps,
  type NativeSocialLoginBridge
} from './nativeGoogle';

const ok = (idToken = 'id-token-value') => ({
  provider: 'google',
  result: { responseType: 'online', idToken, profile: { email: 'owner@kalai.test', name: 'Owner' } }
});

function makeDeps(
  login: Mock,
  extra: { logout?: Mock; initialize?: Mock } = {}
): NativeGoogleDeps & { login: Mock } {
  return {
    isNative: () => true,
    webClientId: () => 'web-client.apps.googleusercontent.com',
    loadBridge: async () =>
      ({
        initialize: extra.initialize || (async () => undefined),
        login,
        logout: extra.logout || (async () => undefined)
      }) as NativeSocialLoginBridge,
    login
  };
}

describe('classifyNativeGoogleFailure', () => {
  it('recognises the Credential Manager [16] reauth failure before other rules', () => {
    const result = classifyNativeGoogleFailure('Google Sign-In failed: [16] Account reauth failed');
    expect(result.code).toBe('REAUTH_REQUIRED');
    expect(result.message).toMatch(/retry|again/i);
  });

  it('recognises certificate/package registration problems as developer errors', () => {
    expect(classifyNativeGoogleFailure('[28444] Developer console is not set up correctly').code).toBe('DEVELOPER_ERROR');
    expect(classifyNativeGoogleFailure('ApiException: 10').code).toBe('DEVELOPER_ERROR');
  });

  it('recognises cancellation, missing accounts, Play services and network failures', () => {
    expect(classifyNativeGoogleFailure('USER_CANCELLED').code).toBe('CANCELLED');
    expect(classifyNativeGoogleFailure('NoCredentialException: No credentials available').code).toBe('NO_CREDENTIAL');
    expect(classifyNativeGoogleFailure('SERVICE_MISSING: Google Play services not available').code).toBe('PLAY_SERVICES');
    expect(classifyNativeGoogleFailure('Network error').code).toBe('NETWORK');
  });

  it('never mistakes the [16] status for the developer_error status 10', () => {
    expect(classifyNativeGoogleFailure('[16] Account reauth failed').code).not.toBe('DEVELOPER_ERROR');
  });
});

describe('signInWithNativeGoogle', () => {
  it('returns the Google profile on a normal sign-in', async () => {
    const d = makeDeps(vi.fn().mockResolvedValue(ok()));
    await expect(signInWithNativeGoogle(d)).resolves.toEqual({
      idToken: 'id-token-value',
      email: 'owner@kalai.test',
      name: 'Owner'
    });
    expect(d.login).toHaveBeenCalledTimes(1);
  });

  it('recovers once from [16] by clearing state and disabling account filtering', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const login = vi
      .fn()
      .mockRejectedValueOnce(new Error('Google Sign-In failed: [16] Account reauth failed'))
      .mockResolvedValueOnce(ok());
    const d = makeDeps(login, { logout });

    await expect(signInWithNativeGoogle(d)).resolves.toMatchObject({ idToken: 'id-token-value' });
    expect(login).toHaveBeenCalledTimes(2);
    expect(logout).toHaveBeenCalledTimes(1);
    expect((login.mock.calls[1][0] as { options: Record<string, unknown> }).options).toMatchObject({
      filterByAuthorizedAccounts: false
    });
  });

  it('stops after one recovery and never loops', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Google Sign-In failed: [16] Account reauth failed'));
    const d = makeDeps(login);

    const error = await signInWithNativeGoogle(d).catch((e: NativeGoogleSignInError) => e);
    expect(error).toBeInstanceOf(NativeGoogleSignInError);
    expect((error as NativeGoogleSignInError).code).toBe('REAUTH_REQUIRED');
    expect((error as NativeGoogleSignInError).retried).toBe(true);
    expect(login).toHaveBeenCalledTimes(2);
  });

  it('does not retry a cancellation', async () => {
    const login = vi.fn().mockRejectedValue(new Error('USER_CANCELLED'));
    const d = makeDeps(login);
    await expect(signInWithNativeGoogle(d)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('rejects a build without the web client ID instead of opening a broken flow', async () => {
    const d = makeDeps(vi.fn());
    d.webClientId = () => '';
    await expect(signInWithNativeGoogle(d)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('does not put the ID token in an error message', async () => {
    const login = vi.fn().mockRejectedValue(new Error('something odd happened'));
    const d = makeDeps(login);
    const error = (await signInWithNativeGoogle(d).catch((e: Error) => e)) as Error;
    expect(error.message).not.toContain('id-token-value');
  });
});
