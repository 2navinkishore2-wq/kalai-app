import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  NativeGoogleSignInError,
  classifyNativeGoogleFailure,
  defaultDeps,
  nativeCodeOf,
  resetNativeGoogleForTests,
  signInWithNativeGoogle,
  type NativeGoogleBridge,
  type NativeGoogleDeps
} from './nativeGoogle';

const ID_TOKEN = 'id-token-value';

const ok = (idToken = ID_TOKEN) => ({
  idToken,
  email: 'owner@kalai.test',
  name: 'Owner'
});

type Deps = NativeGoogleDeps & { signIn: Mock; clear: Mock };

function makeDeps(signIn: Mock, extra: { clear?: Mock; signInTimeoutMs?: number; clearTimeoutMs?: number } = {}): Deps {
  const clear = extra.clear || vi.fn().mockResolvedValue(undefined);
  return {
    isNative: () => true,
    webClientId: () => 'web-client.apps.googleusercontent.com',
    loadBridge: async () =>
      ({
        signIn,
        clearCredentialState: clear
      }) as NativeGoogleBridge,
    signInTimeoutMs: extra.signInTimeoutMs ?? 2000,
    clearTimeoutMs: extra.clearTimeoutMs ?? 2000,
    signIn,
    clear
  };
}

beforeEach(() => {
  resetNativeGoogleForTests();
});

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

  it('treats a silent native timeout as its own, explained state', () => {
    expect(classifyNativeGoogleFailure('Google did not answer in time').code).toBe('TIMEOUT');
  });
});

describe('default bridge', () => {
  /**
   * The hotfix1 bug: Capacitor's plugin proxy answers every property with a
   * function, so it is thenable. Awaiting it made the engine wait for a
   * `then()` native call that never settles, and the user saw "The Google
   * sign-in module did not load." after the 10 s bound.
   */
  it('hands over a plain bridge, never the thenable Capacitor proxy', async () => {
    const bridge = await defaultDeps.loadBridge();
    expect(typeof bridge).toBe('object');
    expect((bridge as unknown as { then?: unknown }).then).toBeUndefined();
    expect(typeof bridge.signIn).toBe('function');
    expect(typeof bridge.clearCredentialState).toBe('function');
  });
});

describe('nativeCodeOf', () => {
  it('reads the stable codes the native plugin sends', () => {
    expect(nativeCodeOf('REAUTH: [16] Account reauth failed')).toBe('REAUTH_REQUIRED');
    expect(nativeCodeOf('CONFIG: Developer console is not set up correctly')).toBe('DEVELOPER_ERROR');
    expect(nativeCodeOf('CANCELLED: user cancelled')).toBe('CANCELLED');
    expect(nativeCodeOf('NO_CREDENTIAL: none')).toBe('NO_CREDENTIAL');
    expect(nativeCodeOf('PLAY_SERVICES: missing')).toBe('PLAY_SERVICES');
    expect(nativeCodeOf('FAILED: boom')).toBe('FAILED');
  });

  it('returns null for messages that carry no code', () => {
    expect(nativeCodeOf('something odd happened')).toBeNull();
  });
});

