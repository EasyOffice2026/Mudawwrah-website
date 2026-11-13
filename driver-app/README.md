# Madawarah Driver (Android app)

A small Android app for the restaurant's own delivery drivers. It shows the website's driver page
(`/r/mdawra/driver`) and keeps reporting the phone's position during a delivery with the screen locked, which a web
page in Chrome can't do: Chrome stops reporting the moment the phone locks.

The customer follows the delivery on the website's tracking page (`/r/mdawra/track/<order>`).

## How it works

- `MainActivity` shows the driver page in a WebView. The driver signs in once with their phone number and
  password. "Call customer" opens the phone's dialler and "Open in maps" opens its maps app.
- `DriverBridge` gives the page `window.DriverApp`. When an order goes out for delivery, the page
  (`frontend/src/lib/useDriverLocation.js`) calls `startTracking` with the server's address and the driver's
  sign-in; when nothing is out any more it calls `stopTracking`.
- `LocationService` does the reporting. It's an Android foreground service, so a notification ("Delivery in
  progress") shows for as long as it runs. Every 5 seconds it sends the latest GPS position to
  `POST /api/driver/location`. It stops when the server answers that nothing is out for delivery, when the page
  says stop, or by itself after 6 hours.
- Only pages from `madawarah.com`, `www.madawarah.com` and the staging site can use `window.DriverApp`, and
  positions are only sent to the restaurant's own servers.

The server only keeps a position while the driver has an order out for delivery, and only the latest one, in
memory. Nothing is saved to the database, so there's no history of where a driver has been.

## Permissions the driver is asked for

- **Location**: asked the first time the driver presses **Start delivery**. "While using the app" is enough;
  "Allow all the time" isn't needed, because the delivery is started with the app open.
- **Notifications** (Android 13 and later): for the "Delivery in progress" notification.

The app has no Google Play services in it. It uses the phone's own GPS and network location.

## Building

You need JDK 17 and the Android SDK (platform 34, build-tools 34.0.0), with `JAVA_HOME` and `ANDROID_HOME` set.
Then, in Git Bash:

```
cd driver-app
./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../frontend/public/downloads/madawarah-driver.apk
```

The website serves it at `/downloads/madawarah-driver.apk`, and the Users page links to it.

Before building a new version, raise `versionCode` in `app/build.gradle`.

**Signing:** the app is signed with the debug key of the PC that builds it
(`C:\Users\Administrator\.android\debug.keystore`), the same as the printer app. Android only installs an update
over the old app when both are signed with the same key. Build updates on the same PC, or keep a copy of that file.

## Installing on a driver's phone

1. The owner adds the driver under **Users**: role **Driver**, name, phone number, password.
2. On the driver's phone, open the website's Users page link **Download the Android driver app** (or send the
   driver the address `https://www.madawarah.com/downloads/madawarah-driver.apk`).
3. Open the downloaded file and allow installing from Chrome when Android asks.
4. Open **Madawarah Driver** and sign in with the phone number and password.
5. When the first delivery is started, tap **Allow** for location ("While using the app") and for notifications.

Some phones (Xiaomi, Oppo, Vivo, Huawei, some Samsung settings) stop background apps to save battery. If a
driver's position stops updating with the screen locked, open the phone's Settings → Apps → Madawarah Driver →
Battery and choose **Unrestricted** (or "No restrictions").

## Not tested on a phone yet

The app builds and the page-to-app handover is tested in a browser with a stand-in for the app, but the app
itself has not been run on a real phone. Test one delivery with the screen locked before giving it to all drivers.

## iPhone

There's no iPhone app. An iPhone driver opens the driver page in Safari and keeps it open with the screen on
during the delivery; the page keeps the screen awake by itself.
