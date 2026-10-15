import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const CATEGORY_ACCESS: Record<string, string[]> = {
  coach:           ["pv_technique", "divers", "charte_entraineurs"],
  assistant_coach: ["pv_technique", "divers", "charte_entraineurs"],
  member:          ["pv_ag", "divers", "charte_joueurs", "charte_joueurs_mineurs"],
  parent:          ["pv_ag", "divers", "charte_joueurs", "charte_joueurs_mineurs"],
  supporter:       ["pv_ag", "divers", "charte_joueurs", "charte_joueurs_mineurs"],
};

const ADMIN_ROLES = ["admin", "president", "vice_president", "committee"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[get-document-url] No Authorization header");
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      console.log("[get-document-url] Auth failed:", authError?.message);
      return new Response(JSON.stringify({ error: "Non autorisé" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[get-document-url] user.id:", user.id);

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role: string = profile?.role ?? "member";
    console.log("[get-document-url] role:", role, "| CATEGORY_ACCESS[role]:", JSON.stringify(CATEGORY_ACCESS[role] ?? null));

    const { document_id } = await req.json();
    if (!document_id) {
      return new Response(JSON.stringify({ error: "document_id requis" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[get-document-url] document_id:", document_id);

    const { data: doc, error: docError } = await supabaseAdmin
      .from("documents")
      .select("id, file_url, file_name, category, is_active")
      .eq("id", document_id)
      .maybeSingle();

    if (docError || !doc) {
      console.log("[get-document-url] Document not found. docError:", docError?.message);
      return new Response(JSON.stringify({ error: "Document non trouvé" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    console.log("[get-document-url] doc.category:", doc.category, "| doc.is_active:", doc.is_active, "| doc.file_url:", doc.file_url);

    if (!doc.is_active) {
      console.log("[get-document-url] Document inactive");
      return new Response(JSON.stringify({ error: "Document inactif" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!ADMIN_ROLES.includes(role)) {
      const allowed = CATEGORY_ACCESS[role] ?? [];
      console.log("[get-document-url] allowed categories for role:", JSON.stringify(allowed), "| doc.category:", doc.category, "| passes:", allowed.includes(doc.category));
      if (!allowed.includes(doc.category)) {
        return new Response(JSON.stringify({ error: "Accès refusé" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    console.log("[get-document-url] Generating signed URL for storage path:", doc.file_url);
    const { data: signedData, error: signError } = await supabaseAdmin
      .storage
      .from("documents")
      .createSignedUrl(doc.file_url, 3600);

    console.log("[get-document-url] signedUrl:", signedData?.signedUrl ?? null, "| signError:", signError?.message ?? null);

    if (signError || !signedData?.signedUrl) {
      return new Response(JSON.stringify({ error: "Impossible de générer l'URL" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ signed_url: signedData.signedUrl, file_name: doc.file_name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[get-document-url] Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Erreur interne" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
