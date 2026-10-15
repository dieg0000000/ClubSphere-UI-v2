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

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceRole = token === serviceRoleKey;

    if (!isServiceRole) {
      const userClient = createClient(
        supabaseUrl,
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

      const allowedRoles = ["admin", "president", "vice_president", "responsable_technique", "committee", "coach"];
      const isAllowed = allowedRoles.includes(profile?.role);

      const { data: coachRow } = await supabaseAdmin
        .from("coaches")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const { data: accessRow } = await supabaseAdmin
        .from("committee_access")
        .select("can_edit")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (!isAllowed && !coachRow && !accessRow?.can_edit) {
        return new Response(
          JSON.stringify({ error: "Accès non autorisé" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const session_id: string | undefined = body.session_id;
    const force: boolean = !!body.force;
    const daysBeforeRaw = body.days_before;
    const days_before = typeof daysBeforeRaw === "string" ? parseInt(daysBeforeRaw, 10) : daysBeforeRaw;

    if (!session_id || !Number.isInteger(days_before) || days_before < 0 || days_before > 60) {
      return new Response(
        JSON.stringify({ error: "session_id et days_before (entier 0..60) requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!force) {
      const { data: cfg } = await supabaseAdmin
        .from("club_notification_config")
        .select("enabled")
        .eq("notification_type", "training_reminder")
        .maybeSingle();
      if (!cfg || !cfg.enabled) {
        return new Response(
          JSON.stringify({ success: true, sent_count: 0, skipped_count: 0, skipped: true, reason: "training_reminder disabled" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("training_sessions")
      .select(`
        id, session_date, notes, cancelled, team_id,
        teams(id, name),
        terrain_slots(day, start_time, end_time, terrain_id, terrains(name, location))
      `)
      .eq("id", session_id)
      .maybeSingle();

    if (sessionError) {
      console.error("Session query error:", sessionError);
      return new Response(
        JSON.stringify({ error: `Erreur base de donnees: ${sessionError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!session) {
      return new Response(
        JSON.stringify({ error: "Seance d'entrainement introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (session.cancelled) {
      return new Response(
        JSON.stringify({ success: true, sent_count: 0, skipped_count: 0, skipped: true, reason: "session cancelled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!force) {
      const { data: existing } = await supabaseAdmin
        .from("training_reminders_sent")
        .select("id, sent_at")
        .eq("session_id", session_id)
        .eq("days_before", days_before)
        .maybeSingle();
      if (existing) {
        return new Response(
          JSON.stringify({ success: true, sent_count: 0, skipped_count: 0, already_sent: true, sent_at: existing.sent_at }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const { data: clubSettings } = await supabaseAdmin
      .from("club_settings")
      .select("*")
      .maybeSingle();

    const clubName = clubSettings?.club_name || clubSettings?.name || "Club";
    const clubEmail = clubSettings?.club_email || clubSettings?.contact_email || "noreply@club.ch";
    const fromAddress = await getFromAddress(supabaseAdmin);
    const logoUrl = clubSettings?.logo_url || "";
    const primaryColor = clubSettings?.primary_color || "#cc0000";
    const primaryDark = clubSettings?.primary_dark || "#990000";

    console.log("[training-reminder] session_id:", session_id, "team_id:", session.team_id);

    const { data: teamMembers, error: teamMembersError } = await supabaseAdmin
      .from("members")
      .select("id")
      .eq("team_id", session.team_id);

    console.log("[training-reminder] team members fetched:", (teamMembers || []).length, "error:", teamMembersError?.message || null);

    const { data: attendanceRows, error: attendanceError } = await supabaseAdmin
      .from("training_attendance")
      .select("member_id, responded_at")
      .eq("session_id", session_id);

    console.log("[training-reminder] attendance rows fetched:", (attendanceRows || []).length, "error:", attendanceError?.message || null);

    const respondedIds = new Set<string>(
      (attendanceRows || [])
        .filter((a: { responded_at: string | null }) => a.responded_at !== null)
        .map((a: { member_id: string }) => a.member_id)
    );

    console.log("[training-reminder] responded member ids:", respondedIds.size);

    const pendingMemberIds: string[] = (teamMembers || [])
      .map((m: { id: string }) => m.id)
      .filter((id: string) => !respondedIds.has(id));

    console.log("[training-reminder] pending member ids:", pendingMemberIds.length, pendingMemberIds);

    if (pendingMemberIds.length === 0) {
      return new Response(
        JSON.stringify({ success: true, sent_count: 0, skipped_count: 0, message: "Aucun joueur en attente de reponse" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: members } = await supabaseAdmin
      .from("members")
      .select("id, first_name, last_name, email, legal_rep1_email, legal_rep1_firstname, legal_rep2_email, legal_rep2_firstname")
      .in("id", pendingMemberIds);

    const { data: parentLinks } = await supabaseAdmin
      .from("parent_members")
      .select("member_id, parent_user_id")
      .in("member_id", pendingMemberIds);

    const parentUserIds = Array.from(new Set((parentLinks || []).map((p: { parent_user_id: string }) => p.parent_user_id)));
    const parentProfiles: Record<string, { email: string; first_name: string }> = {};
    if (parentUserIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, email, first_name")
        .in("id", parentUserIds);
      for (const p of profs || []) {
        parentProfiles[p.id] = { email: p.email || "", first_name: p.first_name || "" };
      }
    }
    const memberToParents: Record<string, string[]> = {};
    for (const link of parentLinks || []) {
      if (!memberToParents[link.member_id]) memberToParents[link.member_id] = [];
      memberToParents[link.member_id].push(link.parent_user_id);
    }

    const recipients: Recipient[] = [];
    const seen = new Set<string>();
    const addRecipient = (email: string | null | undefined, first_name: string) => {
      if (!email) return;
      const key = email.toLowerCase().trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      recipients.push({ email: email.trim(), first_name });
    };

    for (const m of members || []) {
      addRecipient(m.email, m.first_name || "");
      const linkedParents = memberToParents[m.id] || [];
      for (const pid of linkedParents) {
        const prof = parentProfiles[pid];
        if (prof) addRecipient(prof.email, prof.first_name || "");
      }
      addRecipient(m.legal_rep1_email, m.legal_rep1_firstname || "");
      addRecipient(m.legal_rep2_email, m.legal_rep2_firstname || "");
    }

    console.log("[training-reminder] final recipients:", recipients.length, recipients.map(r => r.email));

    const teamName = (session as { teams?: { name?: string } }).teams?.name || "votre equipe";
    const slot = (session as { terrain_slots?: { start_time?: string; end_time?: string; terrains?: { name?: string; address?: string } } }).terrain_slots;
    const sessionDate = new Date(session.session_date).toLocaleDateString("fr-CH", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
    const timeRange = slot?.start_time && slot?.end_time
      ? `${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}`
      : "";
    const terrainInfo = (slot as { terrains?: { name?: string; location?: string } })?.terrains;
    const location = terrainInfo?.name
      ? `${terrainInfo.name}${terrainInfo.location ? ` (${terrainInfo.location})` : ""}`
      : "";

    const appUrl = Deno.env.get("APP_URL") || "https://localhost:5173";
    const presentUrl = `${appUrl}/training/${session_id}/respond?status=present`;
    const absentUrl = `${appUrl}/training/${session_id}/respond?status=absent`;

    const subject = days_before === 1
      ? `Rappel — Entrainement demain (${teamName})`
      : `Rappel — Entrainement dans ${days_before} jours (${teamName})`;

    const buildHtml = (rec: Recipient) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${subject}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background-color:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f5f5f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr><td style="background:linear-gradient(135deg,${primaryColor} 0%,${primaryDark} 100%);padding:32px 30px;text-align:center;border-radius:8px 8px 0 0;">
          ${logoUrl
            ? `<img src="${logoUrl}" alt="${clubName}" style="width:96px;height:auto;display:block;margin:0 auto 8px;" />`
            : `<h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${clubName}</h1>`
          }
          <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">Rappel d'entrainement</p>
        </td></tr>
        <tr><td style="padding:32px 30px;">
          <p style="margin:0 0 16px;color:#1f2937;font-size:16px;line-height:1.6;">
            Bonjour <strong>${rec.first_name || ""}</strong>,
          </p>
          <p style="margin:0 0 20px;color:#1f2937;font-size:15px;line-height:1.6;">
            Vous n'avez pas encore confirme votre presence a l'entrainement suivant :
          </p>
          <div style="background-color:#f9fafb;border-left:4px solid ${primaryColor};padding:16px 20px;border-radius:4px;margin-bottom:24px;">
            <p style="margin:0 0 6px;color:#1f2937;font-size:15px;font-weight:600;">${teamName}</p>
            <p style="margin:0 0 4px;color:#374151;font-size:14px;">${sessionDate}</p>
            ${timeRange ? `<p style="margin:0 0 4px;color:#374151;font-size:14px;">Horaire : ${timeRange}</p>` : ""}
            ${location ? `<p style="margin:0;color:#374151;font-size:14px;">Lieu : ${location}</p>` : ""}
          </div>
          <p style="margin:0 0 20px;color:#1f2937;font-size:15px;line-height:1.6;">
            Merci de confirmer votre presence en cliquant sur l'un des boutons ci-dessous :
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr>
              <td align="center" style="padding:6px;">
                <a href="${presentUrl}" style="display:inline-block;background-color:#16a34a;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
                  Je serai present(e)
                </a>
              </td>
              <td align="center" style="padding:6px;">
                <a href="${absentUrl}" style="display:inline-block;background-color:#dc2626;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">
                  Je serai absent(e)
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.5;text-align:center;">
            Si vous avez deja repondu, vous pouvez ignorer ce message.
          </p>
        </td></tr>
        <tr><td style="background-color:#f9fafb;padding:20px 30px;text-align:center;border-radius:0 0 8px 8px;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#6b7280;font-size:13px;">${clubName}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const isSimulated = !resendApiKey;
    const finalSubject = isTestMode ? `[TEST] ${subject}` : subject;
    let sentCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    if (isSimulated) {
      for (const rec of recipients) {
        console.log("SIMULATED TRAINING REMINDER:", { to: isTestMode ? testRedirect : rec.email, subject: finalSubject });
        sentCount++;
      }
    } else {
      const payloads = recipients.map(rec => ({
        from: fromAddress,
        to: [isTestMode ? testRedirect : rec.email],
        reply_to: clubEmail,
        subject: finalSubject,
        html: buildHtml(rec),
      }));
      const results = await sendResendBatched(resendApiKey!, payloads);
      for (const r of results) {
        if (r.ok) sentCount++;
        else {
          skippedCount++;
          errors.push(`${r.email}: ${r.error ?? "unknown"}`);
        }
      }
    }

    if (sentCount > 0 || force) {
      await supabaseAdmin
        .from("training_reminders_sent")
        .upsert(
          { session_id, days_before, sent_at: new Date().toISOString(), recipients_count: sentCount },
          { onConflict: "session_id,days_before" }
        );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_count: sentCount,
        skipped_count: skippedCount,
        recipient_count: recipients.length,
        pending_members: pendingMemberIds.length,
        simulated: isSimulated,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as { message?: string }).message || "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
