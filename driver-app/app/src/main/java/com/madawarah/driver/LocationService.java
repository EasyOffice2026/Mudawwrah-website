package com.madawarah.driver;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.SystemClock;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Reports where the phone is while a delivery is on its way, with the screen locked and the app in the background.
 *
 * Android only lets an app do that from a "foreground service": one with a notification the driver can see for as
 * long as it runs. It is started when the driver presses "Start delivery" in the app and stops when the server
 * says nothing is out any more (the driver pressed "Delivered", or the order desk took the order back), when the
 * page says stop, or by itself after a few hours as a last resort. Outside a delivery it does not run at all.
 *
 * It sends the latest position every few seconds to the address the driver page handed over, signed in as the
 * driver. Standing still it says "still here", so the customer's map does not show the driver as lost.
 */
public class LocationService extends Service {

    private static final String PREFS = "tracking";
    private static final String CHANNEL = "delivery";
    private static final int NOTIFICATION = 1;
    // A delivery never takes this long; a service still running then was forgotten and stops itself.
    private static final long LONGEST_MS = 6 * 60 * 60 * 1000L;
    // This many refusals in a row (signed out, account switched off) and it gives up; the page hands over a fresh
    // sign-in every few seconds while it is alive, so a merely expired one is replaced long before.
    private static final int MAX_REFUSALS = 24;

    // What the page reads through DriverBridge.status().
    static volatile boolean running;
    static volatile long lastSentAt;

    private HandlerThread thread;
    private Handler handler;
    private LocationManager locations;
    private PowerManager.WakeLock wakeLock;
    private volatile Location latest;
    private long startedAt;
    private int refusals;

