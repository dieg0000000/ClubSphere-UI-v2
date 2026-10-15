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
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from("profiles").select("role").eq("id", user.id).maybeSingle();
    const allowedRoles = ["admin", "president", "vice_president", "committee"];
    if (!callerProfile || !allowedRoles.includes(callerProfile.role)) {
      return new Response(JSON.stringify({ error: "Accès refusé" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { document_id, emails } = await req.json();
    if (!document_id || !Array.isArray(emails) || emails.length === 0) {
      return new Response(JSON.stringify({ error: "document_id et emails requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("id, title, seasons(name)")
      .eq("id", document_id)
      .maybeSingle();
    if (!doc) {
      return new Response(JSON.stringify({ error: "Document non trouvé" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: clubSettings } = await supabaseAdmin
      .from("club_settings")
      .select("club_name, club_email, sender_email")
      .maybeSingle();
    const clubName = clubSettings?.club_name ?? "ClubSphere";
    const seasonName = (doc as any).seasons?.name ?? "";
    const appUrl = Deno.env.get("APP_URL") ?? "https://app.clubsphere.ch";

    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY non configuré" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fromAddress = await getFromAddress(supabaseAdmin);
    const replyTo = (clubSettings as { club_email?: string })?.club_email || undefined;

    const uniqueEmails = Array.from(new Set(emails.filter((e: unknown) => typeof e === "string" && e.includes("@")))) as string[];
    const originalSubject = `Rappel — Charte à valider : ${doc.title}`;
    const finalSubject = isTestMode ? `[TEST] ${originalSubject}` : originalSubject;
    const payloads: ResendPayload[] = uniqueEmails.map(email => ({
      from: fromAddress,
      reply_to: replyTo,
      to: [isTestMode ? testRedirect : email],
      subject: finalSubject,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
          <h2>Rappel — Charte à valider</h2>
          <p>Bonjour,</p>
          <p>Vous n'avez pas encore validé la charte <strong>${doc.title}</strong>${seasonName ? ` pour la saison ${seasonName}` : ""}.</p>
          <p>Merci de la valider en cliquant sur le lien ci-dessous.</p>
          <p style="margin:24px 0">
            <a href="${appUrl}/documents" style="display:inline-block;background:#CC0000;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
              Valider maintenant
            </a>
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
          <p style="color:#94a3b8;font-size:12px">${clubName}</p>
        </div>`,
    }));

    const results = await sendResendBatched(resendKey, payloads);
    const sent = results.filter(r => r.ok).length;

    return new Response(JSON.stringify({ success: true, sent, total: payloads.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-charte-reminder error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
