import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Non authentifie" }, 401);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return jsonResponse({ error: "Non authentifie" }, 401);
    }

    const { coach_id } = await req.json();
    if (!coach_id) {
      return jsonResponse({ error: "coach_id est requis" }, 400);
    }

    // Load target coach
    const { data: coach, error: coachError } = await adminClient
      .from("coaches")
      .select("id, email, first_name, last_name, invite_token, club_id")
      .eq("id", coach_id)
      .maybeSingle();

    if (coachError) {
      console.error("Coach lookup error:", coachError);
      return jsonResponse({ error: "Erreur interne" }, 500);
    }
    if (!coach || !coach.invite_token) {
      return jsonResponse(
        { error: "Aucun lien d'invitation actif" },
        400
      );
    }

    // Authorize: caller must be admin or committee in the coach's club
    const { data: callerRole } = await adminClient
      .from("profile_roles")
      .select("role")
      .eq("profile_id", caller.id)
      .eq("club_id", coach.club_id)
      .in("role", ["admin", "committee"])
      .maybeSingle();

    if (!callerRole) {
      return jsonResponse({ error: "Acces refuse" }, 403);
    }

    // Load club slug
    const { data: club } = await adminClient
      .from("clubs")
      .select("slug")
      .eq("id", coach.club_id)
      .maybeSingle();

    if (!club?.slug) {
      console.error("Club not found for id:", coach.club_id);
      return jsonResponse({ error: "Club introuvable" }, 500);
    }

    // Load club settings for branding
    const { data: settings } = await adminClient
      .from("club_settings")
      .select(
        "club_name, primary_color, primary_dark, accent_color, logo_url"
      )
      .eq("club_id", coach.club_id)
      .maybeSingle();

    const clubName = settings?.club_name || "le Club";
    const primaryColor = settings?.primary_color || "#1e3a5f";
    const primaryDark = settings?.primary_dark || "#0f1f33";
    const accentColor = settings?.accent_color || "#ffffff";
    const logoUrl = settings?.logo_url || "";

    // Build invite URL
    const inviteUrl = `https://${club.slug}.clubsphere.cloud/register/coach?token=${coach.invite_token}`;

    // Test mode
    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    const safeClubName = escapeHtml(clubName);
    const safeFirstName = escapeHtml(coach.first_name);
    const safeInviteUrl = escapeHtml(inviteUrl);

    const logoBlock = logoUrl
      ? `<img src="${escapeHtml(logoUrl)}" alt="${safeClubName}" style="max-height:48px;max-width:160px;margin-bottom:8px;display:block;margin-left:auto;margin-right:auto;" />`
      : "";

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background-color:#f4f4f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- HEADER -->
        <tr>
          <td style="background-color:${primaryColor};padding:28px 24px;border-radius:12px 12px 0 0;text-align:center;">
            ${logoBlock}
            <h1 style="color:${accentColor};margin:0;font-size:22px;font-weight:700;">${safeClubName}</h1>
          </td>
        </tr>
        <!-- BODY -->
        <tr>
          <td style="background-color:#ffffff;padding:32px 28px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
            <p style="margin:0 0 16px;font-size:16px;color:#18181b;">Bonjour ${safeFirstName},</p>
            <p style="margin:0 0 16px;font-size:15px;color:#3f3f46;line-height:1.6;">
              <strong>${safeClubName}</strong> vous invite \u00e0 activer votre acc\u00e8s
              entra\u00eeneur \u00e0 la plateforme de gestion du club.
            </p>
            <p style="margin:0 0 24px;font-size:15px;color:#3f3f46;line-height:1.6;">
              Cliquez sur le bouton ci-dessous pour cr\u00e9er votre compte et acc\u00e9der \u00e0 votre espace.
            </p>
            <div style="text-align:center;margin:28px 0;">
              <a href="${safeInviteUrl}" style="background-color:${primaryColor};color:${accentColor};padding:14px 36px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block;">
                Activer mon compte
              </a>
            </div>
            <p style="margin:24px 0 0;font-size:13px;color:#71717a;line-height:1.5;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:
            </p>
            <p style="margin:4px 0 0;font-size:13px;word-break:break-all;">
              <a href="${safeInviteUrl}" style="color:${primaryColor};">${safeInviteUrl}</a>
            </p>
            <p style="margin:24px 0 0;font-size:13px;color:#a1a1aa;line-height:1.4;">
              Ce lien est valable jusqu'\u00e0 son utilisation.
            </p>
          </td>
        </tr>
        <!-- FOOTER -->
        <tr>
          <td style="background-color:${primaryDark};padding:16px 24px;border-radius:0 0 12px 12px;text-align:center;">
            <img src="https://${club.slug}.clubsphere.cloud/logo-v1-400-transparent.png" alt="ClubSphere" style="max-height:28px;margin:0 auto 6px;display:block;" />
            <p style="margin:0;font-size:12px;color:${accentColor};">Propuls\u00e9 par ClubSphere</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    let resendId: string | null = null;

    if (resendApiKey) {
      const fromAddress = "ClubSphere <noreply@clubsphere.ch>";
      const originalSubject = `Votre acc\u00e8s \u00e0 ClubSphere \u2014 ${clubName}`;
      const toEmail = isTestMode ? testRedirect : coach.email;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [toEmail],
          subject: isTestMode ? `[TEST] ${originalSubject}` : originalSubject,
          html: htmlBody,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        resendId = json?.id ?? null;
      } else {
        const errText = await res.text();
        console.error("Resend API error:", res.status, errText);
        return jsonResponse(
          { error: "Erreur lors de l'envoi de l'email" },
          502
        );
      }
    }

    return jsonResponse({
      success: true,
      simulated: !resendApiKey,
      ...(resendId ? { resend_id: resendId } : {}),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    console.error("send-coach-invite error:", err);
    return jsonResponse({ error: message }, 500);
  }
});
