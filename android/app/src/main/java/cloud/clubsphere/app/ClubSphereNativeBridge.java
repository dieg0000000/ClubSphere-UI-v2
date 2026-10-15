package cloud.clubsphere.app;

import android.Manifest;
import android.app.Activity;
import android.os.Build;
import android.webkit.JavascriptInterface;

import androidx.core.app.ActivityCompat;

public class ClubSphereNativeBridge {

    private static final int REQUEST_POST_NOTIFICATIONS = 4201;

    private final Activity activity;

    ClubSphereNativeBridge(Activity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public String getPlatform() {
        return "android";
    }

    @JavascriptInterface
    public String getAppVersion() {
        return BuildConfig.VERSION_NAME;
    }

    @JavascriptInterface
    public String getPushToken() {
        return ClubSpherePushService.storedToken(activity);
    }

    @JavascriptInterface
    public boolean hasPushPermission() {
        return ClubSpherePushService.hasPostPermission(activity);
    }

    @JavascriptInterface
    public void requestPushPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return;
        activity.runOnUiThread(() -> ActivityCompat.requestPermissions(
            activity,
            new String[] { Manifest.permission.POST_NOTIFICATIONS },
            REQUEST_POST_NOTIFICATIONS
        ));
    }

    @JavascriptInterface
    public String getLauncherDiagnostics() {
        return ClubIcons.diagnostics(activity);
    }

    @JavascriptInterface
    public void applyClubIcon() {
        activity.runOnUiThread(() -> ClubIcons.applyClubIcon(activity));
    }
}