    private final LocationListener listener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            // GPS is the better of the two; a network position only stands in when GPS has been quiet for a while.
            Location current = latest;
            boolean gps = LocationManager.GPS_PROVIDER.equals(location.getProvider());
            boolean currentIsFreshGps = current != null && LocationManager.GPS_PROVIDER.equals(current.getProvider())
                    && location.getElapsedRealtimeNanos() - current.getElapsedRealtimeNanos() < 20_000_000_000L;
            if (gps || !currentIsFreshGps) latest = location;
        }

        @Override
        public void onProviderEnabled(String provider) {
        }

        @Override
        public void onProviderDisabled(String provider) {
        }

        @Override
        public void onStatusChanged(String provider, int status, Bundle extras) {
        }
    };

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Where to report and as whom, as the driver page hands it over (again every few seconds, with a fresh token). */
    static void configure(Context context, String url, String token, String tenant, long everyMs) {
        prefs(context).edit()
                .putString("url", url)
                .putString("token", token)
                .putString("tenant", tenant)
                .putLong("everyMs", Math.max(3000, Math.min(60_000, everyMs)))
                .apply();
    }

    static void forget(Context context) {
        prefs(context).edit().clear().apply();
    }

    static boolean hasPermission(Context context) {
        return context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
                || context.checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    static boolean locationOn(Context context) {
        LocationManager manager = (LocationManager) context.getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) return false;
        return manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Android demands the notification within seconds of the start, whatever happens next. It refuses it when
        // the location permission has been taken away since: then there is nothing to do but stop.
        try {
            showNotification();
        } catch (RuntimeException e) {
            running = false;
            stopSelf();
            return START_NOT_STICKY;
        }
        SharedPreferences saved = prefs(this);
        if (saved.getString("url", null) == null || saved.getString("token", null) == null || !hasPermission(this)) {
            stopTracking();
            return START_NOT_STICKY;
        }
        if (running) return START_STICKY;
        running = true;
        startedAt = SystemClock.elapsedRealtime();
        refusals = 0;

        thread = new HandlerThread("delivery-location");
        thread.start();
        handler = new Handler(thread.getLooper());

        // Lets the sending go on with the screen off; released the moment the delivery ends.
        PowerManager power = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (power != null) {
            wakeLock = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "madawarah:delivery");
            wakeLock.acquire(LONGEST_MS);
        }

        locations = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        long every = saved.getLong("everyMs", 5000);
        try {
            for (String provider : new String[]{LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER}) {
                if (locations != null && locations.getAllProviders().contains(provider)) {
                    locations.requestLocationUpdates(provider, every, 0f, listener, thread.getLooper());
                    Location known = locations.getLastKnownLocation(provider);
                    // A position from before the delivery is only a starting point if it is recent.
                    if (known != null && latest == null && SystemClock.elapsedRealtimeNanos() - known.getElapsedRealtimeNanos() < 60_000_000_000L) {
                        latest = known;
                    }
                }
            }
        } catch (SecurityException e) {
            stopTracking();
            return START_NOT_STICKY;
        }
        handler.post(this::tick);
        // Sticky: if Android stops the service to free memory during a delivery, it starts it again by itself.
        return START_STICKY;
    }

    private void tick() {
        if (!running) return;
        SharedPreferences saved = prefs(this);
        long every = saved.getLong("everyMs", 5000);
        if (SystemClock.elapsedRealtime() - startedAt > LONGEST_MS) {
            stopTracking();
            return;
        }
        Location location = latest;
        if (location != null) {
            int answer = send(saved, location);
            if (answer == STOP) {
                stopTracking();
                return;
            }
            if (answer == REFUSED) {
                refusals += 1;
                if (refusals >= MAX_REFUSALS) {
                    stopTracking();
                    return;
                }
            } else if (answer == SENT) {
                refusals = 0;
                lastSentAt = System.currentTimeMillis();
            }
        }
        handler.postDelayed(this::tick, every);
    }

    private static final int SENT = 0;
    private static final int FAILED = 1;
    private static final int REFUSED = 2;
    private static final int STOP = 3;

    /** One report. No signal is not a reason to stop: the next one goes out a few seconds later. */
    private int send(SharedPreferences saved, Location location) {
        HttpURLConnection connection = null;
        try {
            JSONObject body = new JSONObject();
            body.put("lat", location.getLatitude());
            body.put("lng", location.getLongitude());
            if (location.hasAccuracy()) body.put("accuracy", location.getAccuracy());
            if (location.hasBearing()) body.put("heading", location.getBearing());
            if (location.hasSpeed()) body.put("speed", location.getSpeed());
            // Now, not when the fix was taken: standing still there is no newer fix, and the driver is still here.
            body.put("at", System.currentTimeMillis());
            byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);

            connection = (HttpURLConnection) new URL(saved.getString("url", "")).openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(8000);
            connection.setReadTimeout(8000);
            connection.setDoOutput(true);
            connection.setRequestProperty("Content-Type", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + saved.getString("token", ""));
            String tenant = saved.getString("tenant", "");
            if (!tenant.isEmpty()) connection.setRequestProperty("X-Tenant", tenant);
            try (OutputStream out = connection.getOutputStream()) {
                out.write(bytes);
            }
            int status = connection.getResponseCode();
            if (status == 401 || status == 403) return REFUSED;
            if (status != 200) return FAILED;
            try (InputStream in = connection.getInputStream()) {
                ByteArrayOutputStream text = new ByteArrayOutputStream();
                byte[] chunk = new byte[512];
                int read;
                while ((read = in.read(chunk)) > 0 && text.size() < 4096) text.write(chunk, 0, read);
                JSONObject answer = new JSONObject(text.toString("UTF-8"));
                // The server follows a driver only while an order is out for delivery.
                return answer.optBoolean("tracking", true) ? SENT : STOP;
            }
        } catch (Exception e) {
            return FAILED;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private void showNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, getString(R.string.channel_name), NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        Notification notification = builder
                .setSmallIcon(R.drawable.ic_stat_delivery)
                .setContentTitle(getString(R.string.notification_title))
                .setContentText(getString(R.string.notification_text))
                .setStyle(new Notification.BigTextStyle().bigText(getString(R.string.notification_text)))
                .setContentIntent(tap)
                .setOngoing(true)
                .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION, notification);
        }
    }

    /** The delivery is over: nothing more is read from the phone's location, and the notification goes. */
    private void stopTracking() {
        running = false;
        forget(this);
        stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        running = false;
        if (locations != null) locations.removeUpdates(listener);
        if (thread != null) thread.quitSafely();
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        super.onDestroy();
    }
}
