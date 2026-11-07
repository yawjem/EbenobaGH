// Offline tests for the Edge Functions. Run with:  bun test supabase/functions/_tests
// Deno, Supabase and every external API are faked, so no network or keys are needed.
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { createHmac } from 'node:crypto';

// ---------- fakes ----------
const state: any = { calls: [], rpc: {}, results: {}, user: { id: 'u1', email: 'ama@x.com' } };
const reset = () => { state.calls = []; state.rpc = {}; state.results = {}; state.user = { id: 'u1', email: 'ama@x.com' }; state.fetches = []; state.fetchMap = {}; };

function chain(table: string, op: string) {
  const key = `${table}:${op}`;
  const p: any = new Proxy(function () {}, {
    get: (_t, prop) => (prop === 'then' ? (res: any) => res(state.results[key] ?? { data: null, error: null }) : () => p),
    apply: () => p,
  });
  return p;
}
const fakeClient = {
  from: (table: string) => new Proxy({}, { get: (_t, op: string) => (...args: any[]) => { state.calls.push({ table, op, args }); return chain(table, op); } }),
  rpc: (name: string, args: any) => { state.calls.push({ rpc: name, args }); return Promise.resolve(state.rpc[name] ?? { data: null, error: null }); },
  auth: { getUser: async () => ({ data: { user: state.user }, error: state.user ? null : { message: 'no' } }) },
};
mock.module('npm:@supabase/supabase-js@2', () => ({ createClient: () => fakeClient }));

const env: Record<string, string> = {
  SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'a', SUPABASE_SERVICE_ROLE_KEY: 's',
  PAYSTACK_SECRET_KEY: 'sk_test_secret', CRON_SECRET: 'cron-secret-123', ARKESEL_API_KEY: 'ak', RESEND_API_KEY: 'rk',
  SEND_SMS_HOOK_SECRET: 'v1,whsec_' + Buffer.from('hook-secret-bytes-0123456789abcdef').toString('base64'),
};
let lastHandler: any;
(globalThis as any).Deno = { serve: (h: any) => { lastHandler = h; }, env: { get: (k: string) => env[k] } };

(globalThis as any).fetch = async (url: string, init: any) => {
  state.fetches.push({ url, init, body: init?.body ? JSON.parse(init.body) : null });
  const hit = Object.entries(state.fetchMap).find(([k]) => url.includes(k));
  const r: any = hit ? hit[1] : { status: 200, body: {} };
  return new Response(JSON.stringify(r.body), { status: r.status });
};

const load = async (path: string) => { await import(path + '?t=' + Math.random()); return lastHandler as (r: Request) => Promise<Response>; };
const sign = (body: string) => createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(body).digest('hex');

beforeEach(reset);

