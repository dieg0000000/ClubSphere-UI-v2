import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const today = new Date().toISOString().slice(0, 10);

    let renewedCount = 0;
    let revokedCount = 0;
    let skippedCount = 0;
    const errors: Array<{ coach_id: string; stage: string; error: string }> = [];

    // PASS 1 — Auto-renewal post-course
    const { data: renewalCandidates, error: pass1Err } = await supabaseAdmin
      .from("coaches")
      .select("id, user_id, first_name, last_name, qualification_id, diploma_expiry_date, next_js_course_date, next_js_course_name, next_js_course_number, next_js_course_location")
      .not("next_js_course_date", "is", null)
      .lt("next_js_course_date", today)
      .not("qualification_id", "is", null);

    if (pass1Err) {
      console.error("pass1 query error:", pass1Err);
    }

    for (const coach of renewalCandidates || []) {
      try {
        const { data: qual } = await supabaseAdmin
          .from("coaching_qualifications")
          .select("id, name, validity_years")
          .eq("id", coach.qualification_id)
          .maybeSingle();

        const coachName = `${coach.first_name || ""} ${coach.last_name || ""}`.trim();

        if (!qual || !qual.validity_years) {
          skippedCount++;
          await supabaseAdmin.from("notification_log").insert({
            event_type: "coach_diploma_renewal_skipped",
            recipient_id: coach.user_id ?? null,
            channel: "system",
            success: true,
            payload: {
              coach_id: coach.id,
              coach_name: coachName,
              reason: "no_validity_years",
              qualification_id: coach.qualification_id,
              course_date: coach.next_js_course_date,
            },
          });
          continue;
        }

        const newExpiry = addYears(coach.next_js_course_date as string, qual.validity_years as number);
        const oldExpiry = coach.diploma_expiry_date;
        const courseDate = coach.next_js_course_date;
        const courseName = coach.next_js_course_name;

        const { error: updateErr } = await supabaseAdmin
          .from("coaches")
          .update({
            diploma_expiry_date: newExpiry,
            next_js_course_date: null,
            next_js_course_name: null,
            next_js_course_number: null,
            next_js_course_location: null,
          })
          .eq("id", coach.id);

        if (updateErr) throw new Error(updateErr.message);

        await supabaseAdmin.from("notification_log").insert({
          event_type: "coach_diploma_renewed",
          recipient_id: coach.user_id ?? null,
          channel: "system",
          success: true,
          payload: {
            coach_id: coach.id,
            coach_name: coachName,
            old_expiry: oldExpiry,
            new_expiry: newExpiry,
            course_date: courseDate,
            course_name: courseName,
            validity_years: qual.validity_years,
          },
        });

        renewedCount++;
      } catch (e) {
        errors.push({ coach_id: coach.id, stage: "renewal", error: (e as Error).message });
      }
    }

    // PASS 2 — Auto-revocation for opt-outs
    const { data: revokeCandidates, error: pass2Err } = await supabaseAdmin
      .from("coaches")
      .select("id, user_id, first_name, last_name, qualification_id, diploma_expiry_date, wants_js_renewal")
      .eq("wants_js_renewal", false)
      .not("qualification_id", "is", null)
      .not("diploma_expiry_date", "is", null)
      .lt("diploma_expiry_date", today);

    if (pass2Err) {
      console.error("pass2 query error:", pass2Err);
    }

    for (const coach of revokeCandidates || []) {
      try {
        const { data: qual } = await supabaseAdmin
          .from("coaching_qualifications")
          .select("id, name")
          .eq("id", coach.qualification_id)
          .maybeSingle();

        const coachName = `${coach.first_name || ""} ${coach.last_name || ""}`.trim();
        const revokedQualificationId = coach.qualification_id;
        const revokedQualificationName = qual?.name ?? null;
        const revokedExpiry = coach.diploma_expiry_date;

        const { error: updateErr } = await supabaseAdmin
          .from("coaches")
          .update({
            qualification_id: null,
            diploma_expiry_date: null,
          })
          .eq("id", coach.id);

        if (updateErr) throw new Error(updateErr.message);

        await supabaseAdmin.from("notification_log").insert({
          event_type: "coach_diploma_revoked",
          recipient_id: coach.user_id ?? null,
          channel: "system",
          success: true,
          payload: {
            coach_id: coach.id,
            coach_name: coachName,
            revoked_qualification_id: revokedQualificationId,
            revoked_qualification_name: revokedQualificationName,
            revoked_expiry_date: revokedExpiry,
            reason: "opted_out_and_expired",
          },
        });

        revokedCount++;
      } catch (e) {
        errors.push({ coach_id: coach.id, stage: "revocation", error: (e as Error).message });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        renewed_count: renewedCount,
        revoked_count: revokedCount,
        skipped_count: skippedCount,
        errors,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message || "Erreur serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
