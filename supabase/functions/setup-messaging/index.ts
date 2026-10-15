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

    const sql = `
      CREATE TABLE IF NOT EXISTS conversations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
        type text NOT NULL CHECK (type IN ('team_full','staff_only','parent_coach','club_announcement')),
        name text,
        created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
        created_at timestamptz DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS conversation_participants (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid REFERENCES conversations(id) ON DELETE CASCADE,
        user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
        role text,
        can_write boolean DEFAULT true,
        joined_at timestamptz DEFAULT now(),
        UNIQUE(conversation_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS messages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        sender_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
        body text NOT NULL,
        created_at timestamptz DEFAULT now(),
        read_by uuid[] DEFAULT '{}'
      );

      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'conversations' AND rowsecurity = true) THEN
          ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'conversation_participants' AND rowsecurity = true) THEN
          ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'messages' AND rowsecurity = true) THEN
          ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
        END IF;
      END $$;

      CREATE INDEX IF NOT EXISTS idx_conversations_team_id ON conversations(team_id);
      CREATE INDEX IF NOT EXISTS idx_conversations_created_by ON conversations(created_by);
      CREATE INDEX IF NOT EXISTS idx_conversation_participants_conversation_id ON conversation_participants(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_conversation_participants_user_id ON conversation_participants(user_id);
      CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
      CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
    `;

    const { error: sqlError } = await supabaseAdmin.rpc('exec_sql', { sql });

    if (sqlError) {
      console.error('SQL execution error:', sqlError);
      return new Response(
        JSON.stringify({
          error: 'Failed to execute SQL',
          details: sqlError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: tableCheck, error: checkError } = await supabaseAdmin
      .from('conversations')
      .select('id')
      .limit(1);

    if (checkError && checkError.code !== 'PGRST116') {
      return new Response(
        JSON.stringify({
          error: 'Table verification failed',
          details: checkError.message
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Messaging tables verified and ready',
        tablesExist: true
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({
        error: error.message || 'Server error',
        stack: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