describe('signInWithNativeGoogle', () => {
  it('returns the Google profile on a normal sign-in', async () => {
    const d = makeDeps(vi.fn().mockResolvedValue(ok()));
    await expect(signInWithNativeGoogle(d)).resolves.toEqual({
      idToken: ID_TOKEN,
      email: 'owner@kalai.test',
      name: 'Owner'
    });
    expect(d.signIn).toHaveBeenCalledTimes(1);
    expect(d.clear).not.toHaveBeenCalled();
  });

  it('passes only the documented web client id to the native plugin', async () => {
    const d = makeDeps(vi.fn().mockResolvedValue(ok()));
    await signInWithNativeGoogle(d);
    expect(d.signIn).toHaveBeenCalledWith({ webClientId: 'web-client.apps.googleusercontent.com' });
  });

  it('recovers once from [16] by clearing the cached selection, then asks again', async () => {
    const signIn = vi
      .fn()
      .mockRejectedValueOnce(new Error('REAUTH: [16] Account reauth failed'))
      .mockResolvedValueOnce(ok());
    const d = makeDeps(signIn);

    await expect(signInWithNativeGoogle(d)).resolves.toMatchObject({ idToken: ID_TOKEN });
    expect(signIn).toHaveBeenCalledTimes(2);
    expect(d.clear).toHaveBeenCalledTimes(1);
  });

  it('stops after one recovery and never loops', async () => {
    const signIn = vi.fn().mockRejectedValue(new Error('REAUTH: [16] Account reauth failed'));
    const d = makeDeps(signIn);

    const error = (await signInWithNativeGoogle(d).catch((e: NativeGoogleSignInError) => e)) as NativeGoogleSignInError;
    expect(error).toBeInstanceOf(NativeGoogleSignInError);
    expect(error.code).toBe('REAUTH_REQUIRED');
    expect(error.retried).toBe(true);
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it('does not retry a cancellation', async () => {
    const d = makeDeps(vi.fn().mockRejectedValue(new Error('CANCELLED: user cancelled')));
    await expect(signInWithNativeGoogle(d)).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(d.signIn).toHaveBeenCalledTimes(1);
  });

  it('explains a missing Play services instead of retrying', async () => {
    const d = makeDeps(vi.fn().mockRejectedValue(new Error('PLAY_SERVICES: Google Play services missing')));
    const error = (await signInWithNativeGoogle(d).catch((e: NativeGoogleSignInError) => e)) as NativeGoogleSignInError;
    expect(error.code).toBe('PLAY_SERVICES');
    expect(d.signIn).toHaveBeenCalledTimes(1);
  });

  it('rejects a build without the web client ID instead of opening a broken flow', async () => {
    const d = makeDeps(vi.fn());
    d.webClientId = () => '';
    await expect(signInWithNativeGoogle(d)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    expect(d.signIn).not.toHaveBeenCalled();
  });

  it('explains a plugin that is missing when the first call is made', async () => {
    const d = makeDeps(
      vi.fn().mockRejectedValue(new Error('"KalaiGoogleSignIn.signIn()" is not implemented on android'))
    );
    const error = (await signInWithNativeGoogle(d).catch((e: NativeGoogleSignInError) => e)) as NativeGoogleSignInError;
    expect(error.code).toBe('NOT_CONFIGURED');
    expect(error.message).toMatch(/latest KALAI DIGITAL build/i);
  });

  it('rejects on the web instead of calling a plugin that is not there', async () => {
    const d = makeDeps(vi.fn());
    d.isNative = () => false;
    await expect(signInWithNativeGoogle(d)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('explains an APK without the native plugin', async () => {
    const d = makeDeps(vi.fn());
    d.loadBridge = async () => {
      throw new Error('"KalaiGoogleSignIn" plugin is not implemented on android');
    };
    await expect(signInWithNativeGoogle(d)).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('rejects a credential that carries no ID token', async () => {
    const d = makeDeps(vi.fn().mockResolvedValue({ idToken: null }));
    await expect(signInWithNativeGoogle(d)).rejects.toMatchObject({ code: 'NO_ID_TOKEN' });
  });

  /**
   * The reported bug: the native promise never settled, so the button spun
   * forever. The attempt must always end, and the abandoned selection must be
   * discarded so it cannot complete a sign-in later.
   */
  it('never hangs: a silent native call ends in a TIMEOUT error', async () => {
    const signIn = vi.fn().mockImplementation(() => new Promise(() => undefined));
    const d = makeDeps(signIn, { signInTimeoutMs: 25 });

    const started = Date.now();
    const error = (await signInWithNativeGoogle(d).catch((e: NativeGoogleSignInError) => e)) as NativeGoogleSignInError;
    expect(error.code).toBe('TIMEOUT');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(d.clear).toHaveBeenCalledTimes(1);
  });

  it('does not let a late native answer resolve an abandoned attempt', async () => {
    let release: (value: unknown) => void = () => undefined;
    const signIn = vi.fn().mockImplementation(() => new Promise((resolve) => (release = resolve)));
    const d = makeDeps(signIn, { signInTimeoutMs: 25 });

    const promise = signInWithNativeGoogle(d);
    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
    release(ok());
    await promise.catch(() => undefined);
    await expect(promise).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('does not let a hanging clear-selection call block the recovery', async () => {
    const signIn = vi.fn().mockRejectedValueOnce(new Error('REAUTH: [16] Account reauth failed')).mockResolvedValueOnce(ok());
    const clear = vi.fn().mockImplementation(() => new Promise(() => undefined));
    const d = makeDeps(signIn, { clear, clearTimeoutMs: 25 });

    const started = Date.now();
    await expect(signInWithNativeGoogle(d)).resolves.toMatchObject({ idToken: ID_TOKEN });
    expect(Date.now() - started).toBeLessThan(2000);
    expect(signIn).toHaveBeenCalledTimes(2);
  });

  it('opens only one account chooser even if the button is tapped twice', async () => {
    let release: (value: unknown) => void = () => undefined;
    const pending = new Promise<unknown>((resolve) => {
      release = resolve;
    });
    const signIn = vi.fn().mockImplementation(() => pending);
    const d = makeDeps(signIn);

    const first = signInWithNativeGoogle(d);
    const second = signInWithNativeGoogle(d);
    expect(second).toBe(first);
    await Promise.resolve();
    release(ok());
    await expect(first).resolves.toMatchObject({ idToken: ID_TOKEN });
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it('does not put the ID token in an error message', async () => {
    const d = makeDeps(vi.fn().mockRejectedValue(new Error('something odd happened')));
    const error = (await signInWithNativeGoogle(d).catch((e: Error) => e)) as Error;
    expect(error.message).not.toContain(ID_TOKEN);
  });
});
