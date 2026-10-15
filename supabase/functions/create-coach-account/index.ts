import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Non autorisé' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    const { data: { user } } = await userClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Non authentifié' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ error: 'Admin requis' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { action, ...params } = await req.json();

    if (action === 'create_from_invite') {
      const { token, password } = params;

      const { data: coach } = await supabaseAdmin
        .from('coaches')
        .select('*')
        .eq('invite_token', token)
        .is('user_id', null)
        .maybeSingle();

      if (!coach) {
        return new Response(
          JSON.stringify({ error: 'Lien d\'invitation invalide ou déjà utilisé' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      const { data: authData, error: authError } =
        await supabaseAdmin.auth.admin.createUser({
          email: coach.email,
          password,
          email_confirm: true,
          user_metadata: { role: 'coach' }
        });

      if (authError) throw authError;

      const userId = authData.user.id;

      await supabaseAdmin
        .from('coaches')
        .update({
          user_id: userId,
          status: 'registered',
          can_login: true,
          invite_token: null
        })
        .eq('id', coach.id);

      await supabaseAdmin
        .from('profiles')
        .upsert({
          id: userId,
          first_name: coach.first_name,
          last_name: coach.last_name,
          full_name: `${coach.first_name} ${coach.last_name}`,
          email: coach.email,
          phone: coach.phone || null,
          role: 'coach'
        });

      return new Response(
        JSON.stringify({
          success: true,
          userId,
          email: coach.email,
          message: 'Compte créé avec succès'
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    if (action === 'reset_password') {
      const { userId, newPassword } = params;

      const { error } = await supabaseAdmin.auth.admin
        .updateUserById(userId, { password: newPassword });

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true, message: 'Mot de passe réinitialisé' }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    if (action === 'disable') {
      const { userId } = params;

      await supabaseAdmin.auth.admin
        .updateUserById(userId, { ban_duration: '87600h' });

      await supabaseAdmin
        .from('coaches')
        .update({ can_login: false, status: 'inactive' })
        .eq('user_id', userId);

      return new Response(
        JSON.stringify({ success: true, message: 'Accès désactivé' }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    if (action === 'enable') {
      const { userId } = params;

      await supabaseAdmin.auth.admin
        .updateUserById(userId, { ban_duration: 'none' });

      await supabaseAdmin
        .from('coaches')
        .update({ can_login: true, status: 'active' })
        .eq('user_id', userId);

      return new Response(
        JSON.stringify({ success: true, message: 'Accès réactivé' }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Action inconnue' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erreur serveur' }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});
