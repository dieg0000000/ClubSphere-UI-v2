import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/get-from-address.ts";
import { sendResendBatched, ResendPayload } from "../_shared/send-resend-batched.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface NotificationRequest {
  type: 'training_reminder' | 'match_reminder' | 'absence_notification' | 'match_status_change' | 'new_message';
  recipients: string[];
  data: any;
}

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

    const body: NotificationRequest = await req.json();
    const { type, recipients, data } = body;

    const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const isSimulated = !resendApiKey;

    const { data: clubSettings } = await supabaseAdmin
      .from('club_settings')
      .select('*')
      .maybeSingle();

    const clubName = clubSettings?.club_name || 'Club';
    const clubEmail = clubSettings?.club_email || 'noreply@club.ch';
    const fromAddress = await getFromAddress(supabaseAdmin);

    let sentCount = 0;
    const errors: string[] = [];
    const prepared: Array<{ recipientId: string; email: string; payload: ResendPayload }> = [];

    for (const recipientId of recipients) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('email, full_name, first_name, last_name')
        .eq('id', recipientId)
        .maybeSingle();

      if (!profile?.email) {
        errors.push(`${recipientId}: email manquant`);
        continue;
      }

      const emailData = generateEmailContent(type, data, profile, clubName);
      const finalSubject = isTestMode ? `[TEST] ${emailData.subject}` : emailData.subject;
      const deliverTo = isTestMode ? testRedirect : profile.email;

      if (isSimulated) {
        console.log('SIMULATED EMAIL:', { to: deliverTo, subject: finalSubject, type });
        await supabaseAdmin.from('notification_log').insert({
          event_type: type, recipient_id: recipientId, channel: 'email', payload: { ...data, test_mode: isTestMode, original_email: profile.email, delivered_to: deliverTo }, success: true
        });
        sentCount++;
        continue;
      }

      prepared.push({
        recipientId,
        email: profile.email,
        payload: {
          from: fromAddress,
          to: [deliverTo],
          reply_to: clubEmail,
          subject: finalSubject,
          html: emailData.html,
        },
      });
    }

    if (!isSimulated && prepared.length > 0) {
      const results = await sendResendBatched(resendApiKey!, prepared.map(p => p.payload));
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const p = prepared[i];
        await supabaseAdmin.from('notification_log').insert({
          event_type: type, recipient_id: p.recipientId, channel: 'email', payload: data, success: r.ok
        });
        if (r.ok) sentCount++;
        else errors.push(`${p.email}: ${r.error ?? 'unknown'}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: sentCount,
        simulated: isSimulated,
        errors: errors.length > 0 ? errors : undefined
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erreur serveur' }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});

function generateEmailContent(
  type: string,
  data: any,
  profile: any,
  clubName: string
): { subject: string; html: string } {
  const firstName = profile.first_name || profile.full_name?.split(' ')[0] || '';
  const lastName = profile.last_name || profile.full_name?.split(' ').slice(1).join(' ') || '';

  switch (type) {
    case 'training_reminder':
      return {
        subject: `Rappel: Entraînement du ${data.date}`,
        html: generateTrainingReminderTemplate(firstName, lastName, data, clubName)
      };
    case 'match_reminder':
      return {
        subject: `Rappel: Match du ${data.date} - ${data.opponent}`,
        html: generateMatchReminderTemplate(firstName, lastName, data, clubName)
      };
    case 'absence_notification':
      return {
        subject: `Absence signalée - ${data.member_name}`,
        html: generateAbsenceNotificationTemplate(data, clubName)
      };
    case 'match_status_change':
      return {
        subject: `${data.status === 'cancelled' ? 'Match annulé' : 'Match reporté'} - ${data.opponent}`,
        html: generateMatchStatusChangeTemplate(firstName, lastName, data, clubName)
      };
    case 'new_message':
      return {
        subject: `Nouveau message - ${data.conversation_name}`,
        html: generateNewMessageTemplate(firstName, lastName, data, clubName)
      };
    default:
      return {
        subject: `Notification - ${clubName}`,
        html: `<p>Bonjour ${firstName} ${lastName},</p><p>Vous avez une nouvelle notification.</p>`
      };
  }
}

function generateTrainingReminderTemplate(
  firstName: string,
  lastName: string,
  data: any,
  clubName: string
): string {
  const formattedDate = new Date(data.date).toLocaleDateString('fr-CH', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rappel Entraînement</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${clubName}</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Rappel d'entraînement</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Bonjour <strong>${firstName} ${lastName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                ${data.reminder_type === 'j8' ? 'Nous vous rappelons que' : data.reminder_type === 'j3' ? 'Dernier rappel:' : 'URGENT:'} l'entraînement de <strong>${data.team_name}</strong> aura lieu <strong>${formattedDate}</strong> à <strong>${data.time}</strong>.
              </p>
              ${data.location ? `<p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Lieu: <strong>${data.location}</strong>
              </p>` : ''}
              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                  Merci de confirmer votre présence ou de signaler votre absence dès que possible.
                </p>
              </div>
              ${data.reminder_type === 'j1' ? `<p style="margin: 24px 0 0 0; color: #dc2626; font-size: 16px; line-height: 1.6; font-weight: 600;">
                ⚠️ Si vous ne répondez pas, vous serez automatiquement marqué comme absent injustifié.
              </p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                ${clubName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateMatchReminderTemplate(
  firstName: string,
  lastName: string,
  data: any,
  clubName: string
): string {
  const formattedDate = new Date(data.date).toLocaleDateString('fr-CH', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Rappel Match</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${clubName}</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Rappel de match</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Bonjour <strong>${firstName} ${lastName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                ${data.reminder_type === 'j5' ? 'Nous vous rappelons que' : 'RAPPEL:'} le match de <strong>${data.team_name}</strong> contre <strong>${data.opponent}</strong> aura lieu <strong>${formattedDate}</strong> à <strong>${data.time}</strong>.
              </p>
              ${data.venue ? `<p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Lieu: <strong>${data.venue}</strong>
              </p>` : ''}
              <div style="background-color: #ecfdf5; border-left: 4px solid #10b981; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                  Merci de confirmer votre disponibilité dès que possible.
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                ${clubName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateAbsenceNotificationTemplate(data: any, clubName: string): string {
  const formattedDate = new Date(data.date).toLocaleDateString('fr-CH', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Notification d'absence</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${clubName}</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Notification d'absence</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                <strong>${data.member_name}</strong> a signalé son absence pour ${data.event_type === 'training' ? "l'entraînement" : "le match"} du <strong>${formattedDate}</strong>.
              </p>
              ${data.absence_reason ? `<div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0; color: #1f2937; font-size: 16px;">
                  <strong>Raison:</strong> ${data.absence_reason}
                </p>
              </div>` : ''}
              ${data.responded_by_parent ? `<p style="margin: 24px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                <em>Signalé par le parent</em>
              </p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                ${clubName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateMatchStatusChangeTemplate(
  firstName: string,
  lastName: string,
  data: any,
  clubName: string
): string {
  const isCancelled = data.status === 'cancelled';
  const formattedDate = new Date(data.date).toLocaleDateString('fr-CH', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });

  const postponedDate = data.postponed_to ? new Date(data.postponed_to).toLocaleDateString('fr-CH', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  }) : '';

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0;">
  <title>${isCancelled ? 'Match annulé' : 'Match reporté'}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${clubName}</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">${isCancelled ? 'Match annulé' : 'Match reporté'}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Bonjour <strong>${firstName} ${lastName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Nous vous informons que le match de <strong>${data.team_name}</strong> contre <strong>${data.opponent}</strong> prévu le <strong>${formattedDate}</strong> a été <strong>${isCancelled ? 'annulé' : 'reporté'}</strong>.
              </p>
              ${!isCancelled && postponedDate ? `<div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0; color: #1f2937; font-size: 16px; font-weight: 600;">
                  Nouvelle date: ${postponedDate}
                </p>
              </div>` : ''}
              ${data.reason ? `<div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0; color: #1f2937; font-size: 16px;">
                  <strong>Raison:</strong> ${data.reason}
                </p>
              </div>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                ${clubName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

function generateNewMessageTemplate(
  firstName: string,
  lastName: string,
  data: any,
  clubName: string
): string {
  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nouveau message</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #7c3aed 0%, #a78bfa 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${clubName}</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Nouveau message</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Bonjour <strong>${firstName} ${lastName}</strong>,
              </p>
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Vous avez reçu un nouveau message dans <strong>${data.conversation_name}</strong> de la part de <strong>${data.sender_name}</strong>.
              </p>
              <div style="background-color: #f5f3ff; border-left: 4px solid #a78bfa; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0; color: #1f2937; font-size: 14px; line-height: 1.6;">
                  ${data.message_preview}
                </p>
              </div>
              <p style="margin: 24px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                Connectez-vous à l'application pour répondre au message.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0; text-align: center;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">
                ${clubName}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}
