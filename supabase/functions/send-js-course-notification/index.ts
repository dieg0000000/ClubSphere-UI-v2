import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/get-from-address.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length === 0 || t.length > 254) return false;
  if (t.includes("\n") || t.includes("\r")) return false;
  return EMAIL_REGEX.test(t);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Non autorisé - en-tête Authorization manquant" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const allowed = ["admin", "committee", "president", "vice_president"];
    if (!profile || !allowed.includes(profile.role)) {
      return new Response(
        JSON.stringify({ error: "Accès non autorisé" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = await req.json();
    const coach_id: string | undefined = body.coach_id;
    if (!coach_id) {
      return new Response(
        JSON.stringify({ error: "coach_id requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: coach, error: coachError } = await supabaseAdmin
      .from("coaches")
      .select("id, user_id, first_name, last_name, email, next_js_course_date, next_js_course_name, next_js_course_number, next_js_course_location")
      .eq("id", coach_id)
      .maybeSingle();

    if (coachError || !coach) {
      return new Response(
        JSON.stringify({ error: "Entraîneur introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!coach.next_js_course_date || !coach.next_js_course_name || !coach.next_js_course_number || !coach.next_js_course_location) {
      return new Response(
        JSON.stringify({ error: "Missing course details" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!isValidEmail(coach.email)) {
      return new Response(
        JSON.stringify({ error: "Email invalide" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: clubSettings } = await supabaseAdmin
      .from("club_settings")
      .select("*")
      .maybeSingle();

    const clubName = clubSettings?.club_name || clubSettings?.name || "Club";
    const clubEmail = clubSettings?.club_email || clubSettings?.contact_email || "noreply@club.ch";
    const clubPhone = clubSettings?.contact_phone || clubSettings?.club_phone || "";
    const clubAddress = clubSettings?.address || clubSettings?.club_address || "";
    const logoUrl = clubSettings?.logo_url || "";
    const primaryColor = clubSettings?.primary_color || "#cc0000";
    const primaryDark = clubSettings?.primary_dark || "#990000";
    const fromAddress = await getFromAddress(supabaseAdmin);

    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

    const courseDate = new Date(coach.next_js_course_date).toLocaleDateString("fr-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });

    const baseSubject = `Inscription à votre formation J+S - ${coach.next_js_course_name}`;
    const subject = isTestMode ? `[TEST] ${baseSubject}` : baseSubject;
    const recipientEmail = isTestMode ? testRedirect : coach.email;

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:linear-gradient(135deg,${primaryColor} 0%,${primaryDark} 100%);padding:32px 30px;text-align:center;border-radius:8px 8px 0 0;">
            ${logoUrl ? `<img src="${logoUrl}" alt="${clubName}" style="max-height:60px;margin-bottom:10px;" />` : ""}
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${clubName}</h1>
            <p style="margin:6px 0 0 0;color:rgba(255,255,255,0.9);font-size:13px;">Formation J+S</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 30px;">
            <p style="margin:0 0 16px 0;color:#1f2937;font-size:16px;line-height:1.6;">Bonjour <strong>${coach.first_name || ""}</strong>,</p>
            <p style="margin:0 0 18px 0;color:#1f2937;font-size:15px;line-height:1.6;">
              Vous êtes inscrit(e) à une formation J+S de renouvellement de votre diplôme. Voici les détails :
            </p>
            <div style="background:#eff6ff;border-left:4px solid ${primaryColor};padding:18px;margin:18px 0;border-radius:6px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                <tr><td style="padding:6px 0;color:#64748b;">Cours:</td><td style="padding:6px 0;color:#1f2937;font-weight:600;text-align:right;">${coach.next_js_course_name}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Numéro du cours:</td><td style="padding:6px 0;color:#1f2937;font-weight:600;text-align:right;">${coach.next_js_course_number}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Date:</td><td style="padding:6px 0;color:#1f2937;font-weight:600;text-align:right;">${courseDate}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Lieu:</td><td style="padding:6px 0;color:#1f2937;font-weight:600;text-align:right;">${coach.next_js_course_location}</td></tr>
              </table>
            </div>
            <p style="margin:18px 0 0 0;color:#1f2937;font-size:14px;line-height:1.6;">
              Cette formation est importante pour maintenir la validité de votre diplôme J+S. Le club compte sur votre participation.
            </p>
            <p style="margin:18px 0 0 0;color:#1f2937;font-size:14px;line-height:1.6;">
              Pour toute question, contactez-nous.
            </p>
            <p style="margin:24px 0 0 0;color:#64748b;font-size:13px;line-height:1.6;">Sportivement,<br/>${clubName}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#f8fafc;padding:24px 30px;border-radius:0 0 8px 8px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
            <strong style="color:#1f2937;display:block;margin-bottom:6px;">${clubName}</strong>
            ${clubAddress ? `<div>${clubAddress}</div>` : ""}
            ${clubPhone ? `<div>Tel: ${clubPhone}</div>` : ""}
            ${clubEmail ? `<div>Email: <a href="mailto:${clubEmail}" style="color:${primaryColor};text-decoration:none;">${clubEmail}</a></div>` : ""}
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const isSimulated = !resendApiKey;

    let success = false;
    let errorMsg: string | null = null;

    if (isSimulated) {
      console.log("SIMULATED JS COURSE NOTIFICATION:", { to: recipientEmail, subject });
      success = true;
    } else {
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [recipientEmail],
            reply_to: clubEmail,
            subject,
            html,
          }),
        });
        if (resp.ok) {
          success = true;
        } else {
          errorMsg = `Resend error ${resp.status}: ${await resp.text()}`;
        }
      } catch (e) {
        errorMsg = (e as Error).message;
      }
    }

    await supabaseAdmin.from("notification_log").insert({
      event_type: "js_course_notification",
      recipient_id: coach.user_id ?? null,
      channel: "email",
      payload: {
        coach_id: coach.id,
        course_name: coach.next_js_course_name,
        course_number: coach.next_js_course_number,
        course_date: coach.next_js_course_date,
        course_location: coach.next_js_course_location,
        recipient_email: coach.email,
        delivered_to: recipientEmail,
        test_mode: isTestMode,
        simulated: isSimulated,
        error: errorMsg,
      },
      success,
    });

    if (!success) {
      return new Response(
        JSON.stringify({ error: errorMsg || "Erreur lors de l'envoi" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        recipient_email: recipientEmail,
        simulated: isSimulated,
        test_mode: isTestMode,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
