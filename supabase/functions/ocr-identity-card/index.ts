import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const BUCKET = "inscription-id-cards";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-5-20250929";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeCompare(s: string | null | undefined): string {
  if (!s) return "";
  return stripDiacritics(s).toLowerCase().trim().replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= a.length; i++) m[i] = [i];
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[a.length][b.length];
}

function similarEnough(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizeCompare(a);
  const nb = normalizeCompare(b);
  if (!na || !nb) return true;
  if (na === nb) return true;
  return levenshtein(na, nb) <= 2;
}

function toTitleCase(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  return trimmed
    .toLowerCase()
    .split(/(\s|-|')/)
    .map(tok => (tok.length > 0 && /[a-zà-ÿ]/i.test(tok[0]) ? tok[0].toUpperCase() + tok.slice(1) : tok))
    .join("");
}

function bytesToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function guessMediaType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function parseJsonLoose(text: string): Record<string, unknown> | null {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) s = s.slice(start, end + 1);
  try { return JSON.parse(s) as Record<string, unknown>; } catch { return null; }
}

type ClaudeCallResult = {
  status: number;
  parsed: Record<string, unknown> | null;
  rawText: string | null;
};

async function callClaude(apiKey: string, base64: string, mediaType: string, system: string, userPrompt: string, imageLabel: string): Promise<ClaudeCallResult> {
  const resp = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0,
      system,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: userPrompt },
        ],
      }],
    }),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    console.error(`[ocr-identity-card] Claude ${imageLabel} ERROR:`, errText.slice(0, 500));
    return { status: resp.status, parsed: null, rawText: errText.slice(0, 500) };
  }
  const j = await resp.json() as { content?: Array<{ type: string; text?: string }> };
  const textBlock = j.content?.find(c => c.type === "text");
  const rawText = textBlock?.text ?? null;
  const parsed = rawText ? parseJsonLoose(rawText) : null;
  return { status: resp.status, parsed, rawText };
}

async function downloadBase64(supabase: ReturnType<typeof createClient>, path: string): Promise<{ b64: string; media: string } | null> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) {
    console.error("download error", path, error);
    return null;
  }
  const buf = await data.arrayBuffer();
  return { b64: bytesToBase64(buf), media: guessMediaType(path) };
}

const SYSTEM_PROMPT = "You are an OCR extraction assistant. Return strictly valid JSON, no commentary.";

const PROMPT_CI_FRONT = `Extract the following fields from this Swiss identity card (carte d'identité). Return ONLY valid JSON (no markdown, no explanation), with these keys:
- first_name (string): given names
- last_name (string): family name
- birth_date (string, ISO format YYYY-MM-DD)
- gender (string, either 'M' or 'F')
- nationality (string, country NAME in French, NOT adjective. Examples: 'Suisse' (not 'Helvétique'), 'Espagne' (not 'Espagnole'), 'Italie' (not 'Italienne'), 'France' (not 'Française'), 'Allemagne' (not 'Allemande'), 'Portugal' (not 'Portugaise'), etc. Always use the country name in French as it would appear on a map.
- place_of_origin (string): the lieu d'origine (CH) or place of birth (other countries). For Swiss cards this is the Heimatort; for other cards, the place of birth visible on the front.

If a field cannot be reliably extracted, return null for that field. Use the MRZ at the bottom for cross-validation if visible.

Return ONLY the JSON object, nothing else.`;

const PROMPT_CI_BACK = `Extract parent information from the back of this identity card, if present. Some cards (Spanish DNI, for example) list parents under 'Hijo/a de' or similar. Return ONLY valid JSON with these keys:
- father_first_name (string or null)
- father_last_name (string or null)
- mother_first_name (string or null)
- mother_last_name (string or null)

If the card doesn't list parents, return all four as null.
Return ONLY the JSON object, nothing else.`;

const PROMPT_PERMIT_FRONT = `Extract the following fields from this Swiss residence permit (Ausländerausweis / permis de séjour B, C, F, G, L, etc.). Return ONLY valid JSON (no markdown, no explanation), with these keys:
- first_name (string): given names
- last_name (string): family name
- birth_date (string, ISO format YYYY-MM-DD)
- gender (string, either 'M' or 'F')
- nationality (string, country NAME in French. Examples: 'Italie', 'Portugal', 'Espagne', 'France', 'Allemagne', 'Kosovo', 'Turquie', etc. Always use the country name, NOT an adjective.)
- place_of_origin (string or null): place of birth if visible on the permit

If a field cannot be reliably extracted, return null for that field. Use the MRZ at the bottom for cross-validation if visible.

Return ONLY the JSON object, nothing else.`;

