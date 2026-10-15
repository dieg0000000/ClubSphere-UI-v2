package cloud.clubsphere.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class ClubSpherePushService extends FirebaseMessagingService {

    static final String PREFS = "clubsphere_push";
    static final String KEY_TOKEN = "fcm_token";
    static final String KEY_ICON_STATUS = "last_icon_status";
    static final String KEY_ICON_URL = "last_icon_url";
    static final String CHANNEL_ID = "clubsphere_default";
    static final String EXTRA_URL = "clubsphere_url";

    private static final String TAG = "ClubSpherePush";
    private static final int ICON_TIMEOUT_MS = 5000;
    private static final int ICON_MAX_BYTES = 1024 * 1024;
    private static final Map<String, Bitmap> ICON_CACHE = new ConcurrentHashMap<>();

    static void storeToken(Context context, String token) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_TOKEN, token)
            .apply();
    }

    static String storedToken(Context context) {
        String token = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_TOKEN, null);
        return token == null ? "" : token;
    }

    static String storedIconStatus(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ICON_STATUS, "");
    }

    static String storedIconUrl(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_ICON_URL, "");
    }

    static boolean hasPostPermission(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true;
        return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
            == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onNewToken(@NonNull String token) {
        storeToken(this, token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage message) {
        Map<String, String> data = message.getData();
        String title = valueOr(data.get("title"), "ClubSphère");
        String body = valueOr(data.get("body"), "");
        String url = valueOr(data.get("url"), "/");
        String tag = valueOr(data.get("tag"), "clubsphere");

        ensureChannel();

        Intent intent = new Intent(this, MainActivity.class);
        intent.putExtra(EXTRA_URL, url);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            tag.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_clubsphere)
            .setColor(0xFF0F172A)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setDefaults(NotificationCompat.DEFAULT_SOUND | NotificationCompat.DEFAULT_VIBRATE)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(contentIntent);

        Bitmap largeIcon = clubIcon(data.get("club_slug"), data.get("icon"));
        if (largeIcon != null) builder.setLargeIcon(largeIcon);

        if (!hasPostPermission(this)) return;
        NotificationManagerCompat.from(this).notify(tag, 0, builder.build());
    }

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Notifications du club",
            NotificationManager.IMPORTANCE_HIGH
        );
        manager.createNotificationChannel(channel);
    }

    private Bitmap clubIcon(String slug, String iconUrl) {
        Log.d(TAG, "Large icon: slug=" + slug + " icon=" + iconUrl);
        if (iconUrl == null || iconUrl.isEmpty()) return iconResult(null, iconUrl, "skipped: no icon in data");
        String rejection = iconUrlRejection(iconUrl);
        if (rejection != null) return iconResult(null, iconUrl, rejection);
        if (slug == null || !slug.matches("[a-z0-9-]+")) return iconResult(null, iconUrl, "skipped: invalid club_slug " + slug);

        Bitmap cached = ICON_CACHE.get(slug);
        if (cached != null) return iconResult(cached, iconUrl, "ok cache");

        File dir = new File(getCacheDir(), "club_icons");
        File file = new File(dir, slug + ".png");
        try {
            if (file.isFile()) {
                Log.d(TAG, "Large icon: decoding disk cache " + file.getName());
                Bitmap fromDisk = BitmapFactory.decodeFile(file.getPath());
                if (fromDisk != null) {
                    ICON_CACHE.put(slug, fromDisk);
                    return iconResult(fromDisk, iconUrl, "ok cache disk");
                }
                Log.d(TAG, "Large icon: disk cache unreadable, downloading");
            }

            Log.d(TAG, "Large icon: downloading");
            byte[] bytes = download(iconUrl);
            Log.d(TAG, "Large icon: downloaded " + bytes.length + " bytes");
            Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bitmap == null) return iconResult(null, iconUrl, "bitmap null");
            ICON_CACHE.put(slug, bitmap);

            if (dir.isDirectory() || dir.mkdirs()) {
                File tmp = new File(dir, slug + ".tmp");
                try (FileOutputStream out = new FileOutputStream(tmp)) {
                    out.write(bytes);
                }
                if (!tmp.renameTo(file)) tmp.delete();
            }
            return iconResult(bitmap, iconUrl, "ok downloaded " + bytes.length + " bytes");
        } catch (HttpStatusException e) {
            return iconResult(ICON_CACHE.get(slug), iconUrl, "http " + e.code);
        } catch (Exception e) {
            Log.w(TAG, "Club icon unavailable for " + slug, e);
            String detail = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
            return iconResult(ICON_CACHE.get(slug), iconUrl, "error " + detail);
        }
    }

    private Bitmap iconResult(Bitmap bitmap, String iconUrl, String status) {
        Log.d(TAG, "Large icon: " + status);
        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_ICON_STATUS, status)
            .putString(KEY_ICON_URL, iconUrl == null ? "" : iconUrl)
            .apply();
        return bitmap;
    }

    private static String iconUrlRejection(String value) {
        Uri uri = Uri.parse(value);
        if (!"https".equalsIgnoreCase(uri.getScheme())) return "skipped: not https";
        if (uri.getUserInfo() != null) return "skipped: userinfo not allowed";
        String host = uri.getHost();
        if (host == null || !host.toLowerCase().endsWith(".supabase.co")) return "skipped: host not allowed " + host;
        return null;
    }

    private static final class HttpStatusException extends IOException {
        final int code;

        HttpStatusException(int code) {
            super("http " + code);
            this.code = code;
        }
    }

    private static byte[] download(String iconUrl) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(iconUrl).openConnection();
        try {
            conn.setConnectTimeout(ICON_TIMEOUT_MS);
            conn.setReadTimeout(ICON_TIMEOUT_MS);
            // A redirect could leave the allowed host.
            conn.setInstanceFollowRedirects(false);
            int code = conn.getResponseCode();
            Log.d(TAG, "Large icon: http " + code);
            if (code != HttpURLConnection.HTTP_OK) throw new HttpStatusException(code);
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buffer = new byte[8192];
                int total = 0;
                int read;
                while ((read = in.read(buffer)) != -1) {
                    total += read;
                    if (total > ICON_MAX_BYTES) throw new IOException("too large > " + ICON_MAX_BYTES + " bytes");
                    out.write(buffer, 0, read);
                }
                return out.toByteArray();
            }
        } finally {
            conn.disconnect();
        }
    }

    private static String valueOr(String value, String fallback) {
        return value == null || value.isEmpty() ? fallback : value;
    }
}
