package com.madawarah.printer;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The branch's print station (the website page /r/<restaurant>/print/<branch>#<key>) in a window of its own, with
 * the Sunmi printer handed to the page (PrinterBridge), so tickets print straight on the built-in printer: no
 * Android print preview, no pop-up.
 *
 * The first time, the app opens the website's Printing page: the branch signs in and taps "Open" next to its
 * station. The app remembers that station and opens it straight away from then on, also after a restart.
 */
public class MainActivity extends Activity {

    static final String START_URL = "https://www.madawarah.com/r/mdawra/admin/printing";
    private static final String PREFS = "station";
    private static final String KEY_URL = "url";
    private static final String KEY_AUTOSTART_ASKED = "autostartAsked";

    private WebView web;
    private PrinterBridge printer;

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // A station that goes dark stops printing.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new StationClient());

        printer = new PrinterBridge(this, web);
        web.addJavascriptInterface(printer, "SunmiPrinter");
        setContentView(web);

        String saved = prefs(this).getString(KEY_URL, null);
        web.loadUrl(saved != null ? saved : START_URL);
        askForAutostart();
    }

    /** The page the app opens: the remembered station, or the Printing page to choose one. */
    void forgetStation() {
        prefs(this).edit().remove(KEY_URL).apply();
        web.loadUrl(START_URL);
    }

    private class StationClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            // The restaurant's own pages open here; anything else is not this app's business.
            return !PrinterBridge.isTrusted(request.getUrl().toString());
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            String current = view.getUrl();
            if (current != null && PrinterBridge.isTrusted(current) && isStation(current)) {
                prefs(MainActivity.this).edit().putString(KEY_URL, current).apply();
            }
        }
    }

    /** A station link: /r/<restaurant>/print/<branch> with its key after the #. */
    static boolean isStation(String url) {
        Uri uri = Uri.parse(url);
        String path = uri.getPath();
        return path != null && path.matches("/r/[^/]+/print/[^/]+/?") && uri.getFragment() != null && !uri.getFragment().isEmpty();
    }

    /**
     * Android 10 and later only let an app open itself after a restart when it may display over other apps. Asked
     * once; the branch can say later, and printing works either way while the app is open.
     */
    private void askForAutostart() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || Settings.canDrawOverlays(this)) return;
        if (prefs(this).getBoolean(KEY_AUTOSTART_ASKED, false)) return;
        prefs(this).edit().putBoolean(KEY_AUTOSTART_ASKED, true).apply();
        new AlertDialog.Builder(this)
                .setTitle(R.string.autostart_title)
                .setMessage(R.string.autostart_message)
                .setPositiveButton(R.string.autostart_allow, (dialog, which) -> startActivity(
                        new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName()))))
                .setNegativeButton(R.string.autostart_later, null)
                .show();
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        printer.close();
        web.destroy();
        super.onDestroy();
    }
}