// ---------- pure helpers ----------
describe('helpers', () => {
  test('signature verification matches Paystack HMAC-SHA512', async () => {
    const { verifySignature } = await import('../_shared/paystack.ts');
    const body = '{"event":"charge.success"}';
    expect(await verifySignature(body, sign(body), env.PAYSTACK_SECRET_KEY)).toBe(true);
    expect(await verifySignature(body + ' ', sign(body), env.PAYSTACK_SECRET_KEY)).toBe(false);
    expect(await verifySignature(body, '', env.PAYSTACK_SECRET_KEY)).toBe(false);
    expect(await verifySignature(body, sign(body), 'wrong')).toBe(false);
  });
  test('pesewas conversion has no float drift', async () => {
    const { toPesewas, fromPesewas } = await import('../_shared/paystack.ts');
    expect(toPesewas(1840)).toBe(184000);
    expect(toPesewas(1299.1)).toBe(129910);
    expect(toPesewas(0.29)).toBe(29);
    expect(fromPesewas(184000)).toBe(1840);
  });
  test('Ghana phone numbers', async () => {
    const { normalizeGhPhone: n } = await import('../_shared/phone.ts');
    expect(n('024 412 3456')).toBe('+233244123456');
    expect(n('0244123456')).toBe('+233244123456');
    expect(n('+233244123456')).toBe('+233244123456');
    expect(n('233 24 412 3456')).toBe('+233244123456');
    expect(n('244123456')).toBe('+233244123456');
    expect(n('12345')).toBeNull(); expect(n('0144123456')).toBeNull(); expect(n(null)).toBeNull();
  });
  test('seller messages never use SMS and read well', async () => {
    const { messageFor } = await import('../_shared/templates.ts');
    const n = messageFor('seller_new_order', { order_number: 'EB-1' })!;
    expect(n.channels).toEqual(['push']);
    expect(n.body).toContain('EB-1');
    expect(messageFor('seller_approved', { shop_name: 'Kofi Hub' })!.body).toContain('Kofi Hub');
    const r = messageFor('seller_rejected', { shop_name: 'Kofi Hub', reason: 'Add an address' })!;
    expect(r.body).toContain('Reason: Add an address');
    expect(r.channels).not.toContain('sms');
    expect(messageFor('seller_rejected', { shop_name: 'Kofi Hub' })!.body).not.toContain('Reason');
  });

  test('delivery code is in the on-its-way message only when present', async () => {
    const { messageFor } = await import('../_shared/templates.ts');
    expect(messageFor('package_in_transit', { order_number: 'EB-1', pin: '4821' })!.body).toContain('delivery code is 4821');
    expect(messageFor('package_in_transit', { order_number: 'EB-1', pin: '4821' })!.body).toContain('only when you have your items');
    expect(messageFor('package_in_transit', { order_number: 'EB-1' })!.body).not.toContain('code');
    expect(messageFor('package_delivered', { order_number: 'EB-1', pin: '4821' })!.body).not.toContain('4821');
  });

  test('message templates', async () => {
    const { messageFor, emailHtml } = await import('../_shared/templates.ts');
    const p = { order_number: 'EB-261104-10001', shop_name: 'Kumasi Gadgets', courier_name: 'Shaq Express', tracking_number: 'SQ123' };
    expect(messageFor('package_dispatched', p)!.body).toContain('shipped');
    expect(messageFor('package_dispatched', p)!.body).toContain('Shaq Express, tracking no. SQ123');
    expect(messageFor('package_in_transit', p)!.body).toContain('on its way');
    expect(messageFor('package_awaiting_pickup', p)!.body).toContain('waiting to be picked up');
    expect(messageFor('package_ready', p)!.body).toContain('waiting to be shipped');
    expect(messageFor('package_paid', p)!.channels).toEqual(['push', 'email']); // no SMS cost for "paid"
    expect(messageFor('nope', p)).toBeNull();
    expect(emailHtml('<b>Ama</b> Mensah', messageFor('package_delivered', p)!)).not.toContain('<b>Ama</b>'); // escaped
  });
});

