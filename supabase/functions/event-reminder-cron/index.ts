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
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const { data: config } = await supabaseAdmin
      .from("club_notification_config")
      .select("enabled, reminder_days_array")
      .eq("notification_type", "event_reminder")
      .maybeSingle();

    if (!config || !config.enabled) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "event_reminder disabled in club_notification_config" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reminderDays: number[] = Array.isArray(config.reminder_days_array) && config.reminder_days_array.length > 0
      ? config.reminder_days_array
      : [];

    if (reminderDays.length === 0) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "no reminder_days configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: events } = await supabaseAdmin
      .from("events")
      .select("id, title, date")
      .gte("date", new Date().toISOString());

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const results: Array<{ event_id: string; days_before: number; sent_count?: number; error?: string; skipped?: boolean }> = [];

    for (const ev of events || []) {
      const eventDay = new Date(ev.date);
      eventDay.setUTCHours(0, 0, 0, 0);
      const daysUntil = Math.round((eventDay.getTime() - today.getTime()) / 86400000);

      if (!reminderDays.includes(daysUntil)) continue;

      const { data: alreadySent } = await supabaseAdmin
        .from("event_reminders_sent")
        .select("id, sent_count, attempted_count")
        .eq("event_id", ev.id)
        .eq("days_before", daysUntil)
        .maybeSingle();

      if (alreadySent && ((alreadySent.sent_count ?? 0) > 0 || (alreadySent.attempted_count ?? 0) >= 5)) {
        results.push({
          event_id: ev.id,
          days_before: daysUntil,
          skipped: true,
          sent_count: alreadySent.sent_count ?? 0,
          attempted_count: alreadySent.attempted_count ?? 0,
        });
        continue;
      }

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-event-reminder`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ event_id: ev.id, days_before: daysUntil }),
        });
        const json = await resp.json();
        results.push({ event_id: ev.id, days_before: daysUntil, sent_count: json.sent_count });
      } catch (err) {
        // deno-lint-ignore no-explicit-any
        results.push({ event_id: ev.id, days_before: daysUntil, error: (err as any).message || String(err) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
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
