import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResp(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const VALID_ACTIONS = new Set([
  "resolve_set_email",
  "resolve_replace_email",
  "resolve_link_parent",
  "reject",
]);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) return jsonResp({ error: "Non authentifié" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);

    const { requestId, action } = await req.json();
    if (!requestId || !action) {
      return jsonResp({ error: "requestId et action sont requis" }, 400);
    }
    if (!VALID_ACTIONS.has(action)) {
      return jsonResp({ error: `Action inconnue : ${action}` }, 400);
    }

    const { data: reqRow, error: fetchErr } = await admin
      .from("activation_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();

    if (fetchErr || !reqRow) {
      return jsonResp({ error: "Demande introuvable" }, 404);
    }
    if (reqRow.status !== "pending") {
      return jsonResp({ ok: true, already_resolved: true });
    }

    const { data: callerAccess } = await admin
      .from("committee_access")
      .select("id")
      .eq("user_id", user.id)
      .eq("club_id", reqRow.club_id)
      .maybeSingle();

    const { data: callerProfile } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const isAdmin = callerProfile?.role === "admin";
    const isCommittee = !!callerAccess;
    if (!isAdmin && !isCommittee) {
      return jsonResp({ error: "Accès refusé" }, 403);
    }

    if (action === "reject") {
      await admin
        .from("activation_requests")
        .update({
          status: "rejected",
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
        })
        .eq("id", requestId);

      return jsonResp({ ok: true, approved: false });
    }

    let memberId = reqRow.member_id;

    if (!memberId && reqRow.avs_input) {
      const { data: found } = await admin
        .from("members")
        .select("id")
        .eq("avs_number", reqRow.avs_input.trim())
        .eq("club_id", reqRow.club_id)
        .maybeSingle();
      if (found) {
        memberId = found.id;
        await admin
          .from("activation_requests")
          .update({ member_id: memberId })
          .eq("id", requestId);
      }
    }

    if (!memberId) {
      return jsonResp(
        {
          error: `Aucun membre du club ne porte le numéro AVS ${reqRow.avs_input ?? "(vide)"}. Corrigez d'abord la fiche du membre, puis réessayez.`,
        },
        422
      );
    }

    const { data: member } = await admin
      .from("members")
      .select("id, email, first_name, last_name")
      .eq("id", memberId)
      .maybeSingle();

    if (!member) {
      return jsonResp({ error: "Membre introuvable" }, 404);
    }

    if (action === "resolve_set_email" || action === "resolve_replace_email") {
      await admin
        .from("members")
        .update({
          email: reqRow.requester_email,
          user_id: reqRow.requester_user_id,
        })
        .eq("id", memberId);

      const existingRole = await admin
        .from("profile_roles")
        .select("id")
        .eq("profile_id", reqRow.requester_user_id)
        .eq("club_id", reqRow.club_id)
        .eq("role", "member")
        .maybeSingle();

      if (!existingRole?.data) {
        await admin.from("profile_roles").insert({
          profile_id: reqRow.requester_user_id,
          club_id: reqRow.club_id,
          role: "member",
        });
      }

      await admin
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", reqRow.requester_user_id);
    } else if (action === "resolve_link_parent") {
      const { error: linkErr } = await admin.from("parent_members").upsert(
        {
          parent_user_id: reqRow.requester_user_id,
          member_id: memberId,
          club_id: reqRow.club_id,
        },
        { onConflict: "parent_user_id,member_id" }
      );
      if (linkErr) {
        await admin.from("parent_members").insert({
          parent_user_id: reqRow.requester_user_id,
          member_id: memberId,
          club_id: reqRow.club_id,
        });
      }

      const existingRole = await admin
        .from("profile_roles")
        .select("id")
        .eq("profile_id", reqRow.requester_user_id)
        .eq("club_id", reqRow.club_id)
        .eq("role", "parent")
        .maybeSingle();

      if (!existingRole?.data) {
        await admin.from("profile_roles").insert({
          profile_id: reqRow.requester_user_id,
          club_id: reqRow.club_id,
          role: "parent",
        });
      }

      await admin
        .from("profiles")
        .update({ onboarding_completed: true })
        .eq("id", reqRow.requester_user_id);
    }

    await admin
      .from("activation_requests")
      .update({
        status: "resolved",
        resolved_at: new Date().toISOString(),
        resolved_by: user.id,
      })
      .eq("id", requestId);

    try {
      const { data: settings } = await admin
        .from("club_settings")
        .select("club_name")
        .eq("club_id", reqRow.club_id)
        .maybeSingle();

      const clubName = settings?.club_name ?? "votre club";

      await admin.from("notifications").insert({
        user_id: reqRow.requester_user_id,
        club_id: reqRow.club_id,
        title: "Accès activé",
        body: `Votre accès à ${clubName} a été validé. Vous pouvez maintenant utiliser l'application.`,
        type: "activation_resolved",
      });
    } catch {
      // notification is best-effort
    }

    return jsonResp({ ok: true, approved: true });
  } catch (err) {
    return jsonResp({ error: (err as Error).message ?? "Erreur interne" }, 500);
  }
});