// ---------- paystack-webhook ----------
describe('paystack-webhook', () => {
  const evt = (extra: any = {}) => JSON.stringify({ event: 'charge.success', data: { id: 99, reference: 'ebn_abc', ...extra } });
  const post = (h: any, body: string, sig = sign(body)) => h(new Request('http://x', { method: 'POST', body, headers: { 'x-paystack-signature': sig } }));
  const verifyOk = { status: 200, body: { data: { status: 'success', currency: 'GHS', amount: 184000, channel: 'mobile_money' } } };

  test('rejects a bad signature without touching the database', async () => {
    const h = await load('../paystack-webhook/index.ts');
    const res = await post(h, evt(), 'deadbeef');
    expect(res.status).toBe(401); expect(state.calls.length).toBe(0);
  });
  test('ignores other event types', async () => {
    const h = await load('../paystack-webhook/index.ts');
    const b = JSON.stringify({ event: 'transfer.success', data: {} });
    expect((await post(h, b)).status).toBe(200); expect(state.calls.length).toBe(0);
  });
  test('success: uses the VERIFIED amount in cedis and marks the order paid', async () => {
    const h = await load('../paystack-webhook/index.ts');
    state.fetchMap = { '/transaction/verify/ebn_abc': verifyOk };
    const res = await post(h, evt({ amount: 1 /* webhook body amount must be ignored */ }));
    expect(res.status).toBe(200);
    const rpc = state.calls.find((c: any) => c.rpc === 'mark_order_paid');
    expect(rpc.args).toMatchObject({ p_reference: 'ebn_abc', p_amount: 1840, p_channel: 'mobile_money' });
    expect(state.calls.some((c: any) => c.table === 'webhook_events' && c.op === 'update')).toBe(true); // marked processed
  });
  test('a repeat delivery of a processed event does nothing', async () => {
    const h = await load('../paystack-webhook/index.ts');
    state.results['webhook_events:insert'] = { error: { message: 'duplicate key' } };
    state.results['webhook_events:select'] = { data: { processed_at: '2026-11-05T00:00:00Z' } };
    const res = await post(h, evt());
    expect(res.status).toBe(200); expect(state.calls.some((c: any) => c.rpc)).toBe(false);
  });
  test('Paystack says the transaction was not successful: no payment recorded', async () => {
    const h = await load('../paystack-webhook/index.ts');
    state.fetchMap = { '/transaction/verify/': { status: 200, body: { data: { status: 'failed', currency: 'GHS', amount: 184000 } } } };
    expect((await post(h, evt())).status).toBe(200);
    expect(state.calls.some((c: any) => c.rpc)).toBe(false);
  });
  test('verify API outage -> 500 so Paystack retries', async () => {
    const h = await load('../paystack-webhook/index.ts');
    state.fetchMap = { '/transaction/verify/': { status: 503, body: {} } };
    expect((await post(h, evt())).status).toBe(500);
  });
  test('database error -> 500 (retry); unknown reference -> 200 (stop retrying)', async () => {
    const h = await load('../paystack-webhook/index.ts');
    state.fetchMap = { '/transaction/verify/': verifyOk };
    state.rpc.mark_order_paid = { error: { message: 'connection lost' } };
    expect((await post(h, evt())).status).toBe(500);
    state.rpc.mark_order_paid = { error: { message: 'Unknown payment reference ebn_abc' } };
    expect((await post(h, evt())).status).toBe(200);
  });
});

