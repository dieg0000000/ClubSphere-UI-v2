import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/get-from-address.ts";
import { sendResendBatched } from "../_shared/send-resend-batched.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Recipient {
  email: string;
  first_name: string;
  last_name: string;
  user_id?: string | null;
  registration?: {
    id: string;
    guest_count: number;
    total_amount: number | null;
    payment_mode: string | null;
    tariff_label?: string | null;
  };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length === 0 || t.length > 254) return false;
  if (t.includes("\n") || t.includes("\r")) return false;
  return EMAIL_REGEX.test(t);
}

function classifyType(rawType: string | null | undefined): "repas" | "tournoi" | "ag" | "evenement" {
  const t = (rawType || "").toLowerCase();
  if (t.includes("repas") || t.includes("support meal") || t.includes("soutien")) return "repas";
  if (t.includes("tournoi") || t.includes("tournament")) return "tournoi";
  if (t.includes("ag") || t.includes("assembl") || t.includes("general assembly")) return "ag";
  return "evenement";
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

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      serviceRoleKey
    );

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
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
    }

    const body = await req.json();
    const event_id: string | undefined = body.event_id;
    const force: boolean = !!body.force;
    const daysBeforeRaw = body.days_before ?? body.reminder_type;
    const days_before = typeof daysBeforeRaw === "string" ? parseInt(daysBeforeRaw, 10) : daysBeforeRaw;

    if (!event_id || !Number.isInteger(days_before) || days_before < 1 || days_before > 30) {
      return new Response(
        JSON.stringify({ error: "event_id et days_before (entier 1..30) requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: event, error: eventError } = await supabaseAdmin
      .from("events")
      .select("*")
      .eq("id", event_id)
      .maybeSingle();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ error: "Evenement introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("event_reminders_sent")
      .select("id, sent_at")
      .eq("event_id", event_id)
      .eq("days_before", days_before)
      .maybeSingle();

    if (existing && !force) {
      return new Response(
        JSON.stringify({
          success: true,
          sent_count: 0,
          skipped_count: 0,
          already_sent: true,
          sent_at: existing.sent_at,
          message: "Rappel deja envoye. Utilisez force=true pour renvoyer.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: clubSettings } = await supabaseAdmin
      .from("club_settings")
      .select("*")
      .maybeSingle();

    const clubName = clubSettings?.club_name || clubSettings?.name || "Club";
    const clubEmail = clubSettings?.club_email || clubSettings?.contact_email || "noreply@club.ch";
    const fromAddress = await getFromAddress(supabaseAdmin);
    const clubPhone = clubSettings?.contact_phone || clubSettings?.club_phone || "";
    const clubAddress = clubSettings?.address || clubSettings?.club_address || "";
    const logoUrl = clubSettings?.logo_url || "";
    const primaryColor = clubSettings?.primary_color || "#cc0000";
    const primaryDark = clubSettings?.primary_dark || "#990000";

    const category = classifyType(event.type);

    const recipients: Recipient[] = [];
    const seen = new Set<string>();
    const addRecipient = (r: Recipient) => {
      const key = r.email.toLowerCase().trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      recipients.push(r);
    };

    const fetchRegistrations = async () => {
      const { data: regs } = await supabaseAdmin
        .from("event_ext_registrations")
        .select("id, registrant_first_name, registrant_last_name, registrant_email, guest_count, total_amount, payment_mode, tariff_id, event_tariffs(label)")
        .eq("event_id", event_id)
        .eq("status", "confirmed");
      return regs || [];
    };

    if (category === "repas") {
      const regs = await fetchRegistrations();
      for (const r of regs) {
        if (!r.registrant_email) continue;
        addRecipient({
          email: r.registrant_email,
          first_name: r.registrant_first_name || "",
          last_name: r.registrant_last_name || "",
          registration: {
            id: r.id,
            guest_count: r.guest_count || 0,
            total_amount: r.total_amount,
            payment_mode: r.payment_mode,
            // deno-lint-ignore no-explicit-any
            tariff_label: (r as any).event_tariffs?.label || null,
          },
        });
      }
    } else if (category === "tournoi") {
      const { data: volunteers } = await supabaseAdmin
        .from("event_volunteers")
        .select("email, first_name, last_name, status")
        .eq("event_id", event_id)
        .neq("status", "refused");
      for (const v of volunteers || []) {
        if (v?.email) {
          addRecipient({ email: v.email, first_name: v.first_name || "", last_name: v.last_name || "" });
        }
      }
      const { data: staff } = await supabaseAdmin
        .from("profiles")
        .select("id, email, first_name, full_name, role")
        .in("role", ["admin", "committee", "president", "vice_president"]);
      for (const p of staff || []) {
        if (!p.email) continue;
        const fn = p.first_name || (p.full_name || "").split(" ")[0] || "";
        const ln = (p.full_name || "").split(" ").slice(1).join(" ");
        addRecipient({ email: p.email, first_name: fn, last_name: ln, user_id: p.id });
      }
    } else if (category === "ag") {
      const { data: members } = await supabaseAdmin
        .from("profiles")
        .select("id, email, first_name, full_name, role")
        .in("role", ["member", "parent", "admin", "committee", "president", "vice_president"]);
      for (const p of members || []) {
        if (!p.email) continue;
        const fn = p.first_name || (p.full_name || "").split(" ")[0] || "";
        const ln = (p.full_name || "").split(" ").slice(1).join(" ");
        addRecipient({ email: p.email, first_name: fn, last_name: ln, user_id: p.id });
      }
    } else {
      const regs = event.is_registerable ? await fetchRegistrations() : [];
      if (regs.length > 0) {
        for (const r of regs) {
          if (!r.registrant_email) continue;
          addRecipient({
            email: r.registrant_email,
            first_name: r.registrant_first_name || "",
            last_name: r.registrant_last_name || "",
            registration: {
              id: r.id,
              guest_count: r.guest_count || 0,
              total_amount: r.total_amount,
              payment_mode: r.payment_mode,
              // deno-lint-ignore no-explicit-any
              tariff_label: (r as any).event_tariffs?.label || null,
            },
          });
        }
      } else {
        const { data: all } = await supabaseAdmin
          .from("profiles")
          .select("id, email, first_name, full_name")
          .not("email", "is", null);
        for (const p of all || []) {
          if (!p.email) continue;
          const fn = p.first_name || (p.full_name || "").split(" ")[0] || "";
          const ln = (p.full_name || "").split(" ").slice(1).join(" ");
          addRecipient({ email: p.email, first_name: fn, last_name: ln, user_id: p.id });
        }
      }
    }

    const dayLabel = days_before === 1 ? "demain" : `dans ${days_before} jours`;
    const subject = days_before === 1
      ? `Rappel — ${event.title} demain !`
      : `Rappel — ${event.title} dans ${days_before} jours`;

    const eventDate = new Date(event.date).toLocaleDateString("fr-CH", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const publicAppUrl = (clubSettings?.app_url as string | undefined) || supabaseUrl.replace(".supabase.co", ".vercel.app");

    const buildEmailHtml = (rec: Recipient) => {
      const registeredBlock = rec.registration
        ? `
        <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:18px;margin:20px 0;border-radius:6px;">
          <p style="margin:0 0 10px 0;color:#166534;font-weight:700;font-size:14px;">Votre inscription</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#1f2937;">
            ${rec.registration.tariff_label ? `<tr><td style="padding:4px 0;color:#64748b;">Tarif:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${rec.registration.tariff_label}</td></tr>` : ""}
            <tr><td style="padding:4px 0;color:#64748b;">Personnes:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${1 + (rec.registration.guest_count || 0)}</td></tr>
            ${rec.registration.total_amount != null ? `<tr><td style="padding:4px 0;color:#64748b;">Montant total:</td><td style="padding:4px 0;text-align:right;font-weight:600;">CHF ${Number(rec.registration.total_amount).toFixed(2)}</td></tr>` : ""}
            ${rec.registration.payment_mode ? `<tr><td style="padding:4px 0;color:#64748b;">Paiement:</td><td style="padding:4px 0;text-align:right;font-weight:600;">${rec.registration.payment_mode === "invoice" ? "Facture" : "Cash / Carte"}</td></tr>` : ""}
          </table>
        </div>`
        : event.is_registerable
        ? `
        <div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:18px;margin:20px 0;border-radius:6px;">
          <p style="margin:0 0 10px 0;color:#92400e;font-weight:600;font-size:14px;">Vous n'etes pas encore inscrit(e).</p>
          <a href="${publicAppUrl}/events/${event.id}" style="display:inline-block;margin-top:6px;background:${primaryColor};color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">S'inscrire maintenant</a>
        </div>`
        : "";

      return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:linear-gradient(135deg,${primaryColor} 0%,${primaryDark} 100%);padding:32px 30px;text-align:center;border-radius:8px 8px 0 0;">
            ${logoUrl ? `<img src="${logoUrl}" alt="${clubName}" style="max-height:60px;margin-bottom:10px;" />` : ""}
            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${clubName}</h1>
            <p style="margin:6px 0 0 0;color:rgba(255,255,255,0.9);font-size:13px;">Rappel d'evenement</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px 30px;">
            <p style="margin:0 0 16px 0;color:#1f2937;font-size:16px;line-height:1.6;">Bonjour <strong>${rec.first_name || rec.last_name || ""}</strong>,</p>
            <p style="margin:0 0 18px 0;color:#1f2937;font-size:15px;line-height:1.6;">
              Petit rappel : <strong>${event.title}</strong> a lieu <strong>${dayLabel}</strong>.
            </p>
            <div style="background:#eff6ff;border-left:4px solid ${primaryColor};padding:18px;margin:18px 0;border-radius:6px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
                <tr><td style="padding:6px 0;color:#64748b;">Evenement:</td><td style="padding:6px 0;color:#1f2937;font-weight:600;text-align:right;">${event.title}</td></tr>
                <tr><td style="padding:6px 0;color:#64748b;">Date:</td><td style="padding:6px 0;color:#1f2937;font-weight:600;text-align:right;">${eventDate}</td></tr>
                ${event.location ? `<tr><td style="padding:6px 0;color:#64748b;">Lieu:</td><td style="padding:6px 0;color:#1f2937;font-weight:600;text-align:right;">${event.location}</td></tr>` : ""}
                ${event.type ? `<tr><td style="padding:6px 0;color:#64748b;">Type:</td><td style="padding:6px 0;color:#1f2937;font-weight:600;text-align:right;">${event.type}</td></tr>` : ""}
              </table>
            </div>
            ${registeredBlock}
            <p style="margin:24px 0 0 0;color:#64748b;font-size:13px;line-height:1.6;">A bientot !</p>
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
    };

    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const isSimulated = !resendApiKey;

    const finalSubject = isTestMode ? `[TEST] ${subject}` : subject;

    let sentCount = 0;
    let failedCount = 0;
    let skippedCount = 0;
    const errors: { email: string; reason: string }[] = [];
    const logRows: Array<{
      event_type: string;
      recipient_id: string | null;
      channel: string;
      payload: Record<string, unknown>;
      success: boolean;
    }> = [];

    const valid: Recipient[] = [];
    for (const r of recipients) {
      if (!isValidEmail(r.email)) {
        skippedCount++;
        const reason = !r.email ? "email_missing" : "email_invalid_format";
        errors.push({ email: r.email || "", reason });
        logRows.push({
          event_type: "event_reminder",
          recipient_id: r.user_id ?? null,
          channel: "email",
          payload: { email: r.email || null, event_id, days_before, error: reason },
          success: false,
        });
        continue;
      }
      valid.push(r);
    }

    const attemptedCount = valid.length;

    if (isSimulated) {
      for (const rec of valid) {
        console.log("SIMULATED REMINDER:", { to: isTestMode ? testRedirect : rec.email, subject: finalSubject });
        sentCount++;
        logRows.push({
          event_type: "event_reminder",
          recipient_id: rec.user_id ?? null,
          channel: "email",
          payload: { email: rec.email, delivered_to: isTestMode ? testRedirect : rec.email, event_id, days_before, simulated: true, test_mode: isTestMode },
          success: true,
        });
      }
    } else {
      const payloads = valid.map(rec => ({
        from: fromAddress,
        to: [isTestMode ? testRedirect : rec.email],
        reply_to: clubEmail,
        subject: finalSubject,
        html: buildEmailHtml(rec),
      }));
      const results = await sendResendBatched(resendApiKey!, payloads);
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const rec = valid[i];
        if (r.ok) {
          sentCount++;
          logRows.push({
            event_type: "event_reminder",
            recipient_id: rec.user_id ?? null,
            channel: "email",
            payload: { email: rec.email, delivered_to: isTestMode ? testRedirect : rec.email, event_id, days_before, test_mode: isTestMode },
            success: true,
          });
        } else {
          failedCount++;
          const err = r.error ?? "unknown";
          errors.push({ email: rec.email, reason: err });
          logRows.push({
            event_type: "event_reminder",
            recipient_id: rec.user_id ?? null,
            channel: "email",
            payload: { email: rec.email, delivered_to: isTestMode ? testRedirect : rec.email, event_id, days_before, error: err, test_mode: isTestMode },
            success: false,
          });
        }
      }
    }

    const cappedErrors = errors.slice(0, 50);

    const { data: prior } = await supabaseAdmin
      .from("event_reminders_sent")
      .select("attempted_count, sent_count, failed_count, skipped_count, errors")
      .eq("event_id", event_id)
      .eq("days_before", days_before)
      .maybeSingle();

    const priorErrors = Array.isArray(prior?.errors) ? prior!.errors : [];
    const allErrors = [...priorErrors, ...cappedErrors];
    const finalErrors = allErrors.slice(-50);

    await supabaseAdmin
      .from("event_reminders_sent")
      .upsert(
        {
          event_id,
          days_before,
          sent_at: new Date().toISOString(),
          attempted_count: (prior?.attempted_count ?? 0) + attemptedCount,
          sent_count: (prior?.sent_count ?? 0) + sentCount,
          failed_count: (prior?.failed_count ?? 0) + failedCount,
          skipped_count: (prior?.skipped_count ?? 0) + skippedCount,
          errors: finalErrors.length > 0 ? finalErrors : null,
        },
        { onConflict: "event_id,days_before" }
      );

    if (logRows.length > 0) {
      const { error: logError } = await supabaseAdmin.from("notification_log").insert(logRows);
      if (logError) console.error("notification_log insert failed:", logError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_count: sentCount,
        failed_count: failedCount,
        skipped_count: skippedCount,
        attempted_count: attemptedCount,
        recipient_count: recipients.length,
        simulated: isSimulated,
        errors: cappedErrors.length > 0 ? cappedErrors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      // deno-lint-ignore no-explicit-any
      JSON.stringify({ error: (error as any).message || "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
