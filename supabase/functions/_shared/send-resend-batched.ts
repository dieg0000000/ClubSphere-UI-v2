export interface ResendPayload {
  from: string;
  to: string[];
  subject: string;
  html: string;
  reply_to?: string;
}

export interface ResendSendResult {
  email: string;
  ok: boolean;
  error?: string;
}

const BATCH_SIZE = 4;
const BATCH_DELAY_MS = 1000;

export async function sendResendBatched(
  apiKey: string,
  payloads: ResendPayload[]
): Promise<ResendSendResult[]> {
  const results: ResendSendResult[] = [];
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const slice = payloads.slice(i, i + BATCH_SIZE);
    const batch = await Promise.all(slice.map(async (p): Promise<ResendSendResult> => {
      const email = p.to[0] ?? "";
      try {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(p),
        });
        if (!resp.ok) {
          const text = await resp.text();
          return { email, ok: false, error: text };
        }
        return { email, ok: true };
      } catch (err) {
        return { email, ok: false, error: (err as { message?: string }).message || String(err) };
      }
    }));
    results.push(...batch);
    if (i + BATCH_SIZE < payloads.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }
  return results;
}
