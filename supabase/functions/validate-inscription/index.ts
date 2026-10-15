import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Image } from "https://deno.land/x/imagescript@1.2.17/mod.ts";
import { parsePhoneNumberFromString } from "npm:libphonenumber-js@1.13.1";
import { getFromAddress } from "../_shared/get-from-address.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false;
  const t = s.trim();
  if (!t || t.length > 254 || t.includes("\n") || t.includes("\r")) return false;
  return EMAIL_RE.test(t);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatPhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const parsed = parsePhoneNumberFromString(p, "CH");
  return parsed?.formatInternational() ?? p;
}

function formatDateFr(date: string | null | undefined): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function calcAge(birth: string | null | undefined): number | null {
  if (!birth) return null;
  const d = new Date(birth);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SOURCE_BUCKET = "inscription-id-cards";
const TARGET_BUCKET = "member-photos";

const AVS_RE = /^756\.\d{4}\.\d{4}\.\d{2}$/;

interface Payload {
  inscription_request_id?: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  gender?: string | null;
  nationality?: string | null;
  address?: string | null;
  postal_code?: string | null;
  city?: string | null;
  canton?: string | null;
  email?: string | null;
  phone?: string | null;
  legal_rep1_firstname?: string | null;
  legal_rep1_lastname?: string | null;
  legal_rep1_email?: string | null;
  legal_rep1_phone?: string | null;
  legal_rep1_relation?: string | null;
  legal_rep2_firstname?: string | null;
  legal_rep2_lastname?: string | null;
  legal_rep2_email?: string | null;
  legal_rep2_phone?: string | null;
  legal_rep2_relation?: string | null;
  avs_number?: string;
  affiliation_date?: string;
  team_id?: string;
  photo_consent?: boolean;
}

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Identify the caller via their JWT (anon key client + auth header)
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: authData, error: authErr } = await authClient.auth.getUser();
    if (authErr || !authData.user) return json(401, { error: "Non authentifié." });

    const callerId = authData.user.id;

    const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: callerProfile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, role")
      .eq("id", callerId)
      .maybeSingle();
    if (profileErr || !callerProfile) return json(403, { error: "Profil introuvable." });
    const allowedRoles = ["admin", "committee", "president", "vice_president"];
    if (!allowedRoles.includes(callerProfile.role)) {
      return json(403, { error: "Accès refusé." });
    }

    let body: Payload;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Requête invalide." });
    }

    const requestId = (body.inscription_request_id ?? "").trim();
    if (!requestId) return json(400, { error: "inscription_request_id manquant." });

    const firstName = (body.first_name ?? "").trim();
    const lastName = (body.last_name ?? "").trim();
    const birthDate = (body.birth_date ?? "").trim();
    const avsNumber = (body.avs_number ?? "").trim();
    const affiliationDate = (body.affiliation_date ?? "").trim();
    const teamId = (body.team_id ?? "").trim();

    if (!firstName || !lastName) return json(400, { error: "Prénom et nom sont obligatoires." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return json(400, { error: "Date de naissance invalide." });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(affiliationDate)) return json(400, { error: "Date d'affiliation invalide." });
    if (!teamId) return json(400, { error: "Équipe requise." });

    const asfLicenceInput = body.asf_licence_number === undefined
      ? undefined
      : (body.asf_licence_number === null ? null : String(body.asf_licence_number).trim());
    if (asfLicenceInput && !/^\d{6,10}$/.test(asfLicenceInput)) {
      return json(400, { error: "Le numéro de licence ASF doit contenir 6 à 10 chiffres." });
    }

    const { data: request, error: reqErr } = await supabase
      .from("inscription_requests")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (reqErr) {
      console.error("validate-inscription: fetch request error", reqErr);
      return json(500, { error: "Erreur de lecture de la demande." });
    }
    if (!request) return json(404, { error: "Demande introuvable." });
    if (request.status !== "in_progress") {
      return json(409, { error: "Cette demande n'est pas en cours de traitement." });
    }
    if (request.processed_by !== callerId) {
      return json(403, { error: "Cette demande est traitée par un autre administrateur." });
    }

    const isTransfer = request.has_played_before === true;
    if (!avsNumber) {
      if (!isTransfer) {
        return json(400, { error: "Le numéro AVS est obligatoire pour une première inscription." });
      }
    } else if (!AVS_RE.test(avsNumber)) {
      return json(400, { error: "Numéro AVS invalide (format 756.XXXX.XXXX.XX)." });
    }

    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .maybeSingle();
    if (teamErr || !team) return json(400, { error: "Équipe introuvable." });

    if (avsNumber) {
      const { data: avsDup, error: avsErr } = await supabase
        .from("members")
        .select("id, first_name, last_name")
        .eq("avs_number", avsNumber)
        .maybeSingle();
      if (avsErr) {
        console.error("validate-inscription: avs lookup error", avsErr);
        return json(500, { error: "Erreur lors de la vérification AVS." });
      }
      if (avsDup) {
        return json(409, { error: `Ce numéro AVS est déjà utilisé par ${avsDup.first_name} ${avsDup.last_name}.` });
      }
    }

    // Pre-generate member id so we can place the photo under a stable path before insert.
    const newMemberId = crypto.randomUUID();

    // Step 1 — copy passport photo from private bucket to public member-photos bucket.
    let publicPhotoUrl: string | null = null;
    let newPhotoPath: string | null = null;

    if (request.passport_photo_path) {
      const srcPath = request.passport_photo_path as string;
      const { data: downloaded, error: dlErr } = await supabase.storage
        .from(SOURCE_BUCKET)
        .download(srcPath);
      if (dlErr || !downloaded) {
        console.error("validate-inscription: download photo error", dlErr);
        return json(500, {
          error: "Impossible de récupérer la photo du joueur.",
          details: (dlErr as { message?: string } | null)?.message ?? null,
        });
      }

      let jpegBuffer: Uint8Array;
      try {
        const buffer = new Uint8Array(await downloaded.arrayBuffer());
        const image = await Image.decode(buffer);
        const maxDim = 600;
        if (image.width > maxDim || image.height > maxDim) {
          const ratio = Math.min(maxDim / image.width, maxDim / image.height);
          const targetWidth = Math.round(image.width * ratio);
          const targetHeight = Math.round(image.height * ratio);
          image.resize(targetWidth, targetHeight);
        }
        jpegBuffer = await image.encodeJPEG(80);
      } catch (resizeErr) {
        console.error("validate-inscription: image resize error", resizeErr);
        return json(500, {
          error: "Échec du traitement de la photo. Vérifiez que c'est bien une image valide (JPEG, PNG ou WebP).",
          details: resizeErr instanceof Error ? resizeErr.message : String(resizeErr),
        });
      }

      const uploadPath = `${newMemberId}/passport-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage
        .from(TARGET_BUCKET)
        .upload(uploadPath, jpegBuffer, { contentType: "image/jpeg", upsert: false });
      if (upErr) {
        console.error("validate-inscription: upload photo error", upErr);
        return json(500, {
          error: "Échec de l'enregistrement de la photo.",
          details: upErr.message,
        });
      }
      newPhotoPath = uploadPath;
      const { data: pub } = supabase.storage.from(TARGET_BUCKET).getPublicUrl(uploadPath);
      publicPhotoUrl = pub.publicUrl;
    }

    // Step 2 — insert member row.
    const memberRow = {
      id: newMemberId,
      first_name: firstName,
      last_name: lastName,
      birth_date: birthDate,
      gender: body.gender?.trim() || null,
      nationality: body.nationality?.trim() || null,
      address: body.address?.trim() || null,
      postal_code: body.postal_code?.trim() || null,
      city: body.city?.trim() || null,
      canton: body.canton?.trim() || null,
      email: body.email ? body.email.trim().toLowerCase() : null,
      phone: body.phone?.trim() || null,
      legal_rep1_firstname: body.legal_rep1_firstname?.trim() || null,
      legal_rep1_lastname: body.legal_rep1_lastname?.trim() || null,
      legal_rep1_email: body.legal_rep1_email ? body.legal_rep1_email.trim().toLowerCase() : null,
      legal_rep1_phone: body.legal_rep1_phone?.trim() || null,
      legal_rep1_relation: body.legal_rep1_relation?.trim() || null,
      legal_rep2_firstname: body.legal_rep2_firstname?.trim() || null,
      legal_rep2_lastname: body.legal_rep2_lastname?.trim() || null,
      legal_rep2_email: body.legal_rep2_email ? body.legal_rep2_email.trim().toLowerCase() : null,
      legal_rep2_phone: body.legal_rep2_phone?.trim() || null,
      legal_rep2_relation: body.legal_rep2_relation?.trim() || null,
      avs_number: avsNumber || null,
      asf_licence_number: asfLicenceInput === undefined
        ? (request.asf_licence_number ?? null)
        : (asfLicenceInput || null),
      affiliation_date: affiliationDate,
      team_id: teamId,
      photo_url: publicPhotoUrl,
      photo_consent: typeof body.photo_consent === "boolean" ? body.photo_consent : !!request.photo_consent,
      photo_consent_date: (typeof body.photo_consent === "boolean" ? body.photo_consent : !!request.photo_consent)
        ? new Date().toISOString()
        : null,
      inscription_request_id: requestId,
      licence_status: "actif",
      status: "actif",
    };

    const { error: insertErr } = await supabase.from("members").insert(memberRow);
    if (insertErr) {
      console.error("validate-inscription: member insert error", insertErr);
      if (newPhotoPath) {
        console.warn("validate-inscription: orphan photo to clean up", newPhotoPath);
      }
      const err = insertErr as { code?: string; message?: string; hint?: string; details?: string };
      if (err.code === "23505") {
        return json(409, {
          error: "Un joueur avec ces informations existe déjà (conflit d'unicité).",
          details: err.message ?? null,
          code: err.code ?? null,
          hint: err.hint ?? null,
        });
      }
      return json(500, {
        error: "Erreur lors de la création du joueur.",
        details: err.message ?? err.details ?? null,
        code: err.code ?? null,
        hint: err.hint ?? null,
      });
    }

    // Mirror into team_members junction table for consistency.
    const { error: tmErr } = await supabase
      .from("team_members")
      .insert({ team_id: teamId, member_id: newMemberId });
    if (tmErr) {
      console.warn("validate-inscription: team_members insert warning", tmErr);
    }

    // Step 3 — update inscription_requests.
    const { error: updateErr } = await supabase
      .from("inscription_requests")
      .update({
        status: "validated",
        validated_at: new Date().toISOString(),
        member_id: newMemberId,
        team_id: teamId,
      })
      .eq("id", requestId);
    if (updateErr) {
      console.error("validate-inscription: request update error", updateErr);
    }

    // Step 4 — cleanup source images (best effort).
    const toRemove = [
      request.id_card_front_path,
      request.id_card_back_path,
      request.health_insurance_card_path,
      request.passport_photo_path,
    ].filter((p): p is string => !!p);
    if (toRemove.length > 0) {
      const { error: rmErr } = await supabase.storage.from(SOURCE_BUCKET).remove(toRemove);
      if (rmErr) console.warn("validate-inscription: source cleanup warning", rmErr);
    }

    // Phase 1.6c — email cascade (best effort; failures don't block).
    const emailsSummary = {
      coach_count: 0,
      welcome: false,
      charte_count: 0,
    };
    const emailsFailed: Array<{ step: string; error: string }> = [];

    try {
      const resendKey = Deno.env.get("RESEND_API_KEY") ?? "";
      const testRedirect = (Deno.env.get("TEST_MODE_EMAIL_REDIRECT") ?? "").trim();
      const isTestMode = testRedirect.length > 0 && /.+@.+\..+/.test(testRedirect);
      const appUrl = Deno.env.get("PUBLIC_APP_URL") ?? Deno.env.get("APP_URL") ?? "https://app.clubsphere.ch";

      const { data: clubSettings } = await supabase
        .from("club_settings")
        .select("club_name, club_email, primary_color, primary_dark, logo_url")
        .maybeSingle();
      const clubName = clubSettings?.club_name ?? "ClubSphere";
      const clubEmail = clubSettings?.club_email ?? "";
      const primaryColor = clubSettings?.primary_color ?? "#CC0000";
      const primaryDark = clubSettings?.primary_dark ?? "#990000";
      const logoUrl = clubSettings?.logo_url ?? "";
      const fromAddress = await getFromAddress(supabase as unknown as Parameters<typeof getFromAddress>[0]);

      const testBadge = isTestMode
        ? `<div style="background:#fef3c7;color:#92400e;padding:8px 12px;border-radius:6px;margin-bottom:16px;font-size:12px;font-weight:600">TEST — Envoi redirigé</div>`
        : "";

      const emailShell = (title: string, innerHtml: string) => `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:30px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
        <tr>
          <td style="background:linear-gradient(135deg,${primaryColor} 0%,${primaryDark} 100%);padding:28px 30px;text-align:center;border-radius:8px 8px 0 0;">
            ${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(clubName)}" style="max-height:56px;margin-bottom:8px;" />` : ""}
            <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${escapeHtml(clubName)}</h1>
          </td>
        </tr>
        <tr><td style="padding:28px 30px;color:#1f2937;font-size:14px;line-height:1.6;">${testBadge}${innerHtml}</td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

      async function sendOne(toEmail: string, subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
        if (!resendKey) {
          console.log("SIMULATED EMAIL:", { to: toEmail, subject });
          return { ok: true };
        }
        const delivered = isTestMode ? testRedirect : toEmail;
        try {
          const resp = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: fromAddress,
              to: [delivered],
              reply_to: clubEmail || undefined,
              subject,
              html,
            }),
          });
          if (!resp.ok) return { ok: false, error: `Resend ${resp.status}: ${await resp.text()}` };
          return { ok: true };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      }

      // Load team + coaches for downstream lookups.
      const { data: teamRow } = await supabase
        .from("teams")
        .select("id, name, category_id, coach_id, assistant_coach_id, training_days, training_time, training_location")
        .eq("id", teamId)
        .maybeSingle();
      const teamName = teamRow?.name ?? team.name;

      let teamCategoryName: string | null = null;
      if (teamRow?.category_id) {
        const { data: cat } = await supabase
          .from("team_categories")
          .select("name")
          .eq("id", teamRow.category_id)
          .maybeSingle();
        teamCategoryName = cat?.name ?? null;
      }

      const coachIds = [teamRow?.coach_id, teamRow?.assistant_coach_id].filter((v): v is string => !!v);
      type CoachRow = { id: string; user_id: string | null; first_name: string | null; last_name: string | null; email: string | null };
      let coaches: CoachRow[] = [];
      if (coachIds.length > 0) {
        const { data: coachList } = await supabase
          .from("coaches")
          .select("id, user_id, first_name, last_name, email")
          .in("id", coachIds);
        coaches = (coachList ?? []) as CoachRow[];
      }

      const playerAge = calcAge(birthDate);
      const isMinor = playerAge !== null && playerAge < 18;

      // ───── EMAIL 1 — Coach notification ─────
      const validCoachRecipients = coaches.filter(c => isValidEmail(c.email));
      const playerPhoneFmt = formatPhone(memberRow.phone);
      const lrPhoneFmt = formatPhone(memberRow.legal_rep1_phone);

      const coachBody = (coachFirstName: string) => {
        const lines: string[] = [];
        lines.push(`<p>Bonjour <strong>${escapeHtml(coachFirstName || "")}</strong>,</p>`);
        lines.push(`<p>Un nouveau joueur a été affecté à votre équipe <strong>${escapeHtml(teamName)}</strong> :</p>`);
        lines.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Infos joueur</h3><ul style="margin:0;padding-left:20px;">`);
        lines.push(`<li>Nom : ${escapeHtml(firstName)} ${escapeHtml(lastName)}</li>`);
        const ageSuffix = playerAge !== null ? ` (${playerAge} ans)` : "";
        lines.push(`<li>Date de naissance : ${formatDateFr(birthDate)}${ageSuffix}</li>`);
        if (memberRow.email) lines.push(`<li>Email : ${escapeHtml(memberRow.email)}</li>`);
        if (playerPhoneFmt) lines.push(`<li>Téléphone : ${escapeHtml(playerPhoneFmt)}</li>`);
        lines.push(`</ul>`);
        if (isMinor && (memberRow.legal_rep1_firstname || memberRow.legal_rep1_lastname || memberRow.legal_rep1_email || memberRow.legal_rep1_phone)) {
          lines.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Contact responsable</h3><ul style="margin:0;padding-left:20px;">`);
          lines.push(`<li>Représentant légal : ${escapeHtml(memberRow.legal_rep1_firstname || "")} ${escapeHtml(memberRow.legal_rep1_lastname || "")}</li>`);
          if (memberRow.legal_rep1_email) lines.push(`<li>Email : ${escapeHtml(memberRow.legal_rep1_email)}</li>`);
          if (lrPhoneFmt) lines.push(`<li>Téléphone : ${escapeHtml(lrPhoneFmt)}</li>`);
          lines.push(`</ul>`);
        }
        lines.push(`<p style="margin-top:18px;">Vous pouvez le retrouver dans votre espace ClubSphere → Mon Équipe.</p>`);
        lines.push(`<p style="color:#6b7280;margin-top:18px;">Sportivement,<br/>${escapeHtml(clubName)}</p>`);
        return lines.join("");
      };

      async function logNotification(eventType: string, recipientId: string | null, payload: Record<string, unknown>, success: boolean) {
        await supabase.from("notification_log").insert({
          event_type: eventType,
          recipient_id: recipientId,
          channel: "email",
          payload,
          success,
        });
      }

      if (validCoachRecipients.length > 0) {
        for (const c of validCoachRecipients) {
          const base = `Nouveau joueur dans votre équipe - ${firstName} ${lastName}`;
          const subject = isTestMode ? `[TEST] ${base}` : base;
          const html = emailShell(base, coachBody(c.first_name || ""));
          const res = await sendOne(c.email as string, subject, html);
          if (res.ok) emailsSummary.coach_count++;
          else emailsFailed.push({ step: `coach:${c.email}`, error: res.error || "unknown" });
          await logNotification("inscription_coach_notified", c.user_id, {
            inscription_request_id: requestId,
            member_id: newMemberId,
            team_id: teamId,
            coach_id: c.id,
            recipient_email: c.email,
            player_name: `${firstName} ${lastName}`,
            fallback_to_admin: false,
            test_mode: isTestMode,
            error: res.ok ? null : res.error,
          }, res.ok);
        }
      } else {
        // Fallback to admins/committee.
        const { data: admins } = await supabase
          .from("profiles")
          .select("id, email, first_name")
          .in("role", ["admin", "committee", "president", "vice_president"]);
        const adminRecipients = (admins ?? []).filter(a => isValidEmail(a.email));
        const base = `[Action requise] Nouveau joueur sans entraîneur - ${firstName} ${lastName}`;
        const subject = isTestMode ? `[TEST] ${base}` : base;
        const inner = `
          <p>Bonjour,</p>
          <p>Un nouveau joueur vient d'être validé pour l'équipe <strong>${escapeHtml(teamName)}</strong> :</p>
          <p><strong>${escapeHtml(firstName)} ${escapeHtml(lastName)}</strong></p>
          <p>Aucun entraîneur n'est associé à cette équipe ou aucun ne possède d'email valide. Merci de prendre contact avec le nouveau joueur.</p>
          <p style="color:#6b7280;margin-top:18px;">Sportivement,<br/>${escapeHtml(clubName)}</p>
        `;
        const html = emailShell(base, inner);
        for (const a of adminRecipients) {
          const res = await sendOne(a.email as string, subject, html);
          if (res.ok) emailsSummary.coach_count++;
          else emailsFailed.push({ step: `admin-fallback:${a.email}`, error: res.error || "unknown" });
          await logNotification("inscription_coach_notified", a.id, {
            inscription_request_id: requestId,
            member_id: newMemberId,
            team_id: teamId,
            coach_id: null,
            recipient_email: a.email,
            player_name: `${firstName} ${lastName}`,
            fallback_to_admin: true,
            test_mode: isTestMode,
            error: res.ok ? null : res.error,
          }, res.ok);
        }
      }

      // ───── EMAIL 2 — Welcome to player/parent ─────
      let welcomeEmail: string | null = null;
      let welcomeKind: "player" | "legal_rep1" | null = null;
      if (isMinor) {
        if (isValidEmail(memberRow.legal_rep1_email)) {
          welcomeEmail = memberRow.legal_rep1_email;
          welcomeKind = "legal_rep1";
        }
      } else {
        if (isValidEmail(memberRow.email)) {
          welcomeEmail = memberRow.email;
          welcomeKind = "player";
        }
      }

      // Check for active charte docs for this team (used in welcome body AND Email 3).
      const { data: seasonsRows } = await supabase.from("seasons").select("id, active");
      const activeSeason = (seasonsRows ?? []).find((s: { active?: boolean }) => s.active);
      let chartesForTeam: Array<{ id: string; title: string }> = [];
      if (activeSeason) {
        const { data: docs } = await supabase
          .from("documents")
          .select("id, title, target_team_ids, category, is_active, season_id")
          .eq("is_active", true)
          .eq("season_id", activeSeason.id)
          .in("category", ["charte_joueurs", "charte_joueurs_mineurs"]);
        chartesForTeam = (docs ?? []).filter((d: { target_team_ids?: string[] | null }) => {
          const t = d.target_team_ids;
          return !t || t.length === 0 || t.includes(teamId);
        }).map((d: { id: string; title: string }) => ({ id: d.id, title: d.title }));
      }

      if (welcomeEmail && welcomeKind) {
        const coachNames = coaches
          .map(c => `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim())
          .filter(n => n.length > 0);
        const coachLine = coachNames.length === 0
          ? null
          : coachNames.length === 1
            ? coachNames[0]
            : `${coachNames[0]} et ${coachNames.slice(1).join(", ")}`;

        const trainingDays = Array.isArray(teamRow?.training_days) ? teamRow.training_days : [];
        const hasTraining = trainingDays.length > 0 || teamRow?.training_time || teamRow?.training_location;

        const parts: string[] = [];
        parts.push(`<p>Bonjour,</p>`);
        parts.push(`<p>Nous avons le plaisir de vous confirmer l'inscription de <strong>${escapeHtml(firstName)} ${escapeHtml(lastName)}</strong> au ${escapeHtml(clubName)}.</p>`);
        parts.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Votre équipe</h3><ul style="margin:0;padding-left:20px;">`);
        parts.push(`<li>Équipe : ${escapeHtml(teamName)}</li>`);
        if (teamCategoryName) parts.push(`<li>Catégorie : ${escapeHtml(teamCategoryName)}</li>`);
        if (coachLine) parts.push(`<li>Entraîneur(s) : ${escapeHtml(coachLine)}</li>`);
        parts.push(`</ul>`);

        parts.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Entraînements</h3>`);
        if (hasTraining) {
          parts.push(`<ul style="margin:0;padding-left:20px;">`);
          if (trainingDays.length > 0) parts.push(`<li>Jours : ${escapeHtml(trainingDays.join(" / "))}</li>`);
          if (teamRow?.training_time) parts.push(`<li>Horaire : ${escapeHtml(teamRow.training_time)}</li>`);
          if (teamRow?.training_location) parts.push(`<li>Lieu : ${escapeHtml(teamRow.training_location)}</li>`);
          parts.push(`</ul>`);
        } else {
          parts.push(`<p>Les horaires d'entraînement vous seront communiqués prochainement par l'entraîneur.</p>`);
        }

        parts.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Accès à l'application</h3>`);
        parts.push(`<p>Pour suivre les actualités, événements et communications du club, créez votre compte sur ClubSphere :</p>`);
        parts.push(`<p style="margin:18px 0;"><a href="${escapeHtml(appUrl)}/login" style="display:inline-block;background:${primaryColor};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600;">Créer mon compte</a></p>`);
        parts.push(`<p style="font-size:13px;color:#6b7280;">Vous aurez besoin du numéro AVS du joueur.</p>`);

        if (chartesForTeam.length > 0) {
          parts.push(`<h3 style="margin:18px 0 6px 0;font-size:14px;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;">Charte du club</h3>`);
          parts.push(`<p>Une charte du club est à valider. Vous trouverez les détails dans un email séparé.</p>`);
        }

        parts.push(`<p style="color:#6b7280;margin-top:18px;">Sportivement,<br/>${escapeHtml(clubName)}</p>`);

        const base = `Bienvenue au ${clubName} !`;
        const subject = isTestMode ? `[TEST] ${base}` : base;
        const html = emailShell(base, parts.join(""));
        const res = await sendOne(welcomeEmail, subject, html);
        emailsSummary.welcome = res.ok;
        if (!res.ok) emailsFailed.push({ step: "welcome", error: res.error || "unknown" });
        await logNotification("inscription_welcome_sent", null, {
          inscription_request_id: requestId,
          member_id: newMemberId,
          team_id: teamId,
          recipient_email: welcomeEmail,
          recipient_kind: welcomeKind,
          test_mode: isTestMode,
          error: res.ok ? null : res.error,
        }, res.ok);
      } else {
        console.warn("validate-inscription: no valid welcome recipient", { isMinor, memberId: newMemberId });
      }

      // ───── EMAIL 3 — Charte (if applicable) ─────
      if (welcomeEmail && chartesForTeam.length > 0) {
        const callerToken = authHeader;
        for (const doc of chartesForTeam) {
          let httpStatus = 0;
          let ok = false;
          let errText: string | null = null;
          try {
            const resp = await fetch(`${supabaseUrl}/functions/v1/send-charte`, {
              method: "POST",
              headers: {
                Authorization: callerToken,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                document_id: doc.id,
                recipients: [{ email: welcomeEmail, member_id: newMemberId }],
                is_test: false,
              }),
            });
            httpStatus = resp.status;
            if (resp.ok) {
              ok = true;
              emailsSummary.charte_count++;
            } else {
              errText = `send-charte ${resp.status}: ${await resp.text()}`;
              emailsFailed.push({ step: `charte:${doc.id}`, error: errText });
            }
          } catch (e) {
            errText = (e as Error).message;
            emailsFailed.push({ step: `charte:${doc.id}`, error: errText });
          }
          await logNotification("inscription_charte_dispatched", null, {
            inscription_request_id: requestId,
            member_id: newMemberId,
            document_id: doc.id,
            recipient_email: welcomeEmail,
            http_status: httpStatus,
            success: ok,
            error: errText,
          }, ok);
        }
      }
    } catch (emailErr) {
      console.error("validate-inscription: email cascade error", emailErr);
      emailsFailed.push({ step: "cascade", error: (emailErr as Error).message });
    }

    return json(200, {
      success: true,
      member_id: newMemberId,
      team_id: teamId,
      emails_sent: emailsSummary,
      emails_failed: emailsFailed,
    });
  } catch (err) {
    console.error("validate-inscription: unexpected error", err);
    return json(500, { error: "Erreur interne. Veuillez réessayer." });
  }
});
