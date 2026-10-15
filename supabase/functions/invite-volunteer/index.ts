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

    const { contact_id } = await req.json();
    if (!contact_id) {
      return new Response(JSON.stringify({ error: "contact_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: contact } = await supabaseAdmin
      .from("volunteer_contacts")
      .select("first_name, last_name, email")
      .eq("id", contact_id)
      .maybeSingle();

    if (!contact?.email) {
      return new Response(JSON.stringify({ error: "Contact not found or no email" }), {
        status: 404,
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
    const appUrl = Deno.env.get("APP_URL") || "https://localhost:5173";
    const registerUrl = `${appUrl}/register`;

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: linear-gradient(135deg, #1e3a5f, #2563eb); padding: 28px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 24px;">Rejoignez ClubSphere !</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 15px;">${clubName} vous invite</p>
  </div>
  <div style="background: #fff; border: 1px solid #e9ecef; border-top: none; padding: 28px; border-radius: 0 0 12px 12px;">
    <p>Bonjour ${contact.first_name},</p>
    <p>
      Le <strong>${clubName}</strong> vous invite à rejoindre <strong>ClubSphere</strong>, la plateforme de gestion de club qui vous permettra de :
    </p>
    <ul style="color: #555; line-height: 1.8; padding-left: 20px;">
      <li>Gérer vos disponibilités pour les événements bénévoles</li>
      <li>Recevoir des alertes personnalisées pour les prochains événements</li>
      <li>Consulter le calendrier et les actualités du club</li>
      <li>Communiquer directement avec les membres du club</li>
    </ul>
    <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin: 20px 0;">
      <p style="margin: 0; color: #15803d; font-weight: 700; font-size: 14px;">
        Vous avez déjà participé à nos événements en tant que bénévole — votre compte sera automatiquement lié à votre historique !
      </p>
    </div>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${registerUrl}" style="background: #2563eb; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">
        Créer mon compte gratuitement
      </a>
    </div>
    <p style="color: #888; font-size: 13px;">
      Lien d'inscription : <a href="${registerUrl}" style="color: #2563eb;">${registerUrl}</a>
    </p>
    <p style="color: #888; font-size: 12px; border-top: 1px solid #eee; padding-top: 16px; margin-top: 24px;">
      Vous recevez cet email car vous faites partie des contacts bénévoles du ${clubName}.
    </p>
  </div>
  <p style="text-align: center; margin-top: 16px;"><strong>L'équipe de ${clubName}</strong></p>
</body>
</html>`;

    if (resendApiKey) {
      const originalSubject = `Rejoignez ClubSphere - ${clubName} vous invite !`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          reply_to: clubEmail,
          to: [isTestMode ? testRedirect : contact.email],
          subject: isTestMode ? `[TEST] ${originalSubject}` : originalSubject,
          html: htmlBody,
        }),
      });
    }

    return new Response(JSON.stringify({ success: true, simulated: !resendApiKey }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
