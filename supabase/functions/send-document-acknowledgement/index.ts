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

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { document_id, member_id, validated_by_parent } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: doc } = await supabaseAdmin
      .from("documents")
      .select("id, title, season_id, club_id, seasons(name)")
      .eq("id", document_id)
      .maybeSingle();

    if (!doc) {
      return new Response(JSON.stringify({ error: "Document non trouvé" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!doc.club_id) {
      return new Response(JSON.stringify({ error: "document club introuvable" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ipAddress =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("cf-connecting-ip") ??
      null;

    const now = new Date();

    const { error: insertError } = await supabaseAdmin
      .from("document_acknowledgements")
      .insert({
        document_id,
        club_id: doc.club_id,
        user_id: user.id,
        member_id: member_id ?? null,
        validated_by_parent_id: validated_by_parent && member_id ? user.id : null,
        ip_address: ipAddress,
        email_sent_at: now.toISOString(),
      });

    if (insertError) {
      if (insertError.code === "23505") {
        return new Response(JSON.stringify({ error: "Déjà confirmé" }), {
          status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw insertError;
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("first_name, last_name, email")
      .eq("id", user.id)
      .maybeSingle();

    const { data: clubSettings } = await supabaseAdmin
      .from("club_settings")
      .select("club_name, club_email, sender_email")
      .maybeSingle();

    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const seasonName = (doc as any).seasons?.name ?? "";
    const clubName = clubSettings?.club_name ?? "ClubSphere";
    const dateStr = now.toLocaleDateString("fr-CH", { day: "2-digit", month: "long", year: "numeric" });

    if (resendKey) {
      const fromAddress = await getFromAddress(supabaseAdmin);
      const replyTo = (clubSettings as { club_email?: string })?.club_email || undefined;
      const payloads: ResendPayload[] = [];

      // Email A: confirmation to the validator
      if (profile?.email) {
        const firstName = profile.first_name ?? profile.email;
        const subjectA = `Confirmation — Vous avez validé la charte ${doc.title}`;
        const htmlA = `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
            <h2 style="color:#1e293b">${subjectA}</h2>
            <p>Bonjour ${firstName},</p>
            <p>Nous confirmons que vous avez validé la charte <strong>${doc.title}</strong> le ${dateStr}.</p>
            ${seasonName ? `<p>Saison : ${seasonName}</p>` : ""}
            <p>Cet email vous sert de preuve de validation.</p>
            <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
            <p style="color:#94a3b8;font-size:12px">${clubName}</p>
          </div>`;
        payloads.push({
          from: fromAddress,
          reply_to: replyTo,
          to: [isTestMode ? testRedirect : profile.email],
          subject: isTestMode ? `[TEST] ${subjectA}` : subjectA,
          html: htmlA,
        });
      }

      // Child/Parent cross-notifications
      if (member_id) {
        const { data: member } = await supabaseAdmin
          .from("members")
          .select("first_name, last_name, email")
          .eq("id", member_id)
          .maybeSingle();
        if (member && validated_by_parent) {
          // Email C: info to minor child (if email exists)
          if (member.email) {
            const subjectC = `Votre charte ${doc.title} a été validée par votre représentant légal`;
            const htmlC = `
              <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
                <h2>${subjectC}</h2>
                <p>Bonjour ${member.first_name ?? ""},</p>
                <p>Votre représentant légal <strong>${profile?.first_name ?? ""} ${profile?.last_name ?? ""}</strong> a validé en votre nom la charte <strong>${doc.title}</strong> le ${dateStr}${seasonName ? ` pour la saison ${seasonName}` : ""}.</p>
                <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
                <p style="color:#94a3b8;font-size:12px">${clubName}</p>
              </div>`;
            payloads.push({
              from: fromAddress,
              reply_to: replyTo,
              to: [isTestMode ? testRedirect : member.email],
              subject: isTestMode ? `[TEST] ${subjectC}` : subjectC,
              html: htmlC,
            });
          }
        }
      } else {
        // Self-validation by player ≥ 18. If linked parent, notify parent (Email B)
        const { data: profileEmailRow } = await supabaseAdmin
          .from("profiles").select("email").eq("id", user.id).maybeSingle();
        if (profileEmailRow?.email) {
          const { data: memberRow } = await supabaseAdmin
            .from("members")
            .select("id, first_name, last_name, legal_rep1_email, legal_rep2_email")
            .ilike("email", profileEmailRow.email)
            .maybeSingle();
          if (memberRow) {
            const parentEmails = [memberRow.legal_rep1_email, memberRow.legal_rep2_email].filter(Boolean) as string[];
            for (const pe of parentEmails) {
              const subjectB = `${memberRow.first_name ?? ""} ${memberRow.last_name ?? ""} a validé la charte ${doc.title}`;
              const htmlB = `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1e293b">
                  <h2>${subjectB}</h2>
                  <p>Bonjour,</p>
                  <p>Nous vous informons que <strong>${memberRow.first_name ?? ""} ${memberRow.last_name ?? ""}</strong> a validé la charte <strong>${doc.title}</strong> le ${dateStr}${seasonName ? ` pour la saison ${seasonName}` : ""}.</p>
                  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0"/>
                  <p style="color:#94a3b8;font-size:12px">${clubName}</p>
                </div>`;
              payloads.push({
                from: fromAddress,
                reply_to: replyTo,
                to: [isTestMode ? testRedirect : pe],
                subject: isTestMode ? `[TEST] ${subjectB}` : subjectB,
                html: htmlB,
              });
            }
          }
        }
      }

      if (payloads.length > 0) {
        await sendResendBatched(resendKey, payloads);
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-document-acknowledgement error:", error);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