// ---------- checkout ----------
describe('checkout', () => {
  const call = (h: any, body: any, auth = 'Bearer jwt') => h(new Request('http://x', { method: 'POST', body: JSON.stringify(body), headers: { Authorization: auth } }));
  const cart = { address_id: 'addr1', items: [{ variant_id: 'v1', qty: 2 }] };
  const order = { order_id: 'o1', order_number: 'EB-261104-10001', total: 1840, reference: 'ebn_ref1' };

  test('anonymous callers are refused', async () => {
    const h = await load('../checkout/index.ts'); state.user = null;
    expect((await call(h, cart)).status).toBe(401);
  });
  test('malformed carts are refused before any database work', async () => {
    const h = await load('../checkout/index.ts');
    expect((await call(h, { address_id: 'a', items: [{ variant_id: 'v', qty: 1.5 }] })).status).toBe(400);
    expect((await call(h, { items: [] })).status).toBe(400);
    expect(state.calls.some((c: any) => c.rpc)).toBe(false);
  });
  test('happy path: charges the server total in pesewas, MoMo + card, returns the pay link', async () => {
    const h = await load('../checkout/index.ts');
    state.rpc.create_order = { data: order, error: null };
    state.fetchMap = { '/transaction/initialize': { status: 200, body: { status: true, data: { authorization_url: 'https://checkout.paystack.com/abc' } } } };
    const res = await call(h, { ...cart, price: 1, total: 1 /* client prices must be ignored */ });
    const j = await res.json();
    expect(res.status).toBe(200); expect(j.authorization_url).toBe('https://checkout.paystack.com/abc'); expect(j.order_number).toBe(order.order_number);
    const init = state.fetches.find((f: any) => f.url.includes('/transaction/initialize'));
    expect(init.body).toMatchObject({ amount: 184000, currency: 'GHS', reference: 'ebn_ref1', channels: ['mobile_money', 'card'], email: 'ama@x.com' });
    expect(init.init.headers.Authorization).toBe('Bearer sk_test_secret');
    expect(state.calls.find((c: any) => c.rpc === 'create_order').args).toMatchObject({ p_buyer: 'u1', p_address: 'addr1' });
  });
  test('stock problem comes back as a readable 409', async () => {
    const h = await load('../checkout/index.ts');
    state.rpc.create_order = { data: null, error: { message: 'out_of_stock: Blender (only 1 left)' } };
    const res = await call(h, cart);
    expect(res.status).toBe(409); expect((await res.json()).error).toContain('Not enough stock: Blender (only 1 left)');
  });
  test('Paystack down: the unpaid order is cancelled and the buyer gets a 502', async () => {
    const h = await load('../checkout/index.ts');
    state.rpc.create_order = { data: order, error: null };
    state.fetchMap = { '/transaction/initialize': { status: 500, body: { status: false } } };
    const res = await call(h, cart);
    expect(res.status).toBe(502);
    expect(state.calls.some((c: any) => c.table === 'orders' && c.op === 'update')).toBe(true);
    expect(state.calls.some((c: any) => c.table === 'payments' && c.op === 'update')).toBe(true);
  });
  test('phone-only accounts get a placeholder email for Paystack', async () => {
    const h = await load('../checkout/index.ts'); state.user = { id: 'u9', email: null };
    state.rpc.create_order = { data: order, error: null };
    state.fetchMap = { '/transaction/initialize': { status: 200, body: { status: true, data: { authorization_url: 'u' } } } };
    await call(h, cart);
    expect(state.fetches.find((f: any) => f.url.includes('initialize')).body.email).toBe('u9@users.ebenoba.app');
  });
});

