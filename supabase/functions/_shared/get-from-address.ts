export async function getFromAddress(supabase: {
  from: (table: string) => {
    select: (cols: string) => { maybeSingle: () => Promise<{ data: Record<string, string | null> | null }> };
  };
}): Promise<string> {
  const { data: settings } = await supabase
    .from("club_settings")
    .select("sender_email, sender_name, club_name")
    .maybeSingle();

  const senderEmail = settings?.sender_email
    || Deno.env.get("FALLBACK_FROM_EMAIL")
    || Deno.env.get("REMINDER_FROM_EMAIL")
    || "onboarding@resend.dev";
  const senderName = settings?.sender_name || settings?.club_name || "ClubSphere";

  return `${senderName} <${senderEmail}>`;
}
