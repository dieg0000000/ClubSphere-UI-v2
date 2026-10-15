import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/get-from-address.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
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

    const body = await req.json();
    const { event_id } = body;

    if (!event_id) {
      return new Response(JSON.stringify({ error: "event_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: volunteers } = await supabaseAdmin
      .from("event_volunteers")
      .select("*, event_volunteer_posts(name, description, start_time, end_time), events(title, date)")
      .eq("event_id", event_id)
      .eq("status", "confirmed");

    if (!volunteers || volunteers.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: clubSettings } = await supabaseAdmin
      .from("club_settings")
      .select("club_name, club_email, sender_email")
      .maybeSingle();

    const clubName = clubSettings?.club_name || "le Club";
    const clubEmail = clubSettings?.club_email || "noreply@club.ch";
    const fromAddress = await getFromAddress(supabaseAdmin);
    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    let sent = 0;

    for (const v of volunteers) {
      const eventTitle = v.events?.title || "l'événement";
      const eventDate = v.events?.date
        ? new Date(v.events.date).toLocaleDateString("fr-CH", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";

      const post = v.event_volunteer_posts;
      const postName = post?.name || "Non assigné";
      const postDesc = post?.description || "";
      const postStart = post?.start_time ? post.start_time.substring(0, 5) : "—";
      const postEnd = post?.end_time ? post.end_time.substring(0, 5) : "—";

      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #16a34a;">Votre poste de bénévole pour ${eventTitle} est confirmé ! ✅</h2>
  <p>Cher(e) ${v.first_name},</p>
  <p>Votre participation comme bénévole pour <strong>${eventTitle}</strong> le <strong>${eventDate}</strong> est confirmée !</p>
  <div style="background: #f0fdf4; border-left: 4px solid #16a34a; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0 0 8px;">📍 <strong>Votre poste :</strong> ${postName}</p>
    <p style="margin: 0 0 8px;">🕐 <strong>Vos horaires :</strong> ${postStart} - ${postEnd}</p>
    ${postDesc ? `<p style="margin: 0;">📝 <strong>Description :</strong> ${postDesc}</p>` : ""}
  </div>
  <p>Merci de votre engagement ! Rendez-vous le <strong>${eventDate}</strong> à <strong>${postStart}</strong>.</p>
  <p style="margin-top: 30px;"><strong>L'équipe de ${clubName} 🏆</strong></p>
</body>
</html>`;

      if (resendApiKey) {
        const originalSubject = `Votre poste de bénévole pour ${eventTitle} est confirmé ! ✅`;
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromAddress,
            reply_to: clubEmail,
            to: [isTestMode ? testRedirect : v.email],
            subject: isTestMode ? `[TEST] ${originalSubject}` : originalSubject,
            html: htmlBody,
          }),
        });
      }
      sent++;
    }

    return new Response(JSON.stringify({ success: true, sent, simulated: !resendApiKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
