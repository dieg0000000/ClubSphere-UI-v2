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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create parent test user
    const { data: parentAuth, error: parentError } =
      await supabaseAdmin.auth.admin.createUser({
        email: 'parent.test@clubsphere.test',
        password: 'Test1234!',
        email_confirm: true,
        user_metadata: { role: 'parent' }
      });

    if (parentError && !parentError.message.includes('already registered')) {
      throw parentError;
    }

    const parentUserId = parentAuth?.user?.id;

    // Create player test user
    const { data: playerAuth, error: playerError } =
      await supabaseAdmin.auth.admin.createUser({
        email: 'joueur.test@clubsphere.test',
        password: 'Test1234!',
        email_confirm: true,
        user_metadata: { role: 'joueur' }
      });

    if (playerError && !playerError.message.includes('already registered')) {
      throw playerError;
    }

    const playerUserId = playerAuth?.user?.id;

    // Get existing members to link
    const { data: members } = await supabaseAdmin
      .from('members')
      .select('id, first_name, last_name, birth_date')
      .is('email', null)
      .order('birth_date', { ascending: false, nullsFirst: false })
      .limit(2);

    if (members && members.length >= 2) {
      // Link parent to older member (could be parent)
      const parentMember = members[0];
      await supabaseAdmin
        .from('members')
        .update({ email: 'parent.test@clubsphere.test' })
        .eq('id', parentMember.id);

      // Link player to younger member
      const playerMember = members[1];
      await supabaseAdmin
        .from('members')
        .update({ email: 'joueur.test@clubsphere.test' })
        .eq('id', playerMember.id);

      // Create profiles
      if (parentUserId) {
        await supabaseAdmin
          .from('profiles')
          .upsert({
            id: parentUserId,
            first_name: parentMember.first_name,
            last_name: parentMember.last_name,
            full_name: `${parentMember.first_name} ${parentMember.last_name}`,
            email: 'parent.test@clubsphere.test',
            role: 'parent',
            onboarding_completed: true
          });
      }

      if (playerUserId) {
        await supabaseAdmin
          .from('profiles')
          .upsert({
            id: playerUserId,
            first_name: playerMember.first_name,
            last_name: playerMember.last_name,
            full_name: `${playerMember.first_name} ${playerMember.last_name}`,
            email: 'joueur.test@clubsphere.test',
            role: 'joueur',
            onboarding_completed: true
          });
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Test users created successfully',
          users: [
            {
              email: 'parent.test@clubsphere.test',
              password: 'Test1234!',
              role: 'parent',
              userId: parentUserId,
              memberId: parentMember.id,
              name: `${parentMember.first_name} ${parentMember.last_name}`
            },
            {
              email: 'joueur.test@clubsphere.test',
              password: 'Test1234!',
              role: 'joueur',
              userId: playerUserId,
              memberId: playerMember.id,
              name: `${playerMember.first_name} ${playerMember.last_name}`
            }
          ]
        }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        }
      );
    } else {
      throw new Error('Not enough members to link to test users');
    }

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Server error' }),
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