const PROMPT_PERMIT_BACK = `Extract any additional information from the back of this Swiss residence permit. Return ONLY valid JSON with these keys:
- father_first_name (string or null)
- father_last_name (string or null)
- mother_first_name (string or null)
- mother_last_name (string or null)

If the permit back doesn't list parent information, return all as null.
Return ONLY the JSON object, nothing else.`;

const PROMPT_PASSPORT = `Extract the following fields from this passport identity page. Use the MRZ (machine readable zone - the lines of characters at the bottom) to cross-validate extracted data. Return ONLY valid JSON (no markdown, no explanation), with these keys:
- first_name (string): given names
- last_name (string): family name
- birth_date (string, ISO format YYYY-MM-DD)
- gender (string, either 'M' or 'F')
- nationality (string, country NAME in French. Examples: 'France', 'Suisse', 'Espagne', 'Italie', 'Portugal', 'Allemagne', 'Turquie', etc. Always the country name, NOT an adjective.)
- place_of_origin (string or null): place of birth if visible

If a field cannot be reliably extracted, return null for that field. The MRZ is the most reliable source for name, birth_date, gender, and nationality.

Return ONLY the JSON object, nothing else.`;

const PROMPT_HEALTH = `Extract the following fields from this Swiss health insurance card. Return ONLY valid JSON with these keys:
- avs_number (string): the AHV/AVS number, format 756.XXXX.XXXX.XX (13 digits with dots)
- last_name (string)
- first_name (string)
- birth_date (string, ISO format YYYY-MM-DD)

If a field cannot be reliably extracted, return null. The AVS number is the most important — it's typically labeled 'N° AVS', 'AHV-Nr.', 'AVS', '756.', or similar.

Return ONLY the JSON object, nothing else.`;

