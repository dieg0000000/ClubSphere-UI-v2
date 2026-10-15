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
    const { token, password } = await req.json();

    if (!token || !password) {
      return jsonResponse({ error: "token et password sont requis" }, 400);
    }
    if (typeof password !== "string" || password.length < 8) {
      return jsonResponse(
        { error: "Le mot de passe doit contenir au moins 8 caractères" },
        400
      );
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: coach, error: lookupError } = await adminClient
      .from("coaches")
      .select("id, email, first_name, last_name, phone, user_id, status, club_id")
      .eq("invite_token", token)
      .maybeSingle();

    if (lookupError) {
      console.error("Coach lookup error:", lookupError);
      return jsonResponse({ error: "Erreur interne" }, 500);
    }

    if (!coach) {
      return jsonResponse({ error: "Lien invalide" }, 403);
    }

    if (coach.user_id || coach.status === "registered") {
      return jsonResponse(
        { error: "Ce compte a déjà été activé" },
        409
      );
    }

    const { data: authData, error: authError } =
      await adminClient.auth.admin.createUser({
        email: coach.email,
        password,
        email_confirm: true,
        user_metadata: { role: "coach" },
      });

    if (authError) {
      if (
        authError.message?.includes("already been registered") ||
        authError.message?.includes("already exists")
      ) {
        return jsonResponse(
          {
            error:
              "Un compte avec cet email existe déjà. Utilisez la page de connexion ou réinitialisez votre mot de passe.",
          },
          409
        );
      }
      console.error("Auth createUser error:", authError);
      return jsonResponse({ error: authError.message }, 400);
    }

    const userId = authData.user.id;

    const { error: coachUpdateError } = await adminClient
      .from("coaches")
      .update({
        user_id: userId,
        status: "registered",
        can_login: true,
        registered_at: new Date().toISOString(),
        invite_token: null,
      })
      .eq("id", coach.id);

    if (coachUpdateError) {
      console.error("Coach update error:", coachUpdateError);
    }

    const { error: profileError } = await adminClient
      .from("profiles")
      .upsert(
        {
          id: userId,
          first_name: coach.first_name,
          last_name: coach.last_name,
          full_name: `${coach.first_name} ${coach.last_name}`,
          email: coach.email,
          phone: coach.phone || null,
          role: "coach",
          onboarding_completed: true,
        },
        { onConflict: "id" }
      );

    if (profileError) {
      console.error("Profile upsert error:", profileError);
    }

    const { error: roleError } = await adminClient
      .from("profile_roles")
      .upsert(
        { profile_id: userId, club_id: coach.club_id, role: "coach" },
        { onConflict: "profile_id,club_id,role" }
      );

    if (roleError) {
      console.error("Profile roles upsert error:", roleError);
    }

    return jsonResponse({ success: true, user_id: userId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erreur interne";
    console.error("register-coach error:", err);
    return jsonResponse({ error: message }, 500);
  }
});
