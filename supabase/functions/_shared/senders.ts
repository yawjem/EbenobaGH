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

// mNotify quick SMS: POST https://api.mnotify.com/api/sms/quick?key=API_KEY
// body {recipient: [numbers], sender, message, is_schedule: false, schedule_date: ''}
// Sender ID: max 11 characters and must be registered/approved in your mNotify dashboard first.
// Numbers are sent as 233XXXXXXXXX (no "+").
export const sendSms = (to: string, message: string) =>
  safe(async () => {
    const key = Deno.env.get('MNOTIFY_API_KEY');
    if (!key) return { ok: false, detail: 'MNOTIFY_API_KEY not set' };
    const res = await fetch(`https://api.mnotify.com/api/sms/quick?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        recipient: [to.replace(/^\+/, '')], sender: Deno.env.get('SMS_SENDER_ID') ?? 'EbenobaGH',
        message, is_schedule: false, schedule_date: '',
      }),
    });
    const j = await res.json().catch(() => ({}));
    // Treat HTTP 2xx without an explicit error/failed status as sent (check one real SMS end to end).
    const ok = res.ok && !/error|fail/i.test(String(j?.status ?? ''));
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
