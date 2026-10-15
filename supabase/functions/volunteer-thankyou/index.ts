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

    const body = await req.json();
    const { volunteer_id } = body;

    if (!volunteer_id) {
      return new Response(JSON.stringify({ error: "volunteer_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: volunteer } = await supabaseAdmin
      .from("event_volunteers")
      .select("*, events(title, date)")
      .eq("id", volunteer_id)
      .maybeSingle();

    if (!volunteer) {
      return new Response(JSON.stringify({ error: "Volunteer not found" }), {
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

    const eventTitle = volunteer.events?.title || "l'événement";
    const eventDate = volunteer.events?.date
      ? new Date(volunteer.events.date).toLocaleDateString("fr-CH", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })
      : "";

    const availStart = volunteer.availability_start
      ? volunteer.availability_start.substring(0, 5)
      : "—";
    const availEnd = volunteer.availability_end
      ? volunteer.availability_end.substring(0, 5)
      : "—";
    const preferredPosts =
      volunteer.preferred_posts && volunteer.preferred_posts.length > 0
        ? volunteer.preferred_posts.join(", ")
        : "Aucun souhait spécifique";

    const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <h2 style="color: #c0392b;">Merci pour votre engagement, ${volunteer.first_name} ! 🙏</h2>
  <p>Cher(e) ${volunteer.first_name},</p>
  <p>Un immense merci de vous être inscrit(e) comme bénévole pour <strong>${eventTitle}</strong> le <strong>${eventDate}</strong> !</p>
  <p>Votre engagement est précieux et fait toute la différence pour nos joueurs et notre club. Des bénévoles comme vous, c'est ce qui rend nos événements possibles et inoubliables.</p>
  <div style="background: #f8f8f8; border-left: 4px solid #c0392b; padding: 16px; margin: 20px 0; border-radius: 4px;">
    <p style="margin: 0 0 8px;"><strong>Vos disponibilités :</strong> ${availStart} - ${availEnd}</p>
    <p style="margin: 0;"><strong>Vos souhaits de postes :</strong> ${preferredPosts}</p>
  </div>
  <p>Le responsable de la manifestation examinera votre candidature et vous confirmera votre poste et vos horaires par email.</p>
  <p>En attendant, si vous avez des questions, n'hésitez pas à nous contacter.</p>
  <p>Encore mille fois merci pour votre générosité !</p>
  <p style="margin-top: 30px;"><strong>L'équipe de ${clubName} 🏆</strong></p>
</body>
</html>`;

    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (resendApiKey) {
      const originalSubject = `Merci pour votre engagement, ${volunteer.first_name} ! 🙏`;
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          reply_to: clubEmail,
          to: [isTestMode ? testRedirect : volunteer.email],
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
