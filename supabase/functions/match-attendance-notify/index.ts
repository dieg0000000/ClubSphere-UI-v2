import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
    const { action, match_id } = body;

    if (action === "send_j10" || action === "simulate") {
      return await handleJ10Notifications(supabaseAdmin, action === "simulate" ? match_id : null, corsHeaders);
    }

    if (action === "send_reminders") {
      return await handleReminders(supabaseAdmin, corsHeaders);
    }

    if (action === "send_j10_for_match") {
      return await handleJ10ForMatch(supabaseAdmin, match_id, corsHeaders);
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Use: send_j10, send_reminders, send_j10_for_match, simulate" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function handleJ10Notifications(supabase: any, specificMatchId: string | null, corsHeaders: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let matchQuery = supabase
    .from("matches")
    .select(`
      id, match_date, match_time, opponent_name, is_home, designation,
      teams (id, name),
      venues (name, city, field_name)
    `)
    .eq("status", "planifié");

  if (specificMatchId) {
    matchQuery = matchQuery.eq("id", specificMatchId);
  } else {
    const j10 = new Date(today);
    j10.setDate(j10.getDate() + 10);
    const j10Str = j10.toISOString().split("T")[0];
    matchQuery = matchQuery.eq("match_date", j10Str);
  }

  const { data: matches, error: matchError } = await matchQuery;
  if (matchError) throw matchError;
  if (!matches || matches.length === 0) {
    return new Response(
      JSON.stringify({ success: true, message: "Aucun match trouvé", processed: 0 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let totalProcessed = 0;
  const results: any[] = [];

  for (const match of matches) {
    const teamId = match.teams?.id;
    if (!teamId) continue;

    const { data: members } = await supabase
      .from("members")
      .select("id, first_name, last_name, email")
      .eq("team_id", teamId);

    if (!members || members.length === 0) continue;

    const matchLabel = buildMatchLabel(match);
    const dateLabel = formatDateFR(match.match_date);
    const timeLabel = match.match_time ? formatTime(match.match_time) : "heure à confirmer";
    const venueLabel = match.venues
      ? (match.venues.field_name
        ? `${match.venues.name} – ${match.venues.field_name}, ${match.venues.city}`
        : `${match.venues.name}, ${match.venues.city}`)
      : "lieu à confirmer";

    for (const member of members) {
      const { data: existing } = await supabase
        .from("match_attendance")
        .select("id, notified_at")
        .eq("match_id", match.id)
        .eq("member_id", member.id)
        .maybeSingle();

      if (existing && existing.notified_at && !specificMatchId) continue;

      if (!existing) {
        await supabase.from("match_attendance").insert({
          match_id: match.id,
          member_id: member.id,
          status: "pending",
          notified_at: new Date().toISOString(),
        });
      } else {
        await supabase
          .from("match_attendance")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", existing.id);
      }

      const messageText = `Bonjour ${member.first_name}, le match ${matchLabel} aura lieu le ${dateLabel} à ${timeLabel} au ${venueLabel}. Ta présence est OBLIGATOIRE. Merci de confirmer ta présence ou de nous informer de ton absence avec une raison.`;

      await sendInAppMessage(supabase, member, match, messageText, "j10");

      const { data: parentLinks } = await supabase
        .from("parent_members")
        .select("parent_user_id, profiles!parent_user_id(id, first_name, last_name, email)")
        .eq("member_id", member.id);

      if (parentLinks && parentLinks.length > 0) {
        for (const link of parentLinks) {
          if (link.profiles) {
            const parentMsg = `Bonjour, le match ${matchLabel} pour ${member.first_name} ${member.last_name} aura lieu le ${dateLabel} à ${timeLabel} au ${venueLabel}. La présence est OBLIGATOIRE. Merci de confirmer la présence ou de nous informer de l'absence avec une raison.`;
            await sendInAppMessage(supabase, link.profiles, match, parentMsg, "j10_parent");
          }
        }
      }

      totalProcessed++;
    }

    results.push({ match: matchLabel, members_notified: members.length });
  }

  return new Response(
    JSON.stringify({ success: true, processed: totalProcessed, matches: results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function handleJ10ForMatch(supabase: any, matchId: string, corsHeaders: any) {
  if (!matchId) {
    return new Response(
      JSON.stringify({ error: "match_id requis" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  return await handleJ10Notifications(supabase, matchId, corsHeaders);
}

async function handleReminders(supabase: any, corsHeaders: any) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const j5 = new Date(today);
  j5.setDate(j5.getDate() + 5);
  const j3 = new Date(today);
  j3.setDate(j3.getDate() + 3);

  const j5Str = j5.toISOString().split("T")[0];
  const j3Str = j3.toISOString().split("T")[0];

  let remindersJ5 = 0;
  let remindersJ3 = 0;

  for (const [dateStr, reminderType] of [[j5Str, "j5"], [j3Str, "j3"]]) {
    const { data: matches } = await supabase
      .from("matches")
      .select(`id, match_date, opponent_name, is_home, teams(name), venues(name, city, field_name)`)
      .eq("match_date", dateStr)
      .eq("status", "planifié");

    if (!matches) continue;

    for (const match of matches) {
      const col = reminderType === "j5" ? "reminded_at_5" : "reminded_at_3";
      const { data: pending } = await supabase
        .from("match_attendance")
        .select(`id, member_id, ${col}, members(first_name, last_name, email)`)
        .eq("match_id", match.id)
        .eq("status", "pending")
        .is(col, null);

      if (!pending) continue;

      for (const att of pending) {
        if (!att.members) continue;
        const member = att.members;

        const dateLabel = formatDateFR(match.match_date);
        let messageText = "";
        if (reminderType === "j5") {
          messageText = `Rappel: Tu n'as pas encore confirmé ta présence pour le match contre ${match.opponent_name} le ${dateLabel}. Merci de répondre dès que possible.`;
        } else {
          messageText = `DERNIER RAPPEL: Le match vs ${match.opponent_name} a lieu dans 3 jours (${dateLabel}). Tu dois impérativement confirmer ou justifier ton absence avant demain.`;
          await supabase
            .from("match_attendance")
            .update({ status: "absent_unjustified" })
            .eq("match_id", match.id)
            .eq("member_id", att.member_id)
            .eq("status", "pending")
            .lt("match_date", today.toISOString().split("T")[0]);
        }

        await sendInAppMessage(supabase, member, match, messageText, reminderType);
        await supabase
          .from("match_attendance")
          .update({ [col]: new Date().toISOString() })
          .eq("id", att.id);

        if (reminderType === "j5") remindersJ5++;
        else remindersJ3++;
      }
    }
  }

  return new Response(
    JSON.stringify({ success: true, reminders_j5: remindersJ5, reminders_j3: remindersJ3 }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function sendInAppMessage(supabase: any, recipient: any, match: any, text: string, type: string) {
  try {
    const { data: clubConv } = await supabase
      .from("conversations")
      .select("id")
      .eq("type", "club_announcement")
      .maybeSingle();

    if (!clubConv) return;

    const { data: adminProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("role", "admin")
      .maybeSingle();

    if (!adminProfile) return;

    await supabase.from("messages").insert({
      conversation_id: clubConv.id,
      sender_id: adminProfile.id,
      content: text,
      metadata: { type: "match_attendance_notification", match_id: match.id, notification_type: type },
    });
  } catch (err) {
    console.error("sendInAppMessage error:", err);
  }
}

function buildMatchLabel(match: any): string {
  const teamName = match.teams?.name ?? "Notre équipe";
  if (match.is_home) return `${teamName} vs ${match.opponent_name}`;
  return `${match.opponent_name} vs ${teamName}`;
}

function formatDateFR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  const months = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  const days = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
  return `${days[date.getDay()]} ${Number(d)} ${months[Number(m) - 1]} ${y}`;
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(":");
  return `${h}h${m}`;
}
