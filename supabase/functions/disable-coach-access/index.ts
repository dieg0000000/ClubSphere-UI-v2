import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Non authentifié" }, 401);
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const callerClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) {
      return jsonResponse({ error: "Non authentifié" }, 401);
    }

    const { coach_id } = await req.json();
    if (!coach_id) {
      return jsonResponse({ error: "coach_id est requis" }, 400);
    }

    // 2. Load target coach
    const { data: coach, error: coachError } = await adminClient
      .from("coaches")
      .select("id, user_id, club_id, email")
      .eq("id", coach_id)
      .maybeSingle();

    if (coachError) {
      console.error("Coach lookup error:", coachError);
      return jsonResponse({ error: "Erreur interne" }, 500);
    }
    if (!coach) {
      return jsonResponse({ error: "Coach non trouvé" }, 404);
    }

    // 3. Authorize: caller must be admin or committee in the coach's club
    const { data: callerRole } = await adminClient
      .from("profile_roles")
      .select("role")
      .eq("profile_id", caller.id)
      .eq("club_id", coach.club_id)
      .in("role", ["admin", "committee"])
      .maybeSingle();

    if (!callerRole) {
      return jsonResponse({ error: "Accès refusé" }, 403);
    }

    // 4. Determine the target user id to wipe
    let targetUserId: string | null = coach.user_id ?? null;

    if (!targetUserId && coach.email) {
      const targetEmail = coach.email.toLowerCase();
      let page = 1;
      let found = false;
      while (!found) {
        const { data: list, error: listErr } =
          await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
        if (listErr) {
          console.error("auth.admin.listUsers error:", listErr);
          break;
        }
        const match = list?.users?.find(
          (u: { email?: string }) => u.email?.toLowerCase() === targetEmail
        );
        if (match) {
          targetUserId = match.id;
          found = true;
          console.log("Found orphan auth user by email:", targetUserId);
        } else if (!list?.users?.length || list.users.length < 1000) {
          break;
        }
        page++;
      }
    }

    // 5. Wipe the user account if a target was found
    if (targetUserId) {
      const { error: rolesDelError } = await adminClient
        .from("profile_roles")
        .delete()
        .eq("profile_id", targetUserId);
      if (rolesDelError) {
        console.error("profile_roles delete error:", rolesDelError);
      }

      const { error: profileDelError } = await adminClient
        .from("profiles")
        .delete()
        .eq("id", targetUserId);
      if (profileDelError) {
        console.error("profiles delete error:", profileDelError);
      }

      const { error: authDelError } =
        await adminClient.auth.admin.deleteUser(targetUserId);
      if (authDelError) {
        console.error("auth.admin.deleteUser error:", authDelError);
        return jsonResponse(
          { error: "Erreur lors de la suppression du compte: " + authDelError.message },
          500
        );
      }
    }

    // 6. Reset the coaches row
    const { error: resetError } = await adminClient
      .from("coaches")
      .update({
        user_id: null,
        status: "active",
        can_login: false,
        invite_token: null,
        registered_at: null,
      })
      .eq("id", coach.id);

    if (resetError) {
      console.error("Coach reset error:", resetError);
      return jsonResponse({ error: "Erreur lors de la réinitialisation du coach" }, 500);
    }

    return jsonResponse({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    console.error("disable-coach-access error:", err);
    return jsonResponse({ error: message }, 500);
  }
});
