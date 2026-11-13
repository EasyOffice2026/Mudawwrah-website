package com.madawarah.driver;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/**
 * What the driver page can ask of the phone, offered to it as `window.DriverApp`.
 *
 * The page (frontend/src/lib/useDriverLocation.js) calls startTracking when an order goes out for delivery, handing
 * over where to report and the driver's sign-in, and stopTracking when nothing is out any more. The reporting
 * itself is LocationService's, which carries on with the screen locked.
 *
 * Only the restaurant's own website can use it, and positions are only ever sent to the restaurant's own server.
 */
public class DriverBridge {

    static final String[] TRUSTED_SITES = {"madawarah.com", "www.madawarah.com", "mudawarah-staging.vercel.app"};
    private static final String[] TRUSTED_SERVERS = {"mudawwrah-website.onrender.com", "mudawwrah-staging.onrender.com"};
    static final int ASK_LOCATION = 1;

    private final Activity activity;
    private final Handler main = new Handler(Looper.getMainLooper());
    // The page the WebView is showing, kept by MainActivity: the bridge runs on another thread and may not ask it.
    volatile String pageUrl;
    private volatile boolean asked;

    DriverBridge(Activity activity) {
        this.activity = activity;
    }

    private static boolean hostIn(String url, String[] hosts) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme())) return false;
        for (String host : hosts) {
            if (host.equals(uri.getHost())) return true;
        }
        return false;
    }

    static boolean isTrusted(String url) {
        return hostIn(url, TRUSTED_SITES);
    }

    /**
     * Begin (or carry on) reporting the phone's position. `json` is {url, token, tenant, everyMs}. Called again every
     * few seconds while a delivery is out: it renews the sign-in and restarts the reporting if Android stopped it.
     */
    @JavascriptInterface
    public void startTracking(String json) {
        if (!isTrusted(pageUrl)) return;
        try {
            JSONObject target = new JSONObject(json);
            String url = target.getString("url");
            String token = target.getString("token");
            if (token.isEmpty() || !(hostIn(url, TRUSTED_SERVERS) || hostIn(url, TRUSTED_SITES))) return;
            LocationService.configure(activity, url, token, target.optString("tenant", ""), target.optLong("everyMs", 5000));
        } catch (Exception e) {
            return;
        }
        main.post(() -> {
            if (!LocationService.hasPermission(activity)) {
                // Asked once by itself; after a "Don't allow" the page shows a button instead of nagging.
                if (!asked) askPermission();
                return;
            }
            startService();
        });
    }

    @JavascriptInterface
    public void stopTracking() {
        LocationService.forget(activity);
        main.post(() -> activity.stopService(new Intent(activity, LocationService.class)));
    }

    /** "tracking", "starting", "no-permission", "location-off" or "idle". */
    @JavascriptInterface
    public String status() {
        if (!LocationService.hasPermission(activity)) return "no-permission";
        if (!LocationService.locationOn(activity)) return "location-off";
        if (!LocationService.running) return LocationService.prefs(activity).getString("url", null) != null ? "starting" : "idle";
        return "tracking";
    }

    /** Asks for the location permission, or opens the phone's settings where it (or the location switch) is. */
    @JavascriptInterface
    public void openSettings() {
        main.post(() -> {
            if (!LocationService.hasPermission(activity)) {
                // Android shows its own question only so many times; after that the driver changes it in settings.
                if (!asked || activity.shouldShowRequestPermissionRationale(Manifest.permission.ACCESS_FINE_LOCATION)) {
                    askPermission();
                } else {
                    activity.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.getPackageName())));
                }
            } else {
                activity.startActivity(new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS));
            }
        });
    }

    private void askPermission() {
        asked = true;
        String[] wanted = Build.VERSION.SDK_INT >= 33
                ? new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.POST_NOTIFICATIONS}
                : new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION};
        activity.requestPermissions(wanted, ASK_LOCATION);
    }

    /** The driver answered the permission question, or came back to the app: a delivery waiting on it starts now. */
    void resume() {
        if (!LocationService.hasPermission(activity)) return;
        if (LocationService.prefs(activity).getString("url", null) == null) return;
        startService();
    }

    private void startService() {
        if (LocationService.running) return;
        try {
            Intent service = new Intent(activity, LocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) activity.startForegroundService(service);
            else activity.startService(service);
        } catch (RuntimeException ignored) {
            // Android only starts it while the app is on screen; the next call, with the app open, will.
        }
    }
}
