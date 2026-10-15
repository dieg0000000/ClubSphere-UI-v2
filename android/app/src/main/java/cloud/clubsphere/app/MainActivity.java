package cloud.clubsphere.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;
import com.google.firebase.messaging.FirebaseMessaging;

public class MainActivity extends BridgeActivity {

    private static final String SHELL_PREFS = "CapacitorStorage";
    private static final String SLUG_KEY = "club_slug";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful() && task.getResult() != null) {
                ClubSpherePushService.storeToken(this, task.getResult());
            }
        });

        getBridge().getWebView().addJavascriptInterface(new ClubSphereNativeBridge(this), "ClubSphereNative");

        openNotificationUrl(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        ClubIcons.applyClubIcon(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        openNotificationUrl(intent);
    }

    private void openNotificationUrl(Intent intent) {
        if (intent == null || !intent.hasExtra(ClubSpherePushService.EXTRA_URL)) return;
        String path = intent.getStringExtra(ClubSpherePushService.EXTRA_URL);
        intent.removeExtra(ClubSpherePushService.EXTRA_URL);

        String slug = getSharedPreferences(SHELL_PREFS, MODE_PRIVATE).getString(SLUG_KEY, null);
        if (slug == null || !slug.matches("[a-z0-9-]+")) return;

        // Keep the target on the club host: "//" or "\" could be read as a different host.
        if (path == null || !path.startsWith("/") || path.startsWith("//") || path.contains("\\")) {
            path = "/";
        }
        getBridge().getWebView().loadUrl("https://" + slug + "." + BuildConfig.NATIVE_BASE_DOMAIN + path);
    }
}
