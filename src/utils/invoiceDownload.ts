import { supabase } from '../lib/supabase';

export async function downloadInvoiceById(invoiceId: string): Promise<void> {
  const { data: invoice } = await supabase
    .from('invoices')
    .select(`
      *,
      member:members(
        first_name, last_name, salutation, address, street_number,
        postal_code, city, asf_licence_number
      ),
      sponsor:sponsors(
        company_name, contact_first_name, contact_last_name,
        address, postal_code, city, email
      ),
      registration:event_public_registrations(
        first_name, last_name, email, phone, address, postal_code, city,
        company, option_label, quantity,
        event:events(title, date)
      ),
      season:seasons(name),
      category:team_categories(name)
    `)
    .eq('id', invoiceId)
    .maybeSingle();

  if (!invoice) return;

  const { data: club } = await supabase
    .from('club_settings')
    .select('*')
    .maybeSingle();

  const { data: finance } = await supabase
    .from('finance_config')
    .select('*')
    .maybeSingle();

  const isSponsoring = invoice.invoice_type === 'sponsoring';
  const isEvent = invoice.invoice_type === 'evenement';
  const sponsorContactName = invoice.sponsor
    ? [invoice.sponsor.contact_first_name, invoice.sponsor.contact_last_name].filter(Boolean).join(' ')
    : '';

  if (isSponsoring && (!invoice.sponsor?.address || !invoice.sponsor?.postal_code || !invoice.sponsor?.city)) {
    throw new Error('Adresse du sponsor incomplète — complétez la fiche sponsor');
  }

  const reg = invoice.registration;

  const { generateInvoicePDF } = await import('./generateInvoicePDF');
  await generateInvoicePDF({
    invoice_number: invoice.invoice_number,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    qr_reference: invoice.qr_reference,
    notes: invoice.notes,

    member_first_name: invoice.member?.first_name || '',
    member_last_name: invoice.member?.last_name || '',
    member_salutation: invoice.member?.salutation,
    member_address: invoice.member?.address || '',
    member_street_number: invoice.member?.street_number,
    member_postal_code: invoice.member?.postal_code || '',
    member_city: invoice.member?.city || '',
    member_asf_licence: invoice.member?.asf_licence_number,

    base_amount: invoice.base_amount,
    fratrie_discount_pct: invoice.fratrie_discount_pct || 0,
    fratrie_discount_amount: invoice.fratrie_discount_amount || 0,
    reminder_fee: invoice.reminder_fee || 0,
    total_amount: invoice.total_amount,
    currency: invoice.currency || 'CHF',

    category_name: invoice.category?.name || '',
    season_name: invoice.season?.name || '',

    club_name: club?.club_name || '',
    club_address: club?.club_address || '',
    club_street_number: club?.club_street_number,
    club_postal_code: club?.club_postal_code || '',
    club_city: club?.club_city || '',
    club_email: club?.club_email || '',
    club_phone: club?.club_phone,
    club_website: club?.club_website,
    logo_url: club?.logo_url,

    qr_iban: finance?.qr_iban || '',
    bank_name: finance?.bank_name || '',
    bank_street: finance?.bank_street,
    bank_street_number: finance?.bank_street_number,
    bank_postal_code: finance?.bank_postal_code,
    bank_city: finance?.bank_city,

    contact_name: finance?.contact_name,
    contact_phone: finance?.contact_phone,
    payment_delay_days: finance?.payment_delay_days || 30,

    is_sponsoring: isSponsoring,
    sponsor_company_name: isSponsoring ? invoice.sponsor?.company_name : undefined,
    sponsor_contact_name: isSponsoring ? sponsorContactName : undefined,
    sponsor_address: isSponsoring ? invoice.sponsor?.address : undefined,
    sponsor_postal_code: isSponsoring ? invoice.sponsor?.postal_code : undefined,
    sponsor_city: isSponsoring ? invoice.sponsor?.city : undefined,

    is_event: isEvent,
    event_title: isEvent ? reg?.event?.title : undefined,
    event_date: isEvent ? reg?.event?.date : undefined,
    event_option_label: isEvent ? reg?.option_label : undefined,
    event_quantity: isEvent ? reg?.quantity : undefined,
    event_company: isEvent ? reg?.company : undefined,
    event_debtor_first_name: isEvent ? reg?.first_name : undefined,
    event_debtor_last_name: isEvent ? reg?.last_name : undefined,
    event_debtor_address: isEvent ? reg?.address : undefined,
    event_debtor_postal_code: isEvent ? reg?.postal_code : undefined,
    event_debtor_city: isEvent ? reg?.city : undefined,
  });
}
