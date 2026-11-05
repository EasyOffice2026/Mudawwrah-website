# Madawarah Printer (Sunmi app)

A small Android app for Sunmi handhelds with a built-in printer (the V3e at Sabah Al Ahmad). It opens the
branch's print station page and prints every ticket straight on the built-in printer, through Sunmi's own printer
library (`com.sunmi:printerlibrary`). There's no Android print preview and no pop-up. It opens by itself after the
device restarts.

Chrome on Android always shows a print preview before printing, so the station page in Chrome can't print
unattended. That's why this app exists.

## How it works

- `MainActivity` shows the website in a WebView. The first time, it opens the Printing page
  (`/r/mdawra/admin/printing`). The branch signs in and taps **Open** next to its station. From then on the app
  remembers that station link (with its key) and opens it straight away.
- `PrinterBridge` gives the page `window.SunmiPrinter`. The page (`frontend/src/lib/sunmi.js`) draws each ticket
  as a picture, laid out at 48 mm (the printable width of 58 mm paper). The app turns it black and white at 384 dots
  (the print head's width), prints it, and tells the page whether the printer printed it. Only then does the page
  report the order as printed. When the paper runs out, the ticket waits and prints after a new roll goes in.
- Only pages from `madawarah.com`, `www.madawarah.com` and the staging site can use the printer.
- `BootReceiver` opens the app after a restart. Android 10 and later only allow this when the app may "display over
  other apps". The app asks for that once on first start.

## Building

You need JDK 17 and the Android SDK (platform 34, build-tools 34.0.0), with `JAVA_HOME` and `ANDROID_HOME` set.
Then, in Git Bash:

```
cd printer-app
./gradlew assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../frontend/public/downloads/madawarah-printer.apk
```

The website serves it at `/downloads/madawarah-printer.apk`, and the Printing page links to it.

Before building a new version, raise `versionCode` in `app/build.gradle`.

**Signing:** the app is signed with the debug key of the PC that builds it
(`C:\Users\Administrator\.android\debug.keystore`). Android only installs an update over the old app when both are
signed with the same key. Build updates on the same PC, or keep a copy of that file. An app signed with a different
key has to be uninstalled first, and then the branch opens its station again once.

## Installing on the Sunmi

1. On the Sunmi, open the Printing page in Chrome, signed in as the branch, and tap **Download the app for Sunmi**.
2. Open the downloaded file and allow installing from Chrome when Android asks.
3. Open **Madawarah Printer**. Tap **Allow** for "Start by itself after a restart", turn on the switch, and go back.
4. Sign in with the branch account. On the Printing page, tap **Open** next to the branch.
5. Tap **Print a test ticket**. It should print at once, with no preview.

Keep the app open on the screen. It keeps the screen on by itself.
