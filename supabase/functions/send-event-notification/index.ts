import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/get-from-address.ts";
import { sendResendBatched, ResendPayload } from "../_shared/send-resend-batched.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
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

    const allowedRoles = ["admin", "president", "vice_president", "responsable_technique", "committee"];
    const isAdmin = allowedRoles.includes(profile?.role);

    const { data: accessRow } = await supabaseAdmin
      .from("committee_access")
      .select("can_edit")
      .eq("profile_id", user.id)
      .maybeSingle();

    if (!isAdmin && !accessRow?.can_edit) {
      return new Response(
        JSON.stringify({ error: "Accès non autorisé" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { event_id, is_reminder, reminder_days } = await req.json();

    if (!event_id) {
      return new Response(
        JSON.stringify({ error: "event_id requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("title, date, location, description")
      .eq("id", event_id)
      .maybeSingle();

    if (!event) {
      return new Response(
        JSON.stringify({ error: "Événement introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: clubSettings } = await supabaseAdmin
      .from("club_settings")
      .select("club_name, primary_color, logo_url, sender_email, club_email")
      .maybeSingle();

    const clubName = clubSettings?.club_name || "Club";
    const clubPrimaryColor = clubSettings?.primary_color || "#1e3a8a";
    const clubLogoUrl = clubSettings?.logo_url || null;
    const fromAddress = await getFromAddress(supabaseAdmin);

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("email, full_name")
      .not("email", "is", null);

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, message: "Aucun destinataire" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const isSimulated = !resendApiKey;
    const appUrl = Deno.env.get("APP_URL") || "https://localhost:5173";

    const eventDate = new Date(event.date).toLocaleString("fr-CH", {
      timeZone: "Europe/Zurich",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const descriptionExcerpt = event.description
      ? event.description.slice(0, 200) + (event.description.length > 200 ? "..." : "")
      : "";

    const subjectPrefix = is_reminder
      ? `Rappel — ${event.title} dans ${reminder_days} jour${reminder_days > 1 ? "s" : ""}`
      : `Nouvel événement — ${event.title}`;

    const headerText = is_reminder ? "Rappel d'événement" : "Nouvel événement";

    let sentCount = 0;
    const payloads: ResendPayload[] = [];

    for (const profile of profiles) {
      if (!profile.email) continue;

      const firstName = profile.full_name?.split(" ")[0] || "vous";

      const emailHtml = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subjectPrefix}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: ${clubPrimaryColor}; padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              ${clubLogoUrl
                ? `<img src="${clubLogoUrl}" alt="${clubName}" style="width: 120px; height: auto; display: block; margin: 0 auto 12px auto;" />`
                : `<h1 style="margin: 0 0 8px 0; color: #ffffff; font-size: 28px; font-weight: 700;">${clubName}</h1>`
              }
              <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 14px;">${headerText}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Bonjour <strong>${firstName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                ${is_reminder
                  ? `Un événement approche ! Il reste <strong>${reminder_days} jour${reminder_days > 1 ? "s" : ""}</strong> avant :`
                  : "Un nouvel événement a été ajouté au calendrier du club."
                }
              </p>
              <div style="background-color: #eff6ff; border-left: 4px solid ${clubPrimaryColor}; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <h2 style="margin: 0 0 12px 0; color: #1f2937; font-size: 18px; font-weight: 700;">${event.title}</h2>
                <p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;">
                  <strong>Date :</strong> ${eventDate}
                </p>
                ${event.location ? `<p style="margin: 0 0 8px 0; color: #64748b; font-size: 14px;"><strong>Lieu :</strong> ${event.location}</p>` : ""}
                ${descriptionExcerpt ? `<p style="margin: 12px 0 0 0; color: #374151; font-size: 14px; line-height: 1.6;">${descriptionExcerpt}</p>` : ""}
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 24px 0;">
                <tr>
                  <td align="center">
                    <a href="${appUrl}/events" style="display: inline-block; background-color: ${clubPrimaryColor}; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                      Voir l'événement →
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">${clubName}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

      if (isSimulated) {
        console.log("SIMULATED EMAIL:", { to: profile.email, subject: subjectPrefix });
        sentCount++;
        continue;
      }

      payloads.push({
        from: fromAddress,
        to: [profile.email],
        subject: subjectPrefix,
        html: emailHtml,
      });
    }

    if (!isSimulated && payloads.length > 0) {
      const results = await sendResendBatched(resendApiKey!, payloads);
      for (const r of results) {
        if (r.ok) sentCount++;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, simulated: isSimulated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
