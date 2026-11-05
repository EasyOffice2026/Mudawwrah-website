package com.madawarah.printer;

import android.app.Activity;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.RemoteException;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import com.sunmi.peripheral.printer.InnerPrinterCallback;
import com.sunmi.peripheral.printer.InnerPrinterException;
import com.sunmi.peripheral.printer.InnerPrinterManager;
import com.sunmi.peripheral.printer.InnerResultCallback;
import com.sunmi.peripheral.printer.SunmiPrinterService;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * The Sunmi printer, offered to the print station page as `window.SunmiPrinter`.
 *
 * The page draws each ticket as a picture exactly as it would print it, and hands it over here; the picture goes
 * straight to the built-in printer. The answer comes back to the page as window.__sunmiPrinted(job, ok, message),
 * so the page only reports a ticket printed when the printer says it printed.
 *
 * Only the restaurant's own website can use it: a page from anywhere else gets nothing.
 */
public class PrinterBridge {

    // The print head of a 58 mm Sunmi printer is 384 dots wide.
    static final int PAPER_DOTS = 384;
    // Printed in strips: one very tall picture is more than some printers take at once.
    private static final int STRIP = 256;
    // Darker than this (0-255) prints black; the rest stays paper. Keeps small text solid instead of speckled.
    private static final int INK_BELOW = 170;

    private static final String[] TRUSTED_HOSTS = {"madawarah.com", "www.madawarah.com", "mudawarah-staging.vercel.app"};

    private final Activity activity;
    private final WebView web;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile SunmiPrinterService service;
    private volatile boolean closed;

    private final InnerPrinterCallback connection = new InnerPrinterCallback() {
        @Override
        protected void onConnected(SunmiPrinterService connected) {
            service = connected;
        }

        @Override
        protected void onDisconnected() {
            service = null;
            if (!closed) main.postDelayed(PrinterBridge.this::connect, 3000);
        }
    };

    PrinterBridge(Activity activity, WebView web) {
        this.activity = activity;
        this.web = web;
        connect();
    }

    private void connect() {
        try {
            InnerPrinterManager.getInstance().bindService(activity.getApplicationContext(), connection);
        } catch (InnerPrinterException e) {
            // Not a Sunmi device, or its printer service is missing: status() says so.
        }
    }

    void close() {
        closed = true;
        worker.shutdownNow();
        try {
            InnerPrinterManager.getInstance().unBindService(activity.getApplicationContext(), connection);
        } catch (InnerPrinterException ignored) {
            // Already gone.
        }
    }

    static boolean isTrusted(String url) {
        if (url == null) return false;
        Uri uri = Uri.parse(url);
        if (!"https".equals(uri.getScheme())) return false;
        for (String host : TRUSTED_HOSTS) {
            if (host.equals(uri.getHost())) return true;
        }
        return false;
    }

    /** Must be asked on the page's own thread; the page's address decides whether it may print. */
    private boolean pageIsTrusted() {
        final String[] url = {null};
        final Object lock = new Object();
        synchronized (lock) {
            main.post(() -> {
                synchronized (lock) {
                    url[0] = web.getUrl();
                    lock.notifyAll();
                }
            });
            try {
                lock.wait(2000);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return isTrusted(url[0]);
    }

    /** "ready", "connecting", "no-printer", "out-of-paper", "cover-open", "overheated" or "error". */
    @JavascriptInterface
    public String status() {
        if (!pageIsTrusted()) return "no-printer";
        SunmiPrinterService printer = service;
        if (printer == null) return "connecting";
        try {
            return stateName(printer.updatePrinterState());
        } catch (RemoteException e) {
            return "error";
        }
    }

    static String stateName(int state) {
        switch (state) {
            case 1:
                return "ready";
            case 2:
                return "connecting";
            case 4:
                return "out-of-paper";
            case 5:
                return "overheated";
            case 6:
                return "cover-open";
            case 505:
                return "no-printer";
            default:
                return "error";
        }
    }

    /** Prints a ticket picture (a PNG, as a data: address or plain base64). The answer comes in window.__sunmiPrinted. */
    @JavascriptInterface
    public void print(String job, String picture) {
        if (!pageIsTrusted()) return;
        worker.execute(() -> {
            try {
                printNow(job, picture);
            } catch (Exception e) {
                answer(job, false, e.getMessage() != null ? e.getMessage() : e.toString());
            }
        });
    }

    private void printNow(String job, String picture) throws RemoteException {
        SunmiPrinterService printer = service;
        if (printer == null) {
            answer(job, false, "connecting");
            return;
        }
        String state = stateName(printer.updatePrinterState());
        if (!"ready".equals(state)) {
            answer(job, false, state);
            return;
        }
        Bitmap ticket = toPaper(decode(picture));
        // Everything in one go, and one answer for the whole ticket from the printer itself.
        printer.enterPrinterBuffer(true);
        printer.printerInit(null);
        for (int top = 0; top < ticket.getHeight(); top += STRIP) {
            int height = Math.min(STRIP, ticket.getHeight() - top);
            printer.printBitmap(Bitmap.createBitmap(ticket, 0, top, ticket.getWidth(), height), null);
        }
        // Feeds the end of the ticket past the tear bar.
        printer.lineWrap(4, null);
        printer.exitPrinterBufferWithCallback(true, new InnerResultCallback() {
            @Override
            public void onRunResult(boolean isSuccess) {
            }

            @Override
            public void onReturnString(String result) {
            }

            @Override
            public void onRaiseException(int code, String msg) {
                answer(job, false, msg);
            }

            @Override
            public void onPrintResult(int code, String msg) {
                answer(job, code == 0, msg);
            }
        });
    }

    private static Bitmap decode(String picture) {
        String data = picture.substring(picture.indexOf(',') + 1);
        byte[] bytes = Base64.decode(data, Base64.DEFAULT);
        Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (bitmap == null) throw new IllegalArgumentException("not a picture");
        return bitmap;
    }

    /** As wide as the print head, black or white only. */
    static Bitmap toPaper(Bitmap source) {
        Bitmap sized = source.getWidth() == PAPER_DOTS ? source
                : Bitmap.createScaledBitmap(source, PAPER_DOTS, Math.max(1, Math.round(source.getHeight() * (float) PAPER_DOTS / source.getWidth())), true);
        int width = sized.getWidth();
        int height = sized.getHeight();
        int[] pixels = new int[width * height];
        sized.getPixels(pixels, 0, width, 0, 0, width, height);
        for (int i = 0; i < pixels.length; i++) {
            int p = pixels[i];
            int alpha = Color.alpha(p);
            int level = (Color.red(p) * 299 + Color.green(p) * 587 + Color.blue(p) * 114) / 1000;
            // Transparent is paper.
            level = (level * alpha + 255 * (255 - alpha)) / 255;
            pixels[i] = level < INK_BELOW ? Color.BLACK : Color.WHITE;
        }
        Bitmap paper = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        paper.setPixels(pixels, 0, width, 0, 0, width, height);
        return paper;
    }

    private void answer(String job, boolean ok, String message) {
        main.post(() -> web.evaluateJavascript("window.__sunmiPrinted && window.__sunmiPrinted("
                + JSONObject.quote(job) + "," + ok + "," + JSONObject.quote(message == null ? "" : message) + ")", null));
    }

    /** Back to the Printing page, to open another branch's station. */
    @JavascriptInterface
    public void forgetStation() {
        if (!pageIsTrusted()) return;
        main.post(() -> ((MainActivity) activity).forgetStation());
    }
}
