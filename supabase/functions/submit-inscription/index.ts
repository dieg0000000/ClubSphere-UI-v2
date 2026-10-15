import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { sendResendBatched, type ResendPayload } from "../_shared/send-resend-batched.ts";
import { getFromAddress } from "../_shared/get-from-address.ts";
import { parsePhoneNumberFromString } from "npm:libphonenumber-js@1.13.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (t.length === 0 || t.length > 254) return false;
  if (t.includes("\n") || t.includes("\r")) return false;
  return EMAIL_REGEX.test(t);
}

function cleanPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function isValidPhoneServer(value: string | null): boolean {
  if (!value) return false;
  const parsed = parsePhoneNumberFromString(value, "CH");
  return parsed?.isValid() ?? false;
}

function toTitleCase(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = String(s).trim();
  if (!trimmed) return null;
  return trimmed.toLowerCase().replace(/(^|[\s\-'])(\p{L})/gu, (_m, sep, ch) => sep + ch.toUpperCase());
}

function computeAge(birthDate: string): number {
  const d = new Date(birthDate + "T00:00:00Z");
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

function formatDateDDMMYYYY(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface FormData {
  has_played_before?: boolean;
  asf_licence_number?: string | null;
  previous_club?: string | null;
  document_type?: string | null;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  gender?: string | null;
  nationality?: string | null;
  place_of_origin?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  player_email?: string | null;
  player_phone?: string | null;
  legal_rep1_firstname?: string | null;
  legal_rep1_lastname?: string | null;
  legal_rep1_email?: string | null;
  legal_rep1_phone?: string | null;
  legal_rep2_firstname?: string | null;
  legal_rep2_lastname?: string | null;
  legal_rep2_email?: string | null;
  legal_rep2_phone?: string | null;
  photo_consent?: boolean;
  privacy_consent?: boolean;
  id_card_front_path?: string | null;
  id_card_back_path?: string | null;
  permit_front_path?: string | null;
  permit_back_path?: string | null;
  passport_page_path?: string | null;
  health_insurance_card_path?: string | null;
  passport_photo_path?: string | null;
}

interface RequestBody {
  slug?: string;
  form_data?: FormData;
  honey_pot?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || req.headers.get("x-real-ip")
      || null;
    const userAgent = req.headers.get("user-agent") ?? null;
    // TODO(production): rate-limit to 4 submissions / IP / hour using Redis or durable counter.

    let body: RequestBody;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Requête invalide." });
    }

    // Anti-bot honey pot — silent fake success
    if (typeof body.honey_pot === "string" && body.honey_pot.trim().length > 0) {
      console.warn("submit-inscription: honey_pot tripped", { ip });
      return json(200, { success: true, request_id: crypto.randomUUID() });
    }

    const slug = (body.slug ?? "").trim();
    const form = body.form_data ?? {};

    if (!slug) {
      return json(400, { error: "Lien d'inscription invalide." });
    }

    const { data: club, error: clubErr } = await supabase
      .from("club_settings")
      .select("id, club_name, inscription_slug")
      .eq("inscription_slug", slug)
      .maybeSingle();

    if (clubErr) {
      console.error("submit-inscription: club lookup error", clubErr);
      return json(500, { error: "Une erreur est survenue. Veuillez réessayer plus tard." });
    }
    if (!club) {
      return json(404, { error: "Lien d'inscription invalide." });
    }

    const firstName = toTitleCase(form.first_name);
    const lastName = toTitleCase(form.last_name);
    if (!firstName || !lastName) {
      return json(400, { error: "Prénom et nom sont obligatoires." });
    }

    const birthDate = (form.birth_date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) {
      return json(400, { error: "Date de naissance invalide." });
    }
    const parsed = new Date(birthDate + "T00:00:00Z");
    if (Number.isNaN(parsed.getTime())) {
      return json(400, { error: "Date de naissance invalide." });
    }
    if (parsed.getTime() > Date.now()) {
      return json(400, { error: "Date de naissance invalide." });
    }
    const age = computeAge(birthDate);
    if (age < 4 || age > 99) {
      return json(400, { error: "Âge hors plage autorisée (4-99 ans)." });
    }

    if (typeof form.photo_consent !== "boolean") {
      return json(400, { error: "Le consentement image est requis." });
    }

    if (form.privacy_consent !== true) {
      return json(400, { error: "Vous devez accepter l'information sur la protection des données." });
    }

    const playerEmail = form.player_email ? form.player_email.trim().toLowerCase() : null;
    const legalRep1Email = form.legal_rep1_email ? form.legal_rep1_email.trim().toLowerCase() : null;
    const legalRep2Email = form.legal_rep2_email ? form.legal_rep2_email.trim().toLowerCase() : null;

    if (playerEmail && !isValidEmail(playerEmail)) {
      return json(400, { error: "Email joueur invalide." });
    }
    if (legalRep1Email && !isValidEmail(legalRep1Email)) {
      return json(400, { error: "Email du représentant légal 1 invalide." });
    }
    if (legalRep2Email && !isValidEmail(legalRep2Email)) {
      return json(400, { error: "Email du représentant légal 2 invalide." });
    }

    if (!playerEmail && !legalRep1Email) {
      return json(400, { error: "Au moins un email (joueur ou représentant légal) est requis." });
    }

    const legalRep1FirstName = toTitleCase(form.legal_rep1_firstname);
    const legalRep1LastName = toTitleCase(form.legal_rep1_lastname);
    const legalRep2FirstName = toTitleCase(form.legal_rep2_firstname);
    const legalRep2LastName = toTitleCase(form.legal_rep2_lastname);

    if (age < 18) {
      if (!legalRep1FirstName || !legalRep1LastName || !legalRep1Email) {
        return json(400, {
          error: "Pour un joueur mineur, les coordonnées du représentant légal sont obligatoires.",
        });
      }
    }

    const playerPhone = cleanPhone(form.player_phone);
    const legalRep1Phone = cleanPhone(form.legal_rep1_phone);
    const legalRep2Phone = cleanPhone(form.legal_rep2_phone);

    const phoneInvalidMsg = "Numéro de téléphone invalide.";
    if (playerPhone && !isValidPhoneServer(playerPhone)) {
      return json(400, { error: phoneInvalidMsg });
    }
    if (legalRep1Phone && !isValidPhoneServer(legalRep1Phone)) {
      return json(400, { error: phoneInvalidMsg });
    }
    if (legalRep2Phone && !isValidPhoneServer(legalRep2Phone)) {
      return json(400, { error: phoneInvalidMsg });
    }

    const asfLicence = form.asf_licence_number ? form.asf_licence_number.trim() : null;
    if (asfLicence && !/^\d{6,10}$/.test(asfLicence)) {
      return json(400, { error: "Le numéro de licence ASF doit contenir 6 à 10 chiffres." });
    }
    if (asfLicence) {
      const { data: existingMember, error: licenceErr } = await supabase
        .from("members")
        .select("id")
        .eq("asf_licence_number", asfLicence)
        .maybeSingle();
      if (licenceErr) {
        console.error("submit-inscription: licence lookup error", licenceErr);
      }
      if (existingMember) {
        return json(409, {
          error: "Vous êtes déjà inscrit dans un club. Contactez votre club actuel.",
        });
      }
    }

    const { data: duplicateRequest, error: dupErr } = await supabase
      .from("inscription_requests")
      .select("id")
      .eq("first_name", firstName)
      .eq("last_name", lastName)
      .eq("birth_date", birthDate)
      .in("status", ["pending", "in_progress"])
      .maybeSingle();
    if (dupErr) {
      console.error("submit-inscription: duplicate lookup error", dupErr);
    }
    if (duplicateRequest) {
      return json(409, {
        error: "Une demande pour cette personne est déjà en cours de traitement.",
      });
    }

    const verifyImage = async (path: string | null | undefined): Promise<boolean> => {
      if (!path) return true;
      const normalized = path.replace(/^\/+/, "");
      const idx = normalized.lastIndexOf("/");
      const dir = idx >= 0 ? normalized.slice(0, idx) : "";
      const file = idx >= 0 ? normalized.slice(idx + 1) : normalized;
      const { data, error } = await supabase.storage
        .from("inscription-id-cards")
        .list(dir, { search: file, limit: 10 });
      if (error) {
        console.error("submit-inscription: storage list error", error);
        return false;
      }
      return !!data?.some((o) => o.name === file);
    };

    const isTransfer = !!form.has_played_before;
    const docType = form.document_type ?? null;
    if (isTransfer) {
      if (!form.passport_photo_path) {
        return json(400, { error: "Image upload failed" });
      }
      const photoOk = await verifyImage(form.passport_photo_path);
      if (!photoOk) {
        return json(400, { error: "Image upload failed" });
      }
    } else {
      if (!form.health_insurance_card_path || !form.passport_photo_path) {
        return json(400, { error: "Image upload failed" });
      }
      const pathsToVerify: (string | null | undefined)[] = [form.health_insurance_card_path, form.passport_photo_path];
      if (docType === "ci") {
        if (!form.id_card_front_path || !form.id_card_back_path) return json(400, { error: "Image upload failed" });
        pathsToVerify.push(form.id_card_front_path, form.id_card_back_path);
      } else if (docType === "permit") {
        if (!form.permit_front_path || !form.permit_back_path) return json(400, { error: "Image upload failed" });
        pathsToVerify.push(form.permit_front_path, form.permit_back_path);
      } else if (docType === "passport") {
        if (!form.passport_page_path) return json(400, { error: "Image upload failed" });
        pathsToVerify.push(form.passport_page_path);
      } else {
        return json(400, { error: "Type de document invalide." });
      }
      const results = await Promise.all(pathsToVerify.map((p) => verifyImage(p)));
      if (results.some((ok) => !ok)) {
        return json(400, { error: "Image upload failed" });
      }
    }
    const previousClub = form.previous_club ? String(form.previous_club).trim() : null;

    const insertRow = {
      has_played_before: !!form.has_played_before,
      asf_licence_number: asfLicence,
      previous_club: isTransfer ? previousClub : null,
      document_type: isTransfer ? null : docType,
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      gender: form.gender?.trim() || null,
      nationality: form.nationality?.trim() || null,
      place_of_origin: form.place_of_origin?.trim() || null,
      address: form.address?.trim() || null,
      postal_code: form.postal_code?.trim() || null,
      city: form.city?.trim() || null,
      player_email: playerEmail,
      player_phone: playerPhone,
      legal_rep1_firstname: legalRep1FirstName,
      legal_rep1_lastname: legalRep1LastName,
      legal_rep1_email: legalRep1Email,
      legal_rep1_phone: legalRep1Phone,
      legal_rep2_firstname: legalRep2FirstName,
      legal_rep2_lastname: legalRep2LastName,
      legal_rep2_email: legalRep2Email,
      legal_rep2_phone: legalRep2Phone,
      photo_consent: form.photo_consent,
      photo_consent_date: form.photo_consent ? new Date().toISOString() : null,
      privacy_consent: true,
      privacy_consent_date: new Date().toISOString(),
      id_card_front_path: (!isTransfer && docType === "ci") ? (form.id_card_front_path ?? null) : null,
      id_card_back_path: (!isTransfer && docType === "ci") ? (form.id_card_back_path ?? null) : null,
      permit_front_path: (!isTransfer && docType === "permit") ? (form.permit_front_path ?? null) : null,
      permit_back_path: (!isTransfer && docType === "permit") ? (form.permit_back_path ?? null) : null,
      passport_page_path: (!isTransfer && docType === "passport") ? (form.passport_page_path ?? null) : null,
      health_insurance_card_path: isTransfer ? null : (form.health_insurance_card_path ?? null),
      passport_photo_path: form.passport_photo_path ?? null,
      avs_number_ocr: (() => {
        const v = form.avs_number_ocr ? String(form.avs_number_ocr).trim() : null;
        if (!v) return null;
        const cleaned = v.replace(/\s/g, "");
        return /^756\.\d{4}\.\d{4}\.\d{2}$/.test(cleaned) ? cleaned : null;
      })(),
      status: "pending",
      submitted_ip: ip,
      user_agent: userAgent,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("inscription_requests")
      .insert(insertRow)
      .select("id")
      .maybeSingle();

    if (insertErr || !inserted) {
      console.error("submit-inscription: insert error", insertErr);
      return json(500, { error: "Une erreur est survenue. Veuillez réessayer plus tard." });
    }

    const requestId = inserted.id as string;

    // Notify admins / committee — non-blocking for response correctness, but awaited for logs.
    try {
      const { data: recipients } = await supabase
        .from("profiles")
        .select("id, email, first_name, last_name")
        .in("role", ["admin", "committee", "president", "vice_president"]);

      const validRecipients = (recipients ?? []).filter((r) => isValidEmail(r.email));

      if (validRecipients.length > 0) {
        const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
        const from = await getFromAddress(supabase);
        const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
        const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

        const playerName = `${firstName} ${lastName}`;
        const birthDisplay = formatDateDDMMYYYY(birthDate);
        const contactEmail = playerEmail ?? legalRep1Email ?? "";
        const contactPhone = playerPhone ?? legalRep1Phone ?? "";
        const adminUrl = `${Deno.env.get("PUBLIC_APP_URL") ?? ""}/admin/inscriptions`;
        const clubName = club.club_name ?? "ClubSphere";

        const subjectBase = `Nouvelle demande d'inscription - ${playerName}`;
        const subject = isTestMode ? `[TEST] ${subjectBase}` : subjectBase;

        const html = `
          <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#111; max-width:600px; margin:0 auto; padding:24px;">
            <p>Bonjour,</p>
            <p>Une nouvelle demande d'inscription au club a été soumise via le formulaire public :</p>
            <ul style="line-height:1.6;">
              <li><strong>Joueur :</strong> ${escapeHtml(playerName)}</li>
              <li><strong>Date de naissance :</strong> ${escapeHtml(birthDisplay)} (${age} ans)</li>
              <li><strong>Email :</strong> ${escapeHtml(contactEmail)}</li>
              <li><strong>Téléphone :</strong> ${escapeHtml(contactPhone)}</li>
            </ul>
            <p>
              <a href="${escapeHtml(adminUrl)}" style="display:inline-block; background:#0f766e; color:#fff; padding:10px 16px; border-radius:6px; text-decoration:none;">
                Traiter la demande dans ClubSphere
              </a>
            </p>
            <p style="color:#555; font-size:13px;">Sportivement,<br/>${escapeHtml(clubName)}</p>
          </div>
        `;

        if (!apiKey) {
          console.warn("submit-inscription: RESEND_API_KEY not set — skipping emails");
        }

        const payloads: ResendPayload[] = validRecipients.map((r) => ({
          from,
          to: [isTestMode ? testRedirect : (r.email as string)],
          subject,
          html,
        }));

        const results = apiKey && payloads.length > 0
          ? await sendResendBatched(apiKey, payloads)
          : validRecipients.map(() => ({ email: "", ok: false, error: "resend_api_key_missing" }));

        const logRows = validRecipients.map((r, i) => ({
          event_type: "inscription_request_received",
          recipient_id: r.id,
          channel: "email",
          payload: {
            request_id: requestId,
            player_name: playerName,
            recipient_email: r.email,
            test_mode: isTestMode,
            ...(results[i]?.ok ? {} : { error: results[i]?.error ?? "unknown" }),
          },
          success: !!results[i]?.ok,
        }));

        if (logRows.length > 0) {
          const { error: logErr } = await supabase.from("notification_log").insert(logRows);
          if (logErr) console.error("submit-inscription: notification_log insert error", logErr);
        }
      }
    } catch (notifyErr) {
      console.error("submit-inscription: notification error", notifyErr);
    }

    // Confirmation email to the submitter (player if adult, else legal rep 1)
    try {
      const submitterEmail = age >= 18 ? (playerEmail ?? legalRep1Email) : (legalRep1Email ?? playerEmail);
      if (submitterEmail && isValidEmail(submitterEmail)) {
        const apiKey = Deno.env.get("RESEND_API_KEY") ?? "";
        const from = await getFromAddress(supabase);
        const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
        const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);

        const clubName = club.club_name ?? "ClubSphere";
        const playerName = `${firstName} ${lastName}`;
        const subjectBase = `Confirmation de votre demande d'inscription - ${clubName}`;
        const subject = isTestMode ? `[TEST] ${subjectBase}` : subjectBase;

        const birthDisplay = formatDateDDMMYYYY(birthDate);
        const genderLabel = (() => {
          const g = (form.gender ?? "").trim().toLowerCase();
          if (g === "male" || g === "masculin" || g === "m") return "Masculin";
          if (g === "female" || g === "féminin" || g === "feminin" || g === "f") return "Féminin";
          if (g === "o" || g === "autre" || g === "other") return "Autre";
          if (g) return escapeHtml(form.gender as string);
          return null;
        })();
        const nationality = form.nationality?.trim() || null;
        const placeOfOrigin = form.place_of_origin?.trim() || null;
        const address = form.address?.trim() || null;
        const postalCode = form.postal_code?.trim() || null;
        const city = form.city?.trim() || null;

        const sectionTitle = (label: string) =>
          `<tr><td colspan="2" style="background:#f3f4f6; padding:8px 12px; font-weight:600; font-size:13px; color:#374151; text-transform:uppercase; letter-spacing:0.5px; border-radius:4px;">${escapeHtml(label)}</td></tr>`;
        const row = (label: string, value: string | null) =>
          value
            ? `<tr><td style="padding:6px 12px; color:#6b7280; width:180px; vertical-align:top;">${escapeHtml(label)}</td><td style="padding:6px 12px; color:#111; vertical-align:top;">${escapeHtml(value)}</td></tr>`
            : "";
        const spacer = `<tr><td colspan="2" style="height:12px;"></td></tr>`;

        let recap = `<table cellpadding="0" cellspacing="0" style="width:100%; border-collapse:collapse; font-size:14px; line-height:1.5;">`;

        recap += sectionTitle("Antécédents");
        recap += row("Déjà licencié", form.has_played_before ? "Oui" : "Non");
        if (form.has_played_before && asfLicence) {
          recap += row("N° de licence ASF", asfLicence);
        }
        if (isTransfer && previousClub) {
          recap += row("Club précédent", previousClub);
        }
        recap += spacer;

        recap += sectionTitle("Identité");
        recap += row("Nom complet", playerName);
        recap += row("Date de naissance", birthDisplay);
        recap += row("Sexe", genderLabel);
        recap += row("Nationalité", nationality);
        recap += row("Lieu d'origine", placeOfOrigin);
        recap += spacer;

        if (address || postalCode || city) {
          recap += sectionTitle("Adresse");
          if (address) recap += row("Rue", address);
          const postalCityLine = [postalCode, city].filter(Boolean).join(" ");
          if (postalCityLine) recap += row("NPA / Localité", postalCityLine);
          recap += spacer;
        }

        if (playerEmail || playerPhone) {
          recap += sectionTitle("Contact joueur");
          recap += row("Email", playerEmail);
          recap += row("Téléphone", playerPhone);
          recap += spacer;
        }

        if (age < 18) {
          recap += sectionTitle("Représentant légal 1");
          const lr1Name = [legalRep1FirstName, legalRep1LastName].filter(Boolean).join(" ");
          recap += row("Nom complet", lr1Name || null);
          recap += row("Email", legalRep1Email);
          recap += row("Téléphone", legalRep1Phone);
          recap += spacer;
        }

        const lr2Name = [legalRep2FirstName, legalRep2LastName].filter(Boolean).join(" ");
        if (lr2Name || legalRep2Email || legalRep2Phone) {
          recap += sectionTitle("Représentant légal 2");
          recap += row("Nom complet", lr2Name || null);
          recap += row("Email", legalRep2Email);
          recap += row("Téléphone", legalRep2Phone);
          recap += spacer;
        }

        recap += sectionTitle("Documents");
        recap += `<tr><td colspan="2" style="padding:6px 12px; color:#111;">${isTransfer
          ? "Votre photo type passeport a bien été reçue. Pour des raisons de sécurité et conformément à la protection des données, elle n'est pas incluse dans cet email."
          : "Vos documents d'identité (carte d'identité recto/verso, carte d'assurance maladie et photo type passeport) ont bien été reçus. Pour des raisons de sécurité et conformément à la protection des données, ils ne sont pas inclus dans cet email."}</td></tr>`;
        recap += spacer;

        recap += sectionTitle("Autorisation d'image");
        recap += `<tr><td colspan="2" style="padding:6px 12px; color:#111;">J'autorise ${escapeHtml(clubName)} à diffuser des photos/vidéos du joueur&nbsp;: <strong>${form.photo_consent ? "Oui" : "Non"}</strong></td></tr>`;

        recap += `</table>`;

        const html = `
          <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; color:#111; max-width:640px; margin:0 auto; padding:24px;">
            <p>Bonjour,</p>
            <p>Nous avons bien reçu votre demande d'inscription au <strong>${escapeHtml(clubName)}</strong> pour <strong>${escapeHtml(playerName)}</strong>.</p>
            <p>Voici le récapitulatif des informations transmises&nbsp;:</p>
            ${recap}
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;" />
            <p>Un membre du comité va examiner votre demande et vous recontactera prochainement.</p>
            <p>Si vous remarquez une erreur dans ces informations, contactez-nous pour corriger.</p>
            <p style="color:#555; font-size:13px; margin-top:24px;">Sportivement,<br/>${escapeHtml(clubName)}</p>
          </div>
        `;

        const payload: ResendPayload = {
          from,
          to: [isTestMode ? testRedirect : submitterEmail],
          subject,
          html,
        };

        let ok = false;
        let errMsg: string | undefined;
        if (apiKey) {
          const [result] = await sendResendBatched(apiKey, [payload]);
          ok = !!result?.ok;
          errMsg = result?.error;
        } else {
          errMsg = "resend_api_key_missing";
        }

        const { error: logErr } = await supabase.from("notification_log").insert({
          event_type: "inscription_request_confirmation_sent",
          recipient_id: null,
          channel: "email",
          payload: {
            request_id: requestId,
            recipient_email: submitterEmail,
            player_name: playerName,
            test_mode: isTestMode,
            ...(ok ? {} : { error: errMsg ?? "unknown" }),
          },
          success: ok,
        });
        if (logErr) console.error("submit-inscription: confirmation log error", logErr);
      }
    } catch (confirmErr) {
      console.error("submit-inscription: confirmation email error", confirmErr);
    }

    return json(200, { success: true, request_id: requestId });
  } catch (err) {
    console.error("submit-inscription: unexpected error", err);
    return json(500, { error: "Une erreur est survenue. Veuillez réessayer plus tard." });
  }
});
