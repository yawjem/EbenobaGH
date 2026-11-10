// POST /functions/v1/checkout   (signed-in buyer)
// body: { address_id: uuid, method: 'shaq_express', speed: 'three_days', items: [{ variant_id: uuid, qty: number }] }
// -> { authorization_url, order_id, order_number, reference, total }
//
// 1. create_order() re-prices the cart from the database and builds order + packages atomically.
// 2. We ask Paystack for a hosted checkout link (MTN MoMo, Telecel Cash, AT Money, card).
// 3. The buyer pays; paystack-webhook confirms it and the order becomes "paid".
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, userFromRequest } from '../_shared/supabase.ts';
import { toPesewas } from '../_shared/paystack.ts';

const FRIENDLY: Record<string, [number, string]> = {
  empty_cart: [400, 'Your cart is empty.'],
  cart_too_large: [400, 'Too many different items in one order (max 50).'],
  address_not_found: [400, 'Please choose a delivery address.'],
  variant_not_found: [409, 'An item in your cart is no longer available. Please refresh your cart.'],
  no_delivery_rate: [422, 'Delivery is not available to that region yet.'],
  delivery_required: [400, 'Please choose a delivery method and delivery time.'],
  delivery_unavailable: [422, 'That delivery option is not available for this order. Please pick another one.'],
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const user = await userFromRequest(req);
  if (!user) return json({ error: 'Please sign in to check out.' }, 401);

  const body = await req.json().catch(() => null);
  const items = Array.isArray(body?.items)
    ? body.items.map((i: any) => ({ variant_id: String(i?.variant_id ?? ''), qty: Number(i?.qty) }))
    : [];
  if (!body?.address_id || !items.length || items.some((i: any) => !i.variant_id || !Number.isInteger(i.qty)))
    return json({ error: 'Invalid request.' }, 400);

  const admin = adminClient();
  const { data: order, error } = await admin.rpc('create_order', {
    p_buyer: user.id, p_address: body.address_id, p_items: items,
    p_method: typeof body.method === 'string' ? body.method : null,
    p_speed: typeof body.speed === 'string' ? body.speed : null,
  });
  if (error) {
    const code = String(error.message).split(':')[0].trim();
    if (FRIENDLY[code]) return json({ error: FRIENDLY[code][1], code }, FRIENDLY[code][0]);
    if (['out_of_stock', 'unavailable', 'bad_quantity'].includes(code)) {
      const detail = String(error.message).slice(code.length + 1).trim();
      const text = code === 'out_of_stock' ? `Not enough stock: ${detail}` : code === 'unavailable' ? `No longer available: ${detail}` : `Invalid quantity: ${detail}`;
      return json({ error: text, code }, 409);
    }
    console.error('create_order failed', error);
    return json({ error: 'Could not create your order. Please try again.' }, 500);
  }

  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) { console.error('PAYSTACK_SECRET_KEY is not set'); return json({ error: 'Payments are not configured.' }, 500); }

  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // Paystack requires an email; phone-only accounts get a placeholder.
      email: user.email ?? `${user.id}@users.ebenoba.app`,
      amount: toPesewas(order.total),
      currency: 'GHS',
      reference: order.reference,
      channels: ['mobile_money', 'card'],
      metadata: { order_id: order.order_id, order_number: order.order_number, buyer_id: user.id },
    }),
  });
  const out = await res.json().catch(() => ({}));

  if (!res.ok || !out?.status || !out?.data?.authorization_url) {
    console.error('paystack initialize failed', JSON.stringify(out).slice(0, 500));
    // Nothing was charged: close the order so it does not linger as "awaiting payment".
    await admin.from('orders').update({ status: 'cancelled' }).eq('id', order.order_id);
    await admin.from('packages').update({ status: 'cancelled' }).eq('order_id', order.order_id).eq('status', 'new');
    await admin.from('payments').update({ status: 'failed', failure_reason: 'initialize_failed' }).eq('reference', order.reference);
    return json({ error: 'The payment service is unavailable right now. Please try again in a minute.' }, 502);
  }

  return json({
    authorization_url: out.data.authorization_url,
    order_id: order.order_id, order_number: order.order_number, reference: order.reference, total: order.total,
  });
});
