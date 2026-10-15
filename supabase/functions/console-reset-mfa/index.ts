import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
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
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    const { data: { user: caller }, error: callerError } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify caller is platform admin
    const { data: isPlatformAdmin } = await callerClient.rpc("is_platform_admin");
    if (!isPlatformAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: platform admin required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { profile_id } = await req.json();

    if (!profile_id) {
      return new Response(
        JSON.stringify({ success: false, error: "profile_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // List and delete all MFA factors for the target user
    const { data: factors, error: listError } = await adminClient.auth.admin.mfa.listFactors({
      userId: profile_id,
    });

    if (listError) {
      return new Response(
        JSON.stringify({ success: false, error: listError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const totp = factors?.totp || [];
    for (const factor of totp) {
      const { error: delError } = await adminClient.auth.admin.mfa.deleteFactor({
        userId: profile_id,
        factorId: factor.id,
      });
      if (delError) {
        return new Response(
          JSON.stringify({ success: false, error: delError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Also delete grace period so they get a fresh enrollment prompt
    await adminClient
      .from("mfa_grace_periods")
      .delete()
      .eq("profile_id", profile_id);

    return new Response(
      JSON.stringify({ success: true, deleted_count: totp.length }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
