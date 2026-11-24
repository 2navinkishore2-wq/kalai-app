package com.kalaidigital.billing;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // CRITICAL: must run BEFORE super.onCreate(). BridgeActivity.onCreate()
        // builds the bridge from the plugin builder, so a plugin registered
        // after super.onCreate() never reaches the live bridge and the JS side
        // fails with "'Download' plugin is not implemented on android".
        // Saves invoice PDF/JPG files directly to the device Downloads folder
        // instead of opening the share sheet (Quick Share).
        registerPlugin(DownloadPlugin.class);
        // Google Sign-In through AndroidX Credential Manager. Returns only the
        // Google ID token, which Firebase exchanges for the same account.
        registerPlugin(KalaiGoogleSignInPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
