// Thin wrappers around the three delivery channels. Each returns { ok, detail } and never throws.
export type Result = { ok: boolean; detail?: string };

const safe = async (fn: () => Promise<Result>): Promise<Result> => {
  try { return await fn(); } catch (e) { return { ok: false, detail: String(e) }; }
};

// Expo push (works for the Expo push tokens the app saves in profiles.push_token)
export const sendPush = (token: string, title: string, body: string, data: Record<string, unknown> = {}) =>
  safe(async () => {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ to: token, title, body, sound: 'default', data }),
    });
    const j = await res.json().catch(() => ({}));
    const ok = res.ok && j?.data?.status === 'ok';
    return { ok, detail: ok ? undefined : JSON.stringify(j).slice(0, 300) };
  });

// Brevo transactional SMS: POST https://api.brevo.com/v3/transactionalSMS/send (same BREVO_API_KEY as email).
// Success is HTTP 201 with {messageId}. Sender: max 11 letters/numbers, and it must be registered for Ghana
// in Brevo (Settings > Campaigns > SMS Sender ID) before messages are delivered. Recipient = 233XXXXXXXXX (no "+").
export const sendSms = (to: string, message: string) =>
  safe(async () => {
    const key = Deno.env.get('BREVO_API_KEY');
    if (!key) return { ok: false, detail: 'BREVO_API_KEY not set' };
    const res = await fetch('https://api.brevo.com/v3/transactionalSMS/send', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: Deno.env.get('SMS_SENDER_ID') ?? 'EbenobaGH',
        recipient: to.replace(/^\+/, ''), content: message, type: 'transactional',
      }),
    });
    const j = await res.json().catch(() => ({}));
    const ok = res.ok && !!j?.messageId;
    return { ok, detail: ok ? undefined : JSON.stringify(j).slice(0, 300) };
  });

// Accepts "Ebenoba GH <orders@example.com>" or just "orders@example.com"
export const parseSender = (raw: string | undefined) => {
  const s = (raw ?? '').trim();
  const m = s.match(/^(.*?)\s*<([^<>]+)>$/);
  return m ? { name: m[1].replace(/^"|"$/g, '').trim() || 'Ebenoba GH', email: m[2].trim() } : { name: 'Ebenoba GH', email: s };
};

// Brevo transactional email: POST https://api.brevo.com/v3/smtp/email, header api-key.
// EMAIL_FROM must be a sender you verified in Brevo (Senders, Domains & Dedicated IPs).
export const sendEmail = (to: string, subject: string, html: string) =>
  safe(async () => {
    const key = Deno.env.get('BREVO_API_KEY');
    if (!key) return { ok: false, detail: 'BREVO_API_KEY not set' };
    const sender = parseSender(Deno.env.get('EMAIL_FROM'));
    if (!sender.email) return { ok: false, detail: 'EMAIL_FROM not set' };
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, detail: res.ok ? undefined : JSON.stringify(j).slice(0, 300) };
  });