// ---------- send-notifications ----------
describe('send-notifications', () => {
  const run = (h: any, secret = env.CRON_SECRET) => h(new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': secret } }));
  const job = (id: number, kind: string, extra: any = {}) => ({ id, user_id: 'u1', kind, attempts: 0, channels: ['push', 'sms', 'email'],
    payload: { order_id: 'o1', order_number: 'EB-261104-10001', shop_name: 'Kumasi Gadgets', ...extra } });
  const profile = { full_name: 'Ama Mensah', email: 'ama@x.com', phone: '0244123456', push_token: 'ExponentPushToken[abc]' };

  test('only the cron secret may call it', async () => {
    const h = await load('../send-notifications/index.ts');
    expect((await run(h, 'nope')).status).toBe(403); expect((await run(h, '')).status).toBe(403);
  });
  test('"shipped" goes out by push, SMS and email', async () => {
    const h = await load('../send-notifications/index.ts');
    state.results['notification_outbox:select'] = { data: [job(1, 'package_dispatched', { courier_name: 'Shaq Express', tracking_number: 'SQ1' })], error: null };
    state.results['notification_outbox:update'] = { data: [{ id: 1 }], error: null };
    state.results['profiles:select'] = { data: profile };
    state.fetchMap = { 'exp.host': { status: 200, body: { data: { status: 'ok' } } }, 'arkesel': { status: 200, body: { status: 'success' } }, 'resend': { status: 200, body: { id: 'e1' } } };
    const j = await (await run(h)).json();
    expect(j.sent).toBe(1);
    const sms = state.fetches.find((f: any) => f.url.includes('arkesel'));
    expect(sms.body.recipients).toEqual(['+233244123456']); expect(sms.body.message).toContain('Shaq Express');
    expect(sms.init.headers['api-key']).toBe('ak');
    expect(state.fetches.some((f: any) => f.url.includes('exp.host'))).toBe(true);
    expect(state.fetches.find((f: any) => f.url.includes('resend')).body.to).toEqual(['ama@x.com']);
  });
  test('"payment received" never costs an SMS, and two packages of one order send it once', async () => {
    const h = await load('../send-notifications/index.ts');
    state.results['notification_outbox:select'] = { data: [job(1, 'package_paid'), job(2, 'package_paid')], error: null };
    state.results['notification_outbox:update'] = { data: [{ id: 1 }], error: null };
    state.results['profiles:select'] = { data: profile };
    state.fetchMap = { 'exp.host': { status: 200, body: { data: { status: 'ok' } } }, 'resend': { status: 200, body: {} } };
    await run(h);
    expect(state.fetches.filter((f: any) => f.url.includes('arkesel')).length).toBe(0);
    expect(state.fetches.filter((f: any) => f.url.includes('resend')).length).toBe(1);
  });
  test('one channel failing does not cause a duplicate re-send', async () => {
    const h = await load('../send-notifications/index.ts');
    state.results['notification_outbox:select'] = { data: [job(1, 'package_delivered')], error: null };
    state.results['notification_outbox:update'] = { data: [{ id: 1 }], error: null };
    state.results['profiles:select'] = { data: profile };
    state.fetchMap = { 'exp.host': { status: 200, body: { data: { status: 'ok' } } }, 'arkesel': { status: 500, body: { status: 'error' } }, 'resend': { status: 200, body: {} } };
    const j = await (await run(h)).json();
    expect(j.sent).toBe(1); expect(j.retry).toBe(0);
  });
  test('every channel failing retries, then gives up after 5 attempts', async () => {
    const h = await load('../send-notifications/index.ts');
    state.results['notification_outbox:update'] = { data: [{ id: 1 }], error: null };
    state.results['profiles:select'] = { data: profile };
    state.fetchMap = { 'exp.host': { status: 500, body: {} }, 'arkesel': { status: 500, body: {} }, 'resend': { status: 500, body: {} } };
    state.results['notification_outbox:select'] = { data: [job(1, 'package_delivered')], error: null };
    expect((await (await run(h)).json()).retry).toBe(1);
    state.results['notification_outbox:select'] = { data: [{ ...job(1, 'package_delivered'), attempts: 4 }], error: null };
    expect((await (await run(h)).json()).failed).toBe(1);
  });
  test('a job another worker already claimed is skipped', async () => {
    const h = await load('../send-notifications/index.ts');
    state.results['notification_outbox:select'] = { data: [job(1, 'package_delivered')], error: null };
    state.results['notification_outbox:update'] = { data: [], error: null };
    const j = await (await run(h)).json();
    expect(j.skipped).toBe(1); expect(state.fetches.length).toBe(0);
  });
});

// ---------- promo-notifier ----------
describe('promo-notifier', () => {
  const run = (h: any) => h(new Request('http://x', { method: 'POST', headers: { 'x-cron-secret': env.CRON_SECRET } }));
  test('re-checks the limit before each push and logs what it sent', async () => {
    const h = await load('../promo-notifier/index.ts');
    state.rpc.price_drop_targets = { data: [{ user_id: 'u1', product_id: 'p1', discount_pct: 15, score: 9 }, { user_id: 'u1', product_id: 'p2', discount_pct: 20, score: 5 }], error: null };
    let n = 0;
    const orig = fakeClient.rpc; (fakeClient as any).rpc = (name: string, args: any) => name === 'can_send_promo' ? Promise.resolve({ data: n++ === 0 }) : orig(name, args);
    state.results['product_feed:select'] = { data: { id: 'p1', title: 'Blender', price: 280, display_price: 238, campaign_id: 'c1' } };
    state.results['profiles:select'] = { data: { push_token: 'ExponentPushToken[abc]' } };
    state.fetchMap = { 'exp.host': { status: 200, body: { data: { status: 'ok' } } } };
    const j = await (await run(h)).json();
    (fakeClient as any).rpc = orig;
    expect(j).toMatchObject({ candidates: 2, sent: 1, skipped: 1 });
    expect(state.fetches[0].body.title).toBe('15% off: Blender'); expect(state.fetches[0].body.body).toContain('GH₵238.00');
    expect(state.calls.some((c: any) => c.table === 'promo_notification_log' && c.op === 'insert')).toBe(true);
  });
});


// ---------- phone login code (Supabase Send SMS hook) ----------
describe('send-sms-hook', () => {
  const keyB64 = Buffer.from('hook-secret-bytes-0123456789abcdef').toString('base64');
  const hookReq = (payload: any, o: { ts?: number; secretB64?: string; id?: string; extra?: string; body?: string } = {}) => {
    const body = o.body ?? JSON.stringify(payload);
    const id = o.id ?? 'msg_1', ts = String(o.ts ?? Math.floor(Date.now() / 1000));
    const mac = createHmac('sha256', Buffer.from(o.secretB64 ?? keyB64, 'base64')).update(`${id}.${ts}.${body}`).digest('base64');
    return new Request('http://x/send-sms-hook', { method: 'POST', body,
      headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': `${o.extra ?? ''}v1,${mac}` } });
  };
  const good = { user: { phone: '233244123456' }, sms: { otp: '482913' } };
  const smsCalls = () => state.fetches.filter((f: any) => f.url.includes('arkesel'));

  test('valid hook call texts the code to the normalised Ghana number', async () => {
    state.fetchMap['arkesel'] = { status: 200, body: { status: 'success' } };
    const h = await load('../send-sms-hook/index.ts');
    const res = await h(hookReq(good));
    expect(res.status).toBe(200);
    expect(smsCalls().length).toBe(1);
    expect(smsCalls()[0].body.recipients).toEqual(['+233244123456']);
    expect(smsCalls()[0].body.message).toContain('482913');
    expect(smsCalls()[0].body.message.length).toBeLessThan(160);
  });
  test('rejects wrong signature, tampered body, stale timestamp and missing headers without sending', async () => {
    const h = await load('../send-sms-hook/index.ts');
    const wrong = await h(hookReq(good, { secretB64: Buffer.from('another-secret-another-secret-00').toString('base64') }));
    expect(wrong.status).toBe(401);
    const tampered = hookReq(good); const sig = tampered.headers.get('webhook-signature')!;
    const t2 = new Request('http://x', { method: 'POST', body: JSON.stringify({ ...good, user: { phone: '233200000000' } }),
      headers: { 'webhook-id': 'msg_1', 'webhook-timestamp': tampered.headers.get('webhook-timestamp')!, 'webhook-signature': sig } });
    expect((await h(t2)).status).toBe(401);
    expect((await h(hookReq(good, { ts: Math.floor(Date.now() / 1000) - 3600 }))).status).toBe(401);
    expect((await h(new Request('http://x', { method: 'POST', body: JSON.stringify(good) }))).status).toBe(401);
    expect(smsCalls().length).toBe(0);
  });
  test('accepts the right signature among several', async () => {
    state.fetchMap['arkesel'] = { status: 200, body: { status: 'success' } };
    const h = await load('../send-sms-hook/index.ts');
    expect((await h(hookReq(good, { extra: 'v1,AAAAAAAA ' }))).status).toBe(200);
  });
  test('non-Ghana number is refused and nothing is sent', async () => {
    const h = await load('../send-sms-hook/index.ts');
    const res = await h(hookReq({ user: { phone: '14155550123' }, sms: { otp: '123456' } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('Ghana');
    expect(smsCalls().length).toBe(0);
  });
  test('SMS provider failure gives a friendly 502 that does not contain the code, and the code is never logged', async () => {
    state.fetchMap['arkesel'] = { status: 500, body: { status: 'error', message: 'boom' } };
    const logged: string[] = []; const orig = console.error; console.error = (...a: any[]) => { logged.push(a.join(' ')); };
    const h = await load('../send-sms-hook/index.ts');
    const res = await h(hookReq(good)); console.error = orig;
    expect(res.status).toBe(502);
    const txt = JSON.stringify(await res.json());
    expect(txt).not.toContain('482913'); expect(logged.join(' ')).not.toContain('482913');
  });
});
