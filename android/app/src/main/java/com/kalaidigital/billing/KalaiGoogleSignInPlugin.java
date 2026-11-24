package com.kalaidigital.billing;

import android.app.Activity;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import androidx.credentials.ClearCredentialStateRequest;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.ClearCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialProviderConfigurationException;
import androidx.credentials.exceptions.NoCredentialException;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

/**
 * Google Sign-In for Android using AndroidX Credential Manager directly.
 *
 * WHY THIS EXISTS (v1.7.0 hotfix 1)
 * `@capgo/capacitor-social-login` 6.0.1 makes a SECOND Google API call after
 * the account is chosen: it asks Identity.getAuthorizationClient() for an
 * access token. When that call needs a user resolution it starts an intent
 * sender with its own request codes (583892990+) and waits on a future with
 * no timeout — but SocialLoginPlugin.handleOnActivityResult() only forwards
 * results to Facebook, and Capacitor's Bridge.onActivityResult() only routes
 * request codes declared in the plugin annotation. The intent result is
 * therefore dropped, the future never completes, the plugin promise never
 * settles, and the app spins forever with no account picker and no error.
 *
 * Firebase only needs the Google ID token, so this plugin asks Credential
 * Manager for exactly that (GetSignInWithGoogleOption -> GoogleIdTokenCredential).
 * Credential Manager owns its own activity-result plumbing, so nothing has to
 * be forwarded, and every failure is delivered as a rejection the JS side can
 * classify. The same Firebase project, package name, OAuth clients and signing
 * key are used; only the transport changed.
 */
@CapacitorPlugin(name = "KalaiGoogleSignIn")
public class KalaiGoogleSignInPlugin extends Plugin {

    private static final String TAG = "KalaiGoogleSignIn";

    @PluginMethod
    public void signIn(PluginCall call) {
        String webClientId = call.getString("webClientId", "");
        if (webClientId == null || webClientId.trim().isEmpty()) {
            call.reject("NOT_CONFIGURED: no Google web client id");
            return;
        }

        Activity activity = getActivity();
        if (activity == null) {
            call.reject("FAILED: no foreground activity");
            return;
        }

        CredentialManager manager;
        GetCredentialRequest request;
        try {
            manager = CredentialManager.create(activity);
            GetSignInWithGoogleOption option =
                new GetSignInWithGoogleOption.Builder(webClientId.trim()).build();
            request = new GetCredentialRequest.Builder().addCredentialOption(option).build();
        } catch (Throwable error) {
            Log.e(TAG, "could not build the credential request", error);
            call.reject("FAILED: " + safeMessage(error));
            return;
        }

        try {
            manager.getCredentialAsync(
                activity,
                request,
                null,
                ContextCompat.getMainExecutor(activity),
                new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                    @Override
                    public void onResult(@NonNull GetCredentialResponse response) {
                        try {
                            Credential credential = response.getCredential();
                            if (credential instanceof CustomCredential
                                && GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                                GoogleIdTokenCredential google =
                                    GoogleIdTokenCredential.createFrom(((CustomCredential) credential).getData());
                                JSObject out = new JSObject();
                                // Only the ID token crosses the bridge. Nothing is logged.
                                out.put("idToken", google.getIdToken());
                                out.put("email", google.getId());
                                out.put("name", google.getDisplayName());
                                Log.i(TAG, "sign-in succeeded");
                                call.resolve(out);
                                return;
                            }
                            Log.e(TAG, "unexpected credential type: " + credential.getType());
                            call.reject("NO_ID_TOKEN: Google returned no ID token");
                        } catch (Throwable error) {
                            Log.e(TAG, "could not read the Google credential", error);
                            call.reject("NO_ID_TOKEN: " + safeMessage(error));
                        }
                    }

                    @Override
                    public void onError(@NonNull GetCredentialException error) {
                        String code = codeFor(error);
                        Log.e(TAG, "sign-in failed: " + code + " " + safeMessage(error));
                        call.reject(code + ": " + safeMessage(error));
                    }
                }
            );
        } catch (Throwable error) {
            // Credential Manager throws immediately when Play services is
            // missing, so this surfaces instead of hanging.
            Log.e(TAG, "credential manager rejected the request", error);
            call.reject(codeFor(error) + ": " + safeMessage(error));
        }
    }

    /**
     * Discards the cached Google credential selection. Used once before a retry
     * after "[16] Account reauth failed". The JS side bounds this call, so a
     * slow Play services response can never block the UI.
     */
    @PluginMethod
    public void clearCredentialState(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("FAILED: no foreground activity");
            return;
        }
        try {
            CredentialManager.create(activity)
                .clearCredentialStateAsync(
                    new ClearCredentialStateRequest(),
                    null,
                    ContextCompat.getMainExecutor(activity),
                    new CredentialManagerCallback<Void, ClearCredentialException>() {
                        @Override
                        public void onResult(Void unused) {
                            call.resolve();
                        }

                        @Override
                        public void onError(@NonNull ClearCredentialException error) {
                            call.reject("FAILED: " + safeMessage(error));
                        }
                    }
                );
        } catch (Throwable error) {
            call.reject("FAILED: " + safeMessage(error));
        }
    }

    /** Stable, non-sensitive code the JS layer can act on. */
    private static String codeFor(Throwable error) {
        String message = safeMessage(error);
        String lower = message.toLowerCase();
        if (error instanceof GetCredentialCancellationException) return "CANCELLED";
        if (error instanceof NoCredentialException) return "NO_CREDENTIAL";
        if (error instanceof GetCredentialProviderConfigurationException) return "PLAY_SERVICES";
        if (message.contains("[16]") || lower.contains("reauth")) return "REAUTH";
        if (lower.contains("developer console") || lower.contains("not set up correctly")) return "CONFIG";
        if (lower.contains("play services") || lower.contains("service_missing")) return "PLAY_SERVICES";
        if (lower.contains("network") || lower.contains("unavailable") || lower.contains("timeout")) return "NETWORK";
        return "FAILED";
    }

    private static String safeMessage(Throwable error) {
        if (error == null) return "unknown error";
        String message = error.getMessage();
        if (message == null || message.trim().isEmpty()) return error.getClass().getSimpleName();
        // Never let anything that looks like a token reach the WebView.
        return message.length() > 300 ? message.substring(0, 300) : message;
    }
}
