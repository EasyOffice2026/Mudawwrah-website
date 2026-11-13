package com.madawarah.driver;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * The driver's page (the website's /r/<restaurant>/driver) in a window of its own, with the phone's location
 * handed to it through DriverBridge, so a delivery keeps being followed with the screen locked: a web page in
 * Chrome stops reporting the moment the phone locks.
 *
 * The driver signs in once with their phone number and password; the page remembers them from then on.
 */
public class MainActivity extends Activity {

    static final String START_URL = "https://www.madawarah.com/r/mdawra/driver";

    private WebView web;
    private DriverBridge bridge;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        // The page keeps the driver's sign-in in the browser's storage.
        settings.setDomStorageEnabled(true);
        // The "new delivery" sound plays without a tap first.
        settings.setMediaPlaybackRequiresUserGesture(false);
        web.setWebViewClient(new PageClient());
        // Without one, the page's "Mark as delivered?" question would never show and always answer no.
        web.setWebChromeClient(new WebChromeClient());

        bridge = new DriverBridge(this);
        bridge.pageUrl = START_URL;
        web.addJavascriptInterface(bridge, "DriverApp");
        setContentView(web);
        web.loadUrl(START_URL);
    }

    private class PageClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            // The restaurant's own pages open here.
            if (DriverBridge.isTrusted(uri.toString())) return false;
            // "Call customer" and "Open in maps" go to the phone's own dialler and maps app.
            try {
                Intent out = "tel".equals(uri.getScheme()) ? new Intent(Intent.ACTION_DIAL, uri) : new Intent(Intent.ACTION_VIEW, uri);
                startActivity(out);
            } catch (ActivityNotFoundException ignored) {
                // Nothing on this phone opens it.
            }
            return true;
        }

        @Override
        public void onPageStarted(WebView view, String url, Bitmap favicon) {
            bridge.pageUrl = url;
        }

        @Override
        public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
            // The website moves between its pages without loading a new one; this hears those moves too.
            bridge.pageUrl = url;
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == DriverBridge.ASK_LOCATION) bridge.resume();
    }

    @Override
    protected void onResume() {
        super.onResume();
        // Back from the settings screen, or from the maps app: a delivery waiting on a permission starts now.
        if (bridge != null) bridge.resume();
    }

    @Override
    public void onBackPressed() {
        // Leaving with Back keeps the app (and a delivery in progress) alive in the background.
        moveTaskToBack(true);
    }

    @Override
    protected void onDestroy() {
        web.destroy();
        super.onDestroy();
    }
}
