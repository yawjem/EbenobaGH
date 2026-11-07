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

// Arkesel v2 SMS: POST https://sms.arkesel.com/api/v2/sms/send, header api-key, {sender, message, recipients[]}
// Sender ID: max 11 characters and must be registered/approved with Arkesel before it shows on handsets.
export const sendSms = (to: string, message: string) =>
  safe(async () => {
    const key = Deno.env.get('ARKESEL_API_KEY');
    if (!key) return { ok: false, detail: 'ARKESEL_API_KEY not set' };
    const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: Deno.env.get('SMS_SENDER_ID') ?? 'EbenobaGH', message, recipients: [to] }),
    });
    const j = await res.json().catch(() => ({}));
    // The docs page does not show the success body; treat HTTP 2xx without an explicit error status as sent.
    const ok = res.ok && !/error|fail/i.test(String(j?.status ?? ''));
    return { ok, detail: ok ? undefined : JSON.stringify(j).slice(0, 300) };
  });

// Resend: POST https://api.resend.com/emails. EMAIL_FROM must use a domain verified in Resend
// (for quick tests only: "Ebenoba GH <onboarding@resend.dev>").
export const sendEmail = (to: string, subject: string, html: string) =>
  safe(async () => {
    const key = Deno.env.get('RESEND_API_KEY');
    if (!key) return { ok: false, detail: 'RESEND_API_KEY not set' };
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: Deno.env.get('EMAIL_FROM') ?? 'Ebenoba GH <onboarding@resend.dev>', to: [to], subject, html }),
    });
    const j = await res.json().catch(() => ({}));
    return { ok: res.ok, detail: res.ok ? undefined : JSON.stringify(j).slice(0, 300) };
  });
