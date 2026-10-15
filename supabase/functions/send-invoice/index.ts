import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { getFromAddress } from "../_shared/get-from-address.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SingleInvoiceRequest {
  invoice_id: string;
  pdf_base64: string;
  filename: string;
  reminder_type?: 'R1' | 'R2';
}

interface BulkInvoiceRequest {
  invoice_ids: string[];
  reminder_type?: 'R1' | 'R2';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    console.log('📧 Send invoice function called');
    console.log('Request headers:', {
      hasAuth: !!req.headers.get('Authorization'),
      hasApikey: !!req.headers.get('apikey'),
      hasContentType: !!req.headers.get('Content-Type')
    });

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('❌ No authorization header');
      return new Response(
        JSON.stringify({ error: 'Non autorisé - en-tête Authorization manquant' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('✅ Authorization header present');

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
      console.error('❌ User not authenticated');
      return new Response(
        JSON.stringify({ error: 'Non authentifié' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('✅ User authenticated:', user.id);

    const { data: clubSettings } = await supabaseAdmin
      .from('club_settings')
      .select('*')
      .maybeSingle();

    if (clubSettings?.finance_module_enabled === false) {
      console.warn('⛔ Finance module disabled, refusing send-invoice');
      return new Response(
        JSON.stringify({
          error: 'Le module Finances est désactivé pour ce club. Réactivez-le dans Paramètres → Finances.'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const isAdmin = ['admin', 'president', 'vice_president'].includes(profile?.role);

    const { data: accessRow } = await supabaseAdmin
      .from('committee_access')
      .select('can_edit')
      .eq('profile_id', user.id)
      .eq('module', 'finances')
      .maybeSingle();

    const hasFinanceAccess = accessRow?.can_edit === true;

    if (!isAdmin && !hasFinanceAccess) {
      console.error('❌ User does not have finance access:', profile?.role);
      return new Response(
        JSON.stringify({ error: 'Accès non autorisé' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('✅ User has finance access');

    const body = await req.json();
    console.log('📦 Request body received:', {
      has_invoice_id: 'invoice_id' in body,
      has_invoice_ids: 'invoice_ids' in body,
      has_pdf: 'pdf_base64' in body,
      pdf_size: body.pdf_base64?.length || 0
    });
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const isSimulated = !resendApiKey;

    const clubName = clubSettings?.club_name || 'Club';
    const clubEmail = clubSettings?.club_email || clubSettings?.contact_email || 'noreply@club.ch';
    const fromAddress = await getFromAddress(supabaseAdmin);
    const clubPhone = clubSettings?.contact_phone || '';
    const clubAddress = clubSettings?.address || '';

    // TEST_MODE_EMAIL_REDIRECT: if set to a valid email, every outgoing invoice
    // email is redirected there and the subject is prefixed with "[TEST]".
    // When unset/empty, emails are delivered to the real recipient.
    const testRedirect = (Deno.env.get('TEST_MODE_EMAIL_REDIRECT') ?? '').trim();
    const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

    const eventTypeForReminder = (r?: 'R1' | 'R2') =>
      r === 'R1' ? 'invoice_reminder_r1'
      : r === 'R2' ? 'invoice_reminder_r2'
      : 'invoice_sent';

    const lookupProfileIdByEmail = async (email: string): Promise<string | null> => {
      if (!email) return null;
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('email', email.toLowerCase())
        .maybeSingle();
      return data?.id ?? null;
    };

    if ('invoice_id' in body) {
      const { invoice_id, pdf_base64, filename, reminder_type } = body as SingleInvoiceRequest;

      console.log('📄 Processing single invoice:', invoice_id, reminder_type ? `(${reminder_type})` : '');

      const { data: invoice, error: invoiceError } = await supabaseAdmin
        .from('invoices')
        .select(`
          id,
          invoice_number,
          total_amount,
          due_date,
          member:members(
            first_name,
            last_name,
            email,
            legal_rep1_email,
            legal_rep1_firstname,
            legal_rep2_email,
            legal_rep2_firstname
          ),
          season:seasons(name)
        `)
        .eq('id', invoice_id)
        .maybeSingle();

      if (invoiceError) {
        console.error('❌ Error fetching invoice:', invoiceError);
        return new Response(
          JSON.stringify({ error: `Erreur DB: ${invoiceError.message}` }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      if (!invoice) {
        console.error('❌ Invoice not found:', invoice_id);
        return new Response(
          JSON.stringify({ error: 'Facture introuvable' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log('✅ Invoice found:', invoice.invoice_number);

      const member = invoice.member as any;
      const season = invoice.season as any;

      const recipientEmail = member?.email || member?.legal_rep1_email || member?.legal_rep2_email;
      const recipientFirstName = member?.email
        ? member.first_name
        : member?.legal_rep1_email
        ? member.legal_rep1_firstname
        : member?.first_name;
      const recipientLastName = member?.email
        ? member.last_name
        : member?.legal_rep1_email
        ? `(parent de ${member.first_name} ${member.last_name})`
        : member?.last_name;

      if (!recipientEmail) {
        console.error('❌ No email available for invoice:', invoice.invoice_number);
        return new Response(
          JSON.stringify({ error: 'Aucun email disponible pour ce membre ou ses représentants légaux' }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log('📧 Recipient email:', recipientEmail);

      const emailHtml = reminder_type
        ? generateReminderEmailTemplate(
            reminder_type,
            recipientFirstName,
            recipientLastName,
            invoice.invoice_number,
            season?.name || '',
            invoice.total_amount,
            invoice.due_date,
            clubName,
            clubEmail,
            clubPhone,
            clubAddress
          )
        : generateEmailTemplate(
            recipientFirstName,
            recipientLastName,
            invoice.invoice_number,
            season?.name || '',
            invoice.total_amount,
            invoice.due_date,
            clubName,
            clubEmail,
            clubPhone,
            clubAddress
          );

      const emailSubject = reminder_type === 'R1'
        ? `Rappel - Facture ${invoice.invoice_number} en attente de paiement`
        : reminder_type === 'R2'
        ? `2ème rappel - Facture ${invoice.invoice_number} - Action requise`
        : `Facture ${invoice.invoice_number} - ${clubName}`;

      if (isSimulated) {
        console.log('⚠️ SIMULATED EMAIL SEND (no RESEND_API_KEY):', {
          to: recipientEmail,
          subject: emailSubject,
          invoice_id: invoice.id
        });

        const updateData: any = reminder_type === 'R1'
          ? { reminder1_sent_at: new Date().toISOString(), sent_to_email: recipientEmail }
          : reminder_type === 'R2'
          ? { reminder2_sent_at: new Date().toISOString(), sent_to_email: recipientEmail }
          : { status: 'sent', sent_at: new Date().toISOString(), sent_to_email: recipientEmail };

        const { error: updateError } = await supabaseAdmin
          .from('invoices')
          .update(updateData)
          .eq('id', invoice_id);

        if (updateError) {
          console.error('❌ Error updating invoice status:', updateError);
        } else {
          console.log('✅ Invoice status updated to sent');
        }

        const simProfileId = await lookupProfileIdByEmail(recipientEmail);
        await supabaseAdmin.from('notification_log').insert({
          event_type: eventTypeForReminder(reminder_type),
          recipient_id: simProfileId,
          sent_at: new Date().toISOString(),
          channel: 'email',
          payload: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            total_amount: invoice.total_amount,
            recipient_email: recipientEmail,
            test_mode: isTestMode,
            simulated: true,
          },
          success: true,
        });

        return new Response(
          JSON.stringify({
            success: true,
            sent: 1,
            simulated: true,
            message: 'Email simulé (RESEND_API_KEY non configuré)'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      console.log('📤 Sending real email via Resend...');

      const toEmail = isTestMode ? testRedirect : recipientEmail;
      const finalSubject = isTestMode ? `[TEST] ${emailSubject}` : emailSubject;
      if (isTestMode) {
        console.log(`📧 TEST MODE: redirecting to ${toEmail} (intended: ${recipientEmail})`);
      } else {
        console.log(`📧 LIVE MODE: sending to ${toEmail}`);
      }

      const emailResponse = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [toEmail],
          reply_to: clubEmail,
          subject: finalSubject,
          html: emailHtml,
          attachments: [
            {
              filename: filename,
              content: pdf_base64
            }
          ]
        })
      });

      const eventType = eventTypeForReminder(reminder_type);
      const recipientProfileId = await lookupProfileIdByEmail(recipientEmail);

      if (!emailResponse.ok) {
        const errText = await emailResponse.text();
        console.error('❌ Resend API error:', errText);

        await supabaseAdmin.from('notification_log').insert({
          event_type: eventType,
          recipient_id: recipientProfileId,
          sent_at: new Date().toISOString(),
          channel: 'email',
          payload: {
            invoice_id: invoice.id,
            invoice_number: invoice.invoice_number,
            total_amount: invoice.total_amount,
            recipient_email: recipientEmail,
            test_mode: isTestMode,
            error: errText,
          },
          success: false,
        });

        throw new Error(`Erreur Resend: ${errText}`);
      }

      console.log('✅ Email sent via Resend');

      const updateData: any = reminder_type === 'R1'
        ? { reminder1_sent_at: new Date().toISOString(), sent_to_email: recipientEmail }
        : reminder_type === 'R2'
        ? { reminder2_sent_at: new Date().toISOString(), sent_to_email: recipientEmail }
        : { status: 'sent', sent_at: new Date().toISOString(), sent_to_email: recipientEmail };

      const { error: updateError } = await supabaseAdmin
        .from('invoices')
        .update(updateData)
        .eq('id', invoice_id);

      if (updateError) {
        console.error('❌ Error updating invoice status:', updateError);
      } else {
        console.log('✅ Invoice status updated to sent');
      }

      await supabaseAdmin.from('notification_log').insert({
        event_type: eventType,
        recipient_id: recipientProfileId,
        sent_at: new Date().toISOString(),
        channel: 'email',
        payload: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          total_amount: invoice.total_amount,
          recipient_email: recipientEmail,
          test_mode: isTestMode,
        },
        success: true,
      });

      return new Response(
        JSON.stringify({
          success: true,
          sent: 1,
          simulated: false
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );

    } else if ('invoice_ids' in body) {
      const { invoice_ids, reminder_type } = body as BulkInvoiceRequest;

      const { data: invoices } = await supabaseAdmin
        .from('invoices')
        .select(`
          id,
          invoice_number,
          total_amount,
          due_date,
          member:members(
            first_name,
            last_name,
            email,
            legal_rep1_email,
            legal_rep1_firstname,
            legal_rep2_email,
            legal_rep2_firstname
          ),
          season:seasons(name)
        `)
        .in('id', invoice_ids);

      if (!invoices || invoices.length === 0) {
        return new Response(
          JSON.stringify({ error: 'Aucune facture trouvée' }),
          {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      }

      let sentCount = 0;
      const errors: string[] = [];
      const logRows: any[] = [];

      for (const invoice of invoices) {
        const member = invoice.member as any;
        const season = invoice.season as any;

        const recipientEmail = member?.email || member?.legal_rep1_email || member?.legal_rep2_email;
        const recipientFirstName = member?.email
          ? member.first_name
          : member?.legal_rep1_email
          ? member.legal_rep1_firstname
          : member?.first_name;
        const recipientLastName = member?.email
          ? member.last_name
          : member?.legal_rep1_email
          ? `(parent de ${member.first_name} ${member.last_name})`
          : member?.last_name;

        if (!recipientEmail) {
          errors.push(`${invoice.invoice_number}: aucun email disponible`);
          continue;
        }

        const emailHtml = reminder_type
          ? generateReminderEmailTemplate(
              reminder_type,
              recipientFirstName,
              recipientLastName,
              invoice.invoice_number,
              season?.name || '',
              invoice.total_amount,
              invoice.due_date,
              clubName,
              clubEmail,
              clubPhone,
              clubAddress
            )
          : generateEmailTemplate(
              recipientFirstName,
              recipientLastName,
              invoice.invoice_number,
              season?.name || '',
              invoice.total_amount,
              invoice.due_date,
              clubName,
              clubEmail,
              clubPhone,
              clubAddress
            );

        const emailSubject = reminder_type === 'R1'
          ? `Rappel - Facture ${invoice.invoice_number} en attente de paiement`
          : reminder_type === 'R2'
          ? `2ème rappel - Facture ${invoice.invoice_number} - Action requise`
          : `Facture ${invoice.invoice_number} - ${clubName}`;

        const eventType = eventTypeForReminder(reminder_type);
        const recipientProfileId = await lookupProfileIdByEmail(recipientEmail);

        if (isSimulated) {
          console.log('SIMULATED EMAIL SEND:', {
            to: recipientEmail,
            subject: emailSubject,
            invoice_id: invoice.id
          });

          const updateData: any = reminder_type === 'R1'
            ? { reminder1_sent_at: new Date().toISOString(), sent_to_email: recipientEmail }
            : reminder_type === 'R2'
            ? { reminder2_sent_at: new Date().toISOString(), sent_to_email: recipientEmail }
            : { status: 'sent', sent_at: new Date().toISOString(), sent_to_email: recipientEmail };

          await supabaseAdmin
            .from('invoices')
            .update(updateData)
            .eq('id', invoice.id);

          logRows.push({
            event_type: eventType,
            recipient_id: recipientProfileId,
            sent_at: new Date().toISOString(),
            channel: 'email',
            payload: {
              invoice_id: invoice.id,
              invoice_number: invoice.invoice_number,
              total_amount: invoice.total_amount,
              recipient_email: recipientEmail,
              test_mode: isTestMode,
              simulated: true,
            },
            success: true,
          });

          sentCount++;
        } else {
          try {
            const toEmail = isTestMode ? testRedirect : recipientEmail;
            const finalSubject = isTestMode ? `[TEST] ${emailSubject}` : emailSubject;
            if (isTestMode) {
              console.log(`📧 TEST MODE: redirecting to ${toEmail} (intended: ${recipientEmail})`);
            } else {
              console.log(`📧 LIVE MODE: sending to ${toEmail}`);
            }

            const emailResponse = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: fromAddress,
                to: [toEmail],
                reply_to: clubEmail,
                subject: finalSubject,
                html: emailHtml
              })
            });

            if (!emailResponse.ok) {
              const errText = await emailResponse.text();
              errors.push(`${invoice.invoice_number}: ${errText}`);
              logRows.push({
                event_type: eventType,
                recipient_id: recipientProfileId,
                sent_at: new Date().toISOString(),
                channel: 'email',
                payload: {
                  invoice_id: invoice.id,
                  invoice_number: invoice.invoice_number,
                  total_amount: invoice.total_amount,
                  recipient_email: recipientEmail,
                  test_mode: isTestMode,
                  error: errText,
                },
                success: false,
              });
              continue;
            }

            const updateData: any = reminder_type === 'R1'
              ? { reminder1_sent_at: new Date().toISOString(), sent_to_email: recipientEmail }
              : reminder_type === 'R2'
              ? { reminder2_sent_at: new Date().toISOString(), sent_to_email: recipientEmail }
              : { status: 'sent', sent_at: new Date().toISOString(), sent_to_email: recipientEmail };

            await supabaseAdmin
              .from('invoices')
              .update(updateData)
              .eq('id', invoice.id);

            logRows.push({
              event_type: eventType,
              recipient_id: recipientProfileId,
              sent_at: new Date().toISOString(),
              channel: 'email',
              payload: {
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_number,
                total_amount: invoice.total_amount,
                recipient_email: recipientEmail,
                test_mode: isTestMode,
              },
              success: true,
            });

            sentCount++;
          } catch (err) {
            errors.push(`${invoice.invoice_number}: ${err.message}`);
            logRows.push({
              event_type: eventType,
              recipient_id: recipientProfileId,
              sent_at: new Date().toISOString(),
              channel: 'email',
              payload: {
                invoice_id: invoice.id,
                invoice_number: invoice.invoice_number,
                total_amount: invoice.total_amount,
                recipient_email: recipientEmail,
                test_mode: isTestMode,
                error: err.message,
              },
              success: false,
            });
          }
        }
      }

      if (logRows.length > 0) {
        const { error: logError } = await supabaseAdmin
          .from('notification_log')
          .insert(logRows);
        if (logError) console.error('❌ notification_log insert failed:', logError);
      }

      return new Response(
        JSON.stringify({
          success: true,
          sent: sentCount,
          simulated: isSimulated,
          errors: errors.length > 0 ? errors : undefined,
          message: isSimulated ? 'Emails simulés (RESEND_API_KEY non configuré)' : undefined
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Requête invalide' }),
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
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      }
    );
  }
});

function generateEmailTemplate(
  firstName: string,
  lastName: string,
  invoiceNumber: string,
  seasonName: string,
  amount: number,
  dueDate: string,
  clubName: string,
  clubEmail: string,
  clubPhone: string,
  clubAddress: string
): string {
  const formattedAmount = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const formattedDueDate = new Date(dueDate).toLocaleDateString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Facture ${invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${clubName}</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Facture de cotisation</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Bonjour <strong>${firstName} ${lastName}</strong>,
              </p>

              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Veuillez trouver ci-joint votre facture de cotisation <strong>${seasonName}</strong>, d'un montant de <strong>CHF ${formattedAmount}</strong>, à régler avant le <strong>${formattedDueDate}</strong>.
              </p>

              <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">N° Facture:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Montant:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">CHF ${formattedAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Date d'échéance:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${formattedDueDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Saison:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${seasonName}</td>
                  </tr>
                </table>
              </div>

              <p style="margin: 24px 0 0 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Le bulletin de versement QR est joint à cette facture. Vous pouvez effectuer le paiement par e-banking ou au guichet postal.
              </p>

              <p style="margin: 24px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                Pour toute question concernant cette facture, n'hésitez pas à nous contacter.
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color: #64748b; font-size: 13px; line-height: 1.6;">
                    <strong style="color: #1f2937; display: block; margin-bottom: 8px;">${clubName}</strong>
                    ${clubAddress ? `<div style="margin-bottom: 4px;">${clubAddress}</div>` : ''}
                    ${clubPhone ? `<div style="margin-bottom: 4px;">Tél: ${clubPhone}</div>` : ''}
                    ${clubEmail ? `<div>Email: <a href="mailto:${clubEmail}" style="color: #3b82f6; text-decoration: none;">${clubEmail}</a></div>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 20px; color: #94a3b8; font-size: 12px; text-align: center;">
                    Merci de votre confiance et de votre engagement dans notre club.
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
</html>
  `.trim();
}

function generateReminderEmailTemplate(
  reminderType: 'R1' | 'R2',
  firstName: string,
  lastName: string,
  invoiceNumber: string,
  seasonName: string,
  amount: number,
  dueDate: string,
  clubName: string,
  clubEmail: string,
  clubPhone: string,
  clubAddress: string
): string {
  const formattedAmount = amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  const formattedDueDate = new Date(dueDate).toLocaleDateString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const isR1 = reminderType === 'R1';
  const headerColor = isR1 ? '#dc2626' : '#991b1b';
  const accentColor = isR1 ? '#ef4444' : '#dc2626';

  const mainMessage = isR1
    ? `Nous constatons que la facture <strong>${invoiceNumber}</strong> pour la saison <strong>${seasonName}</strong>, d'un montant de <strong>CHF ${formattedAmount}</strong>, n'a pas encore été réglée. La date d'échéance du <strong>${formattedDueDate}</strong> est désormais dépassée.`
    : `Malgré notre premier rappel, nous constatons que la facture <strong>${invoiceNumber}</strong> pour la saison <strong>${seasonName}</strong>, d'un montant de <strong>CHF ${formattedAmount}</strong>, demeure impayée. Ceci constitue notre deuxième et dernier rappel.`;

  const actionMessage = isR1
    ? `Si vous avez déjà effectué le paiement, veuillez ne pas tenir compte de ce message. Dans le cas contraire, nous vous remercions de bien vouloir régulariser votre situation dans les plus brefs délais.`
    : `Nous vous prions instamment de procéder au règlement immédiat de cette facture. Si vous rencontrez des difficultés de paiement, nous vous invitons à nous contacter sans délai pour trouver une solution.`;

  const closingMessage = isR1
    ? `Si vous avez des questions ou besoin d'informations complémentaires, n'hésitez pas à nous contacter.`
    : `Sans réponse de votre part dans les 7 jours, nous serons contraints de prendre d'autres mesures pour recouvrer cette créance.`;

  return `
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isR1 ? 'Rappel' : '2ème rappel'} - Facture ${invoiceNumber}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <tr>
            <td style="background: linear-gradient(135deg, ${headerColor} 0%, ${accentColor} 100%); padding: 40px 30px; text-align: center; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">${clubName}</h1>
              <p style="margin: 8px 0 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">${isR1 ? 'Rappel de paiement' : '2ème rappel - Action requise'}</p>
            </td>
          </tr>

          <tr>
            <td style="padding: 40px 30px;">
              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                ${isR1 ? 'Bonjour' : 'Madame, Monsieur'} <strong>${firstName} ${lastName}</strong>,
              </p>

              <p style="margin: 0 0 24px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                ${mainMessage}
              </p>

              <div style="background-color: ${isR1 ? '#fef2f2' : '#fef2f2'}; border-left: 4px solid ${accentColor}; padding: 20px; margin: 24px 0; border-radius: 4px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">N° Facture:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${invoiceNumber}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Montant dû:</td>
                    <td style="padding: 8px 0; color: ${accentColor}; font-size: 16px; font-weight: 700; text-align: right;">CHF ${formattedAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Date d'échéance:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${formattedDueDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Saison:</td>
                    <td style="padding: 8px 0; color: #1f2937; font-size: 14px; font-weight: 600; text-align: right;">${seasonName}</td>
                  </tr>
                </table>
              </div>

              <p style="margin: 24px 0 0 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                ${actionMessage}
              </p>

              <p style="margin: 24px 0 0 0; color: #64748b; font-size: 14px; line-height: 1.6;">
                ${closingMessage}
              </p>

              ${isR1 ? '<p style="margin: 24px 0 0 0; color: #1f2937; font-size: 16px; line-height: 1.6;">Nous vous remercions de votre compréhension et de votre collaboration.</p>' : '<p style="margin: 24px 0 0 0; color: #1f2937; font-size: 16px; line-height: 1.6; font-weight: 600;">Nous comptons sur votre diligence.</p>'}
            </td>
          </tr>

          <tr>
            <td style="background-color: #f8fafc; padding: 30px; border-radius: 0 0 8px 8px; border-top: 1px solid #e2e8f0;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="color: #64748b; font-size: 13px; line-height: 1.6;">
                    <strong style="color: #1f2937; display: block; margin-bottom: 8px;">${clubName}</strong>
                    ${clubAddress ? `<div style="margin-bottom: 4px;">${clubAddress}</div>` : ''}
                    ${clubPhone ? `<div style="margin-bottom: 4px;">Tél: ${clubPhone}</div>` : ''}
                    ${clubEmail ? `<div>Email: <a href="mailto:${clubEmail}" style="color: ${accentColor}; text-decoration: none;">${clubEmail}</a></div>` : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding-top: 20px; color: #94a3b8; font-size: 12px; text-align: center;">
                    ${isR1 ? 'Ce message est un rappel automatique.' : 'Ceci est notre dernier rappel avant action.'}
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
</html>
  `.trim();
}
