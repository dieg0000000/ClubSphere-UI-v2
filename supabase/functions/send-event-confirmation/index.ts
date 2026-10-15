import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/get-from-address.ts";

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
    const { registration_id, type } = await req.json();

    if (!registration_id) {
      return new Response(
        JSON.stringify({ error: 'registration_id requis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: reg, error: regError } = await supabaseAdmin
      .from('event_ext_registrations')
      .select(`
        *,
        events:event_id (title, date, location, cancellation_deadline_days, cost_price),
        event_tariffs:tariff_id (label, price)
      `)
      .eq('id', registration_id)
      .maybeSingle();

    if (regError || !reg) {
      return new Response(
        JSON.stringify({ error: 'Inscription introuvable' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const event = reg.events as any;
    const tariff = reg.event_tariffs as any;

    const { data: clubSettings } = await supabaseAdmin
      .from('club_settings')
      .select('*')
      .maybeSingle();

    const clubName = clubSettings?.club_name || 'Club';
    const clubEmail = clubSettings?.club_email || clubSettings?.contact_email || 'noreply@club.ch';
    const fromAddress = await getFromAddress(supabaseAdmin);
    const clubPhone = clubSettings?.contact_phone || '';
    const clubAddress = clubSettings?.address || '';
    const clubPrimaryColor = clubSettings?.primary_color || '#1e3a8a';
    const clubLogoUrl = clubSettings?.logo_url || null;

    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const isSimulated = !resendApiKey;
    const appUrl = Deno.env.get('APP_URL') || 'https://localhost:5173';

    const isCancellation = type === 'cancellation';

    const eventDate = new Date(event.date).toLocaleString('fr-CH', {
      timeZone: 'Europe/Zurich',
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    const totalPersons = 1 + (reg.guest_count || 0);
    const totalAmount = reg.total_amount ? Number(reg.total_amount).toFixed(2) : '0.00';
    const isFree = !reg.total_amount || Number(reg.total_amount) === 0;
    const cancellationUrl = `${appUrl}/events/cancel-registration?token=${reg.id}`;

    const guestsHtml = (reg.guests || []).length > 0
      ? `<tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Accompagnants:</td><td style="padding: 8px 0; color: #1f2937; font-size: 14px; text-align: right;">${(reg.guests as any[]).map((g: any) => `${g.first_name} ${g.last_name}`).join(', ')}</td></tr>`
      : '';

    const paymentLabel = reg.payment_mode === 'invoice' ? 'Facture' : 'Cash / Carte';

    const subject = isCancellation
      ? `Annulation d'inscription - ${event.title}`
      : `Confirmation d'inscription - ${event.title}`;

    const headerColor = isCancellation ? '#dc2626' : clubPrimaryColor;
    const headerAccent = isCancellation ? '#ef4444' : clubPrimaryColor;
    const subtitle = isCancellation ? 'Annulation d\'inscription' : 'Confirmation d\'inscription';

    const mainMessage = isCancellation
      ? `Votre inscription a l'evenement <strong>${event.title}</strong> a bien ete annulee.`
      : `Votre inscription a l'evenement <strong>${event.title}</strong> a bien ete enregistree.`;

    const emailHtml = `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, ${headerColor} 0%, ${headerAccent} 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              ${clubLogoUrl
                ? `<img src="${clubLogoUrl}" alt="${clubName}" style="width: 120px; height: auto; display: block; margin: 0 auto 12px auto;" />`
                : `<h1 style="margin: 0 0 8px 0; color: #ffffff; font-size: 28px; font-weight: 700;">${clubName}</h1>`
              }
              <p style="margin: 0; color: rgba(255,255,255,0.9); font-size: 14px;">${subtitle}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Bonjour <strong>${reg.registrant_first_name} ${reg.registrant_last_name}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                ${mainMessage}
              </p>
              <div style="background-color: #eff6ff; border-left: 4px solid ${headerAccent}; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Evenement:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${event.title}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Date:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${eventDate}</td>
                  </tr>
                  ${event.location ? `<tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Lieu:</td><td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${event.location}</td></tr>` : ''}
                  ${!isFree && tariff ? `<tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Tarif:</td><td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${tariff.label}</td></tr>` : ''}
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Personnes:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${totalPersons}</td>
                  </tr>
                  ${guestsHtml}
                  ${!isFree && reg.payment_mode ? `<tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Paiement:</td><td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${paymentLabel}</td></tr>` : ''}
                  ${isFree
                    ? `<tr><td colspan="2" style="padding: 12px 0 4px 0; text-align: center;"><span style="display: inline-block; padding: 6px 14px; border-radius: 999px; background-color: #dcfce7; color: #15803d; border: 1px solid #86efac; font-size: 13px; font-weight: 600;">Inscription gratuite</span></td></tr>`
                    : `<tr><td style="padding: 8px 0; color: #64748b; font-size: 14px;">Total:</td><td style="padding: 8px 0; color: #1f2937; font-size: 16px; font-weight: 700; text-align: right;">CHF ${totalAmount}</td></tr>`
                  }
                </table>
              </div>
              ${!isCancellation ? `
              <p style="margin: 24px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                Si vous souhaitez annuler votre inscription, vous pouvez le faire en cliquant sur le lien ci-dessous:
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 16px 0;">
                <tr>
                  <td align="center">
                    <a href="${cancellationUrl}" style="display: inline-block; background-color: #6b7280; color: #ffffff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px;">
                      Annuler mon inscription
                    </a>
                  </td>
                </tr>
              </table>
              ` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color: #64748b; font-size: 13px; line-height: 1.6;">
                    <strong style="color: #1f2937; display: block; margin-bottom: 8px;">${clubName}</strong>
                    ${clubAddress ? `<div style="margin-bottom: 4px;">${clubAddress}</div>` : ''}
                    ${clubPhone ? `<div style="margin-bottom: 4px;">Tel: ${clubPhone}</div>` : ''}
                    ${clubEmail ? `<div>Email: <a href="mailto:${clubEmail}" style="color: #3b82f6; text-decoration: none;">${clubEmail}</a></div>` : ''}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

    const finalSubject = isTestMode ? `[TEST] ${subject}` : subject;
    const deliverTo = isTestMode ? testRedirect : reg.registrant_email;

    if (isSimulated) {
      console.log('SIMULATED EMAIL:', { to: deliverTo, subject: finalSubject });
      return new Response(
        JSON.stringify({ success: true, simulated: true, test_mode: isTestMode, message: 'Email simule (RESEND_API_KEY non configure)' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [deliverTo],
        reply_to: clubEmail,
        subject: finalSubject,
        html: emailHtml
      })
    });

    if (!emailResponse.ok) {
      const err = await emailResponse.text();
      console.error('Resend error:', err);
      throw new Error(`Erreur Resend: ${err}`);
    }

    return new Response(
      JSON.stringify({ success: true, simulated: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erreur serveur' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