function normalizeGender(g: unknown): string | null {
  if (!g || typeof g !== "string") return null;
  const u = g.trim().toUpperCase();
  if (u === "M" || u === "F") return u;
  if (u.startsWith("MASC") || u === "MALE") return "M";
  if (u.startsWith("FEM") || u === "FEMALE") return "F";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return json(500, { success: false, error: "ANTHROPIC_API_KEY non configuré", extracted: {}, warnings: [] });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const slug = typeof body.slug === "string" ? body.slug : "";
    const docType = typeof body.document_type === "string" ? body.document_type : "ci";
    const frontPath = typeof body.id_card_front_path === "string" ? body.id_card_front_path : "";
    const backPath = typeof body.id_card_back_path === "string" ? body.id_card_back_path : "";
    const healthPath = typeof body.health_insurance_card_path === "string" ? body.health_insurance_card_path : "";

    if (!["ci", "permit", "passport"].includes(docType)) {
      return json(400, { success: false, error: "document_type invalide", extracted: {}, warnings: [] });
    }

    if (!slug || !frontPath || !healthPath) {
      return json(400, { success: false, error: "Paramètres manquants (slug, recto, assurance)", extracted: {}, warnings: [] });
    }

    if ((docType === "ci" || docType === "permit") && !backPath) {
      return json(400, { success: false, error: "Verso requis pour ce type de document", extracted: {}, warnings: [] });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: club } = await supabaseAdmin
      .from("club_settings")
      .select("id")
      .eq("inscription_slug", slug)
      .maybeSingle();
    if (!club) {
      return json(404, { success: false, error: "Slug invalide", extracted: {}, warnings: [] });
    }

    // Download images
    const front = await downloadBase64(supabaseAdmin, frontPath);
    const health = await downloadBase64(supabaseAdmin, healthPath);

    if (!front || !health) {
      return json(200, { success: false, error: "Échec téléchargement images", extracted: {}, warnings: [] });
    }

    let back: { b64: string; media: string } | null = null;
    if (docType !== "passport" && backPath) {
      back = await downloadBase64(supabaseAdmin, backPath);
      if (!back) {
        return json(200, { success: false, error: "Échec téléchargement verso", extracted: {}, warnings: [] });
      }
    }

    // Call Claude based on document type
    let frontRes: ClaudeCallResult;
    let backRes: ClaudeCallResult | null = null;
    let healthRes: ClaudeCallResult;

    const safeCall = (p: Promise<ClaudeCallResult>, label: string) =>
      p.catch((e) => {
        console.error(`[ocr] ${label} threw:`, e);
        return { status: 0, parsed: null, rawText: null } as ClaudeCallResult;
      });

    if (docType === "ci") {
      [frontRes, backRes, healthRes] = await Promise.all([
        safeCall(callClaude(apiKey, front.b64, front.media, SYSTEM_PROMPT, PROMPT_CI_FRONT, "ci-front"), "ci-front"),
        safeCall(callClaude(apiKey, back!.b64, back!.media, SYSTEM_PROMPT, PROMPT_CI_BACK, "ci-back"), "ci-back"),
        safeCall(callClaude(apiKey, health.b64, health.media, SYSTEM_PROMPT, PROMPT_HEALTH, "health"), "health"),
      ]);
    } else if (docType === "permit") {
      [frontRes, backRes, healthRes] = await Promise.all([
        safeCall(callClaude(apiKey, front.b64, front.media, SYSTEM_PROMPT, PROMPT_PERMIT_FRONT, "permit-front"), "permit-front"),
        safeCall(callClaude(apiKey, back!.b64, back!.media, SYSTEM_PROMPT, PROMPT_PERMIT_BACK, "permit-back"), "permit-back"),
        safeCall(callClaude(apiKey, health.b64, health.media, SYSTEM_PROMPT, PROMPT_HEALTH, "health"), "health"),
      ]);
    } else {
      // passport — no back image needed
      [frontRes, healthRes] = await Promise.all([
        safeCall(callClaude(apiKey, front.b64, front.media, SYSTEM_PROMPT, PROMPT_PASSPORT, "passport"), "passport"),
        safeCall(callClaude(apiKey, health.b64, health.media, SYSTEM_PROMPT, PROMPT_HEALTH, "health"), "health"),
      ]);
    }

    const rawFront = frontRes.parsed;
    const rawBack = backRes?.parsed ?? null;
    const rawHealth = healthRes.parsed;

    // Extract identity fields from front document (same field names for all types)
    const docFirstName = (rawFront?.first_name as string | null) ?? null;
    const docLastName = (rawFront?.last_name as string | null) ?? null;
    const docBirthDate = (rawFront?.birth_date as string | null) ?? null;
    const docGender = normalizeGender(rawFront?.gender);
    const docNationality = (rawFront?.nationality as string | null) ?? null;
    const docPlaceOfOrigin = (rawFront?.place_of_origin as string | null) ?? null;

    // Extract parent info from back (CI and permit — passport has no back)
    const parentFatherFirst = (rawBack?.father_first_name as string | null) ?? null;
    const parentFatherLast = (rawBack?.father_last_name as string | null) ?? null;
    const parentMotherFirst = (rawBack?.mother_first_name as string | null) ?? null;
    const parentMotherLast = (rawBack?.mother_last_name as string | null) ?? null;

    // Health card extraction
    const healthFirstName = (rawHealth?.first_name as string | null) ?? null;
    const healthLastName = (rawHealth?.last_name as string | null) ?? null;
    const healthBirthDate = (rawHealth?.birth_date as string | null) ?? null;
    let avsNumber = (rawHealth?.avs_number as string | null) ?? null;

    // Cross-validation warnings
    const warnings: string[] = [];

    if (docLastName && healthLastName && !similarEnough(docLastName, healthLastName)) {
      warnings.push(`Le nom sur la carte d'assurance maladie ('${healthLastName}') diffère du document ('${docLastName}').`);
    }
    if (docFirstName && healthFirstName && !similarEnough(docFirstName, healthFirstName)) {
      warnings.push(`Le prénom sur la carte d'assurance maladie ('${healthFirstName}') diffère du document ('${docFirstName}').`);
    }
    if (docBirthDate && healthBirthDate && docBirthDate !== healthBirthDate) {
      warnings.push(`La date de naissance sur la carte d'assurance maladie (${healthBirthDate}) diffère du document (${docBirthDate}).`);
    }

    // Validate AVS format
    if (avsNumber) {
      const cleaned = avsNumber.replace(/\s/g, "");
      if (/^756\.\d{4}\.\d{4}\.\d{2}$/.test(cleaned)) {
        avsNumber = cleaned;
      } else {
        avsNumber = null;
        warnings.push("Le numéro AVS extrait n'est pas au format attendu et a été ignoré.");
      }
    }

    const extracted = {
      first_name: toTitleCase(docFirstName),
      last_name: toTitleCase(docLastName),
      birth_date: docBirthDate,
      gender: docGender,
      nationality: docNationality,
      place_of_origin: docPlaceOfOrigin,
      legal_rep1_firstname: toTitleCase(parentFatherFirst),
      legal_rep1_lastname: toTitleCase(parentFatherLast),
      legal_rep2_firstname: toTitleCase(parentMotherFirst),
      legal_rep2_lastname: toTitleCase(parentMotherLast),
      avs_number: avsNumber,
    };

    return json(200, {
      success: true,
      extracted,
      warnings,
    });
  } catch (e) {
    console.error("ocr-identity-card error:", e);
    return json(200, { success: false, error: "Erreur interne", extracted: {}, warnings: [] });
  }
});
