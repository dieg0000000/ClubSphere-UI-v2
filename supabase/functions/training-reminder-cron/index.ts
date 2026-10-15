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
      .eq("notification_type", "training_reminder")
      .maybeSingle();

    if (!config || !config.enabled) {
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: "training_reminder disabled" }),
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

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const { data: sessions } = await supabaseAdmin
      .from("training_sessions")
      .select("id, session_date, cancelled")
      .gte("session_date", todayStr)
      .neq("cancelled", true);

    const results: Array<{ session_id: string; days_before: number; sent_count?: number; error?: string; skipped?: boolean }> = [];

    for (const s of sessions || []) {
      const sessionDay = new Date(s.session_date + "T00:00:00Z");
      const daysUntil = Math.round((sessionDay.getTime() - today.getTime()) / 86400000);

      if (!reminderDays.includes(daysUntil)) continue;

      const { data: alreadySent } = await supabaseAdmin
        .from("training_reminders_sent")
        .select("id")
        .eq("session_id", s.id)
        .eq("days_before", daysUntil)
        .maybeSingle();

      if (alreadySent) {
        results.push({ session_id: s.id, days_before: daysUntil, skipped: true });
        continue;
      }

      try {
        const resp = await fetch(`${supabaseUrl}/functions/v1/send-training-reminder`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ session_id: s.id, days_before: daysUntil }),
        });
        const json = await resp.json();
        results.push({ session_id: s.id, days_before: daysUntil, sent_count: json.sent_count });
      } catch (err) {
        results.push({ session_id: s.id, days_before: daysUntil, error: (err as { message?: string }).message || String(err) });
      }
    }

    return new Response(
      JSON.stringify({ success: true, processed: results.length, results }),
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
