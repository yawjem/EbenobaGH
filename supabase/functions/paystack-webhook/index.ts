// Paystack -> POST /functions/v1/paystack-webhook
// Deploy with:  supabase functions deploy paystack-webhook --no-verify-jwt
// (Paystack cannot send a Supabase JWT; we authenticate the call by its HMAC signature instead.)
//
// Safety: (1) signature check on the raw body, (2) we re-verify the transaction with Paystack and use
// THEIR amount, never the webhook body, (3) idempotent: repeats do nothing, (4) mark_order_paid refuses
// underpayments and flags the order for review.
import { adminClient } from '../_shared/supabase.ts';
import { fromPesewas, verifySignature } from '../_shared/paystack.ts';

const ok = (msg = 'ok') => new Response(msg, { status: 200 });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok();

  const secret = Deno.env.get('PAYSTACK_SECRET_KEY') ?? '';
  const raw = await req.text();
  if (!(await verifySignature(raw, req.headers.get('x-paystack-signature') ?? '', secret)))
    return new Response('invalid signature', { status: 401 });

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  if (evt.event !== 'charge.success') return ok('ignored');

  const reference: string | undefined = evt.data?.reference;
  if (!reference) return ok('no reference');
  const eventId = `charge.success:${evt.data?.id ?? reference}`;

  const admin = adminClient();
  const ins = await admin.from('webhook_events').insert({ id: eventId, payload: evt });
  if (ins.error) {
    const { data: seen } = await admin.from('webhook_events').select('processed_at').eq('id', eventId).maybeSingle();
    if (seen?.processed_at) return ok('duplicate');
    // seen but never finished (an earlier attempt failed): process it again
  }

  const vr = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!vr.ok) { console.error('verify failed', vr.status); return new Response('verify failed', { status: 500 }); } // Paystack will retry
  const v = (await vr.json())?.data;
  if (v?.status !== 'success' || v?.currency !== 'GHS') {
    await admin.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', eventId);
    return ok('not a successful GHS payment');
  }

  const { error } = await admin.rpc('mark_order_paid', {
    p_reference: reference, p_amount: fromPesewas(v.amount), p_channel: v.channel ?? null, p_raw: v,
  });
  if (error) {
    if (String(error.message).includes('Unknown payment reference')) {
      // Not one of ours (another integration on the same Paystack account). Do not make Paystack retry forever.
      await admin.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', eventId);
      return ok('unknown reference');
    }
    console.error('mark_order_paid failed', error);
    return new Response('processing error', { status: 500 });
  }

  await admin.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('id', eventId);
  return ok();
});
