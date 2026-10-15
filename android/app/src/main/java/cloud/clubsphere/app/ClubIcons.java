package cloud.clubsphere.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import android.util.Log;

import org.json.JSONObject;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public final class ClubIcons {

    private static final String TAG = "ClubIcons";
    private static final String SHELL_PREFS = "CapacitorStorage";
    private static final String SLUG_KEY = "club_slug";

    private static final String ALIAS_DEFAULT = "LauncherDefault";
    private static final String ALIAS_FCCRISSIER = "LauncherFccrissier";
    private static final String ALIAS_FCBELRIVE = "LauncherFcbelrive";
    private static final List<String> ALL_ALIASES = Arrays.asList(ALIAS_DEFAULT, ALIAS_FCCRISSIER, ALIAS_FCBELRIVE);

    private static final Map<String, String> CLUB_ALIASES;
    static {
        Map<String, String> m = new HashMap<>();
        m.put("fccrissier", ALIAS_FCCRISSIER);
        m.put("fcbelrive", ALIAS_FCBELRIVE);
        CLUB_ALIASES = Collections.unmodifiableMap(m);
    }

    private static volatile String lastError = null;

    private ClubIcons() {}

    public static void applyClubIcon(Context context) {
        try {
            String target = targetAlias(readSlug(context));
            PackageManager pm = context.getPackageManager();
            if (isEffectivelyEnabled(pm, context, target)) return;

            setState(pm, context, target, PackageManager.COMPONENT_ENABLED_STATE_ENABLED);
            for (String alias : ALL_ALIASES) {
                if (!alias.equals(target)) {
                    setState(pm, context, alias, PackageManager.COMPONENT_ENABLED_STATE_DISABLED);
                }
            }
        } catch (Exception e) {
            recordError("applyClubIcon failed", e);
        }
    }

    public static String diagnostics(Context context) {
        try {
            String slug = readSlug(context);
            PackageManager pm = context.getPackageManager();
            JSONObject states = new JSONObject();
            for (String alias : ALL_ALIASES) {
                states.put(alias, pm.getComponentEnabledSetting(component(context, alias)));
            }
            JSONObject out = new JSONObject();
            out.put("slug", slug.isEmpty() ? JSONObject.NULL : slug);
            out.put("target", targetAlias(slug));
            out.put("states", states);
            out.put("lastError", lastError == null ? JSONObject.NULL : lastError);
            out.put("lastIconStatus", ClubSpherePushService.storedIconStatus(context));
            out.put("lastIconUrl", ClubSpherePushService.storedIconUrl(context));
            return out.toString();
        } catch (Exception e) {
            recordError("diagnostics failed", e);
            return "{\"lastError\":" + JSONObject.quote(lastError) + "}";
        }
    }

    private static String readSlug(Context context) {
        String raw = context.getSharedPreferences(SHELL_PREFS, Context.MODE_PRIVATE).getString(SLUG_KEY, null);
        return raw == null ? "" : raw.trim().toLowerCase();
    }

    private static String targetAlias(String slug) {
        String alias = CLUB_ALIASES.get(slug);
        return alias != null ? alias : ALIAS_DEFAULT;
    }

    private static ComponentName component(Context context, String alias) {
        return new ComponentName(context, context.getPackageName() + "." + alias);
    }

    // DEFAULT means "as declared in the manifest": only LauncherDefault is enabled there.
    private static boolean isEffectivelyEnabled(PackageManager pm, Context context, String alias) {
        int state = pm.getComponentEnabledSetting(component(context, alias));
        if (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) return ALIAS_DEFAULT.equals(alias);
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED;
    }

    private static void setState(PackageManager pm, Context context, String alias, int state) {
        try {
            pm.setComponentEnabledSetting(component(context, alias), state, PackageManager.DONT_KILL_APP);
        } catch (Exception e) {
            recordError("setComponentEnabledSetting " + alias + " -> " + state + " failed", e);
        }
    }

    private static void recordError(String message, Exception e) {
        lastError = message + ": " + e;
        Log.e(TAG, message, e);
    }
}
