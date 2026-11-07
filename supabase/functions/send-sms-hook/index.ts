// Supabase Auth "Send SMS" hook -> POST /functions/v1/send-sms-hook
// Supabase makes the login code and calls this function to deliver it; we send it with Arkesel.
// Deploy with:  supabase functions deploy send-sms-hook --no-verify-jwt
// Then: Dashboard -> Authentication -> Hooks -> Send SMS -> HTTPS -> this function's URL -> Generate secret,
// and save the secret:  supabase secrets set SEND_SMS_HOOK_SECRET="v1,whsec_..."
// Never logs the code. Only Ghana numbers are accepted.
import { verifyStandardWebhook } from '../_shared/webhook.ts';
import { normalizeGhPhone } from '../_shared/phone.ts';
import { sendSms } from '../_shared/senders.ts';
import { otpMessage } from '../_shared/templates.ts';

// Supabase shows error.message to the person logging in, so keep these friendly and free of internals.
const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { http_code: status, message } }), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return fail(405, 'method not allowed');
  const raw = await req.text();
  const secret = Deno.env.get('SEND_SMS_HOOK_SECRET') ?? '';
  if (!secret) return fail(500, 'SMS login is not configured yet.');
  if (!(await verifyStandardWebhook(secret, raw, req.headers))) return fail(401, 'invalid signature');

  let p: any;
  try { p = JSON.parse(raw); } catch { return fail(400, 'bad json'); }
  const phone = normalizeGhPhone(p?.user?.phone);
  const otp = String(p?.sms?.otp ?? '');
  if (!phone) return fail(400, 'Please use a Ghana mobile number.');
  if (!/^\d{4,10}$/.test(otp)) return fail(400, 'bad request');

  const r = await sendSms(phone, otpMessage(otp));
  if (!r.ok) { console.error('login sms failed', r.detail); return fail(502, 'We could not send the code. Please try again.'); }
  return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
