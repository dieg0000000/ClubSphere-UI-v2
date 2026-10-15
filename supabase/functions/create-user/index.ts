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
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { email, password, role, full_name, source_type, source_id } = await req.json();

    if (!email || !password || !role || !full_name) {
      return new Response(
        JSON.stringify({ error: "email, password, role et full_name sont requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = data.user.id;

    await adminClient.from("profiles").upsert({
      id: userId,
      email,
      role,
      full_name,
      onboarding_completed: true,
    }, { onConflict: "id" });

    await adminClient
      .from("profiles")
      .update({ role, full_name, onboarding_completed: true })
      .eq("id", userId);

    if (source_type === "coach" && source_id) {
      await adminClient
        .from("coaches")
        .update({ email, can_login: true })
        .eq("id", source_id);
    }

    if (source_type === "committee") {
      const defaultAccess = [
        "utilisateurs","evenements","actualites","equipes","entraineurs",
        "qualifications","categories","joueurs","annuaire","sponsors",
        "terrains","matchs","pv_seances","js_presences","notifications",
        "finances","parametres","theme",
      ].map((module) => ({
        profile_id: userId,
        module,
        can_view: false,
        can_edit: false,
      }));

      await adminClient
        .from("committee_access")
        .upsert(defaultAccess, { onConflict: "profile_id,module" });
    }

    return new Response(
      JSON.stringify({ success: true, user_id: userId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Erreur interne" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
