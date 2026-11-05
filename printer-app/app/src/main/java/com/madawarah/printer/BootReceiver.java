package com.madawarah.printer;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Opens the print station when the device has started (and after the app is updated), so printing carries on. */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        Intent open = new Intent(context, MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            context.startActivity(open);
        } catch (RuntimeException ignored) {
            // Not allowed to open by itself (see MainActivity.askForAutostart): someone opens it by hand.
        }
    }
}
