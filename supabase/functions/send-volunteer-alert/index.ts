import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/get-from-address.ts";
import { sendResendBatched, ResendPayload } from "../_shared/send-resend-batched.ts";

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

    const { event_id } = await req.json();
    if (!event_id) {
      return new Response(JSON.stringify({ error: "event_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: event } = await supabaseAdmin
      .from("events")
      .select("title, date, start_time, end_time, location")
      .eq("id", event_id)
      .maybeSingle();

    const { data: posts } = await supabaseAdmin
      .from("event_volunteer_posts")
      .select("name, description, start_time, end_time, required_count")
      .eq("event_id", event_id)
      .order("start_time");

    const { data: registrations } = await supabaseAdmin
      .from("volunteer_registrations")
      .select("volunteer_contact_id")
      .eq("event_id", event_id);

    const contactIds = [...new Set((registrations ?? []).map((r: { volunteer_contact_id: string }) => r.volunteer_contact_id))];

    const { data: contacts } = contactIds.length > 0
      ? await supabaseAdmin
          .from("volunteer_contacts")
          .select("first_name, last_name, email")
          .in("id", contactIds)
          .eq("receive_volunteer_alerts", true)
          .not("email", "is", null)
      : { data: [] };

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

    if (!contacts || contacts.length === 0) {
      return new Response(JSON.stringify({ success: true, sent: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const eventTitle = event?.title || "l'événement";
    const eventDate = event?.date
      ? new Date(event.date).toLocaleDateString("fr-CH", { day: "numeric", month: "long", year: "numeric" })
      : "";
    const eventTime = event?.start_time
      ? `${event.start_time.substring(0, 5)}${event.end_time ? " – " + event.end_time.substring(0, 5) : ""}`
      : "";

    const postsHtml = posts && posts.length > 0
      ? `<div style="margin: 20px 0;">
          <p style="color: #555; font-weight: 700; margin-bottom: 10px;">Postes disponibles :</p>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            ${posts.map(p => `
              <div style="background: #f8f9fa; border-left: 3px solid #e74c3c; padding: 10px 14px; border-radius: 0 6px 6px 0;">
                <strong>${p.name}</strong> — ${p.start_time.substring(0, 5)} à ${p.end_time.substring(0, 5)}
                ${p.description ? `<br/><span style="color: #777; font-size: 13px;">${p.description}</span>` : ""}
                <br/><span style="color: #e74c3c; font-size: 12px; font-weight: 700;">${p.required_count} bénévole(s) recherché(s)</span>
              </div>`).join("")}
          </div>
        </div>`
      : "";

    let sent = 0;
    const payloads: ResendPayload[] = [];
    for (const contact of contacts) {
      if (!contact.email) continue;

      const htmlBody = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: linear-gradient(135deg, #e74c3c, #c0392b); padding: 24px; border-radius: 12px 12px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 22px;">Bénévoles recherchés !</h1>
    <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${clubName} a besoin de vous</p>
  </div>
  <div style="background: #fff; border: 1px solid #e9ecef; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
    <p>Bonjour ${contact.first_name},</p>
    <p>Le <strong>${clubName}</strong> organise <strong>${eventTitle}</strong> et a besoin de bénévoles !</p>
    <div style="background: #f0f9ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0 0 6px;"><strong>Date :</strong> ${eventDate}</p>
      ${eventTime ? `<p style="margin: 0 0 6px;"><strong>Horaires :</strong> ${eventTime}</p>` : ""}
      ${event?.location ? `<p style="margin: 0;"><strong>Lieu :</strong> ${event.location}</p>` : ""}
    </div>
    ${postsHtml}
    <p>Votre aide est précieuse pour le bon déroulement de cet événement.</p>
    <div style="text-align: center; margin: 28px 0;">
      <a href="${appUrl}/events" style="background: #e74c3c; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 15px; display: inline-block;">
        Je me porte bénévole
      </a>
    </div>
    <p style="color: #888; font-size: 12px; border-top: 1px solid #eee; padding-top: 16px; margin-top: 24px;">
      Vous recevez cet email car vous faites partie des contacts bénévoles du ${clubName}.<br/>
      Pour ne plus recevoir ces alertes, contactez l'administrateur du club.
    </p>
  </div>
  <p style="text-align: center; margin-top: 16px;"><strong>${clubName}</strong></p>
</body>
</html>`;

      if (resendApiKey) {
        const originalSubject = `${clubName} a besoin de bénévoles pour ${eventTitle} !`;
        payloads.push({
          from: fromAddress,
          reply_to: clubEmail,
          to: [isTestMode ? testRedirect : contact.email],
          subject: isTestMode ? `[TEST] ${originalSubject}` : originalSubject,
          html: htmlBody,
        });
      } else {
        sent++;
      }
    }

    if (resendApiKey && payloads.length > 0) {
      const results = await sendResendBatched(resendApiKey, payloads);
      for (const r of results) if (r.ok) sent++;
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
