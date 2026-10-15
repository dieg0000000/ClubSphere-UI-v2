import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/get-from-address.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 1000;

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

    const { document_id, recipients, is_test } = await req.json();
    if (!document_id || !Array.isArray(recipients) || recipients.length === 0) {
      return new Response(JSON.stringify({ error: "document_id et recipients requis" }), {
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
    const seasonName = (doc as { seasons?: { name?: string } | null }).seasons?.name ?? "";
    const appUrl = Deno.env.get("APP_URL") ?? "https://app.clubsphere.ch";

    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY non configuré" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const fromAddress = await getFromAddress(supabaseAdmin);
    const replyTo = (clubSettings as { club_email?: string })?.club_email || undefined;

    const testRedirectRaw = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const testRedirect = testRedirectRaw && /.+@.+\..+/.test(testRedirectRaw) ? testRedirectRaw : null;

    type Recipient = { email: string; user_id?: string | null; member_id?: string | null };
    const uniqueRecipients: Recipient[] = [];
    const seen = new Set<string>();
    for (const r of recipients as Recipient[]) {
      if (!r || typeof r.email !== "string" || !r.email.includes("@")) continue;
      const key = r.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniqueRecipients.push({ email: r.email, user_id: r.user_id ?? null, member_id: r.member_id ?? null });
    }

    const testBadge = is_test
      ? `<div style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;margin-bottom:16px;font-size:12px;font-weight:600">TEST — Ceci est un envoi de test</div>`
      : "";
    const subjectPrefix = is_test ? "[TEST] " : "";

    const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
          ${testBadge}
          <h2>Charte à valider</h2>
          <p>Bonjour,</p>
          <p>Le club vous demande de valider la charte <strong>${doc.title}</strong>${seasonName ? ` pour la saison ${seasonName}` : ""}.</p>
          <p>Merci de la consulter et de la valider en cliquant sur le lien ci-dessous.</p>
          <p style="margin:24px 0">
            <a href="${appUrl}/documents" style="display:inline-block;background:#CC0000;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
              Valider maintenant
            </a>
          </p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
          <p style="color:#94a3b8;font-size:12px">${clubName}</p>
        </div>`;
    const subject = `${subjectPrefix}Charte à valider : ${doc.title}`;

    // Send emails and log results in the background so the frontend gets an immediate response.
    const backgroundWork = async () => {
      type SendResult = { recipient: Recipient; ok: boolean; status: number; error?: string };
      const results: SendResult[] = [];
      for (let i = 0; i < uniqueRecipients.length; i += BATCH_SIZE) {
        const slice = uniqueRecipients.slice(i, i + BATCH_SIZE);
        const batch = await Promise.all(slice.map(async (r): Promise<SendResult> => {
          const deliveryEmail = testRedirect ?? r.email;
          try {
            const resp = await fetch("https://api.resend.com/emails", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${resendKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                from: fromAddress,
                reply_to: replyTo,
                to: [deliveryEmail],
                subject,
                html,
              }),
            });
            if (!resp.ok) {
              return { recipient: r, ok: false, status: resp.status, error: await resp.text() };
            }
            return { recipient: r, ok: true, status: resp.status };
          } catch (err) {
            return { recipient: r, ok: false, status: 0, error: (err as { message?: string }).message || String(err) };
          }
        }));
        results.push(...batch);
        if (i + BATCH_SIZE < uniqueRecipients.length) {
          await new Promise(res => setTimeout(res, BATCH_DELAY_MS));
        }
      }

      if (!is_test) {
        const rows = results
          .filter(r => r.ok)
          .map(r => ({
            document_id,
            recipient_email: r.recipient.email,
            recipient_user_id: r.recipient.user_id,
            recipient_member_id: r.recipient.member_id,
            is_test: false,
            sent_by: user.id,
          }));
        if (rows.length > 0) {
          await supabaseAdmin.from("charte_notifications").insert(rows);
        }
      }

      const logRows = results.map(r => ({
        event_type: "charte_sent",
        recipient_id: r.recipient.user_id ?? null,
        channel: "email",
        success: r.ok,
        payload: {
          document_id,
          recipient_email: r.recipient.email,
          recipient_member_id: r.recipient.member_id,
          is_test: !!is_test,
          test_mode: testRedirect !== null,
          resend_status: r.status,
          error_message: r.ok ? null : (r.error ?? "unknown"),
        },
      }));
      if (logRows.length > 0) {
        await supabaseAdmin.from("notification_log").insert(logRows);
      }
    };

    EdgeRuntime.waitUntil(backgroundWork());

    return new Response(
      JSON.stringify({ success: true, sent: uniqueRecipients.length, total: uniqueRecipients.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("send-charte error:", e);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
