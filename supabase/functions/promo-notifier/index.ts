// Cron (every few hours): push "price drop" alerts to people who showed real interest in a product.
// The anti-annoyance rules live in the database (can_send_promo): max 1/day, 3/week, 1 per product per
// 7 days, quiet hours 21:00-07:00 Accra time, discount of at least 10%, user opt-out. Admin can change them in Settings.
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, isCron } from '../_shared/supabase.ts';
import { sendPush } from '../_shared/senders.ts';

const ghs = (n: number) => 'GH₵' + Number(n).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isCron(req)) return json({ error: 'forbidden' }, 403);

  const admin = adminClient();
  const { data: targets, error } = await admin.rpc('price_drop_targets');
  if (error) { console.error(error); return json({ error: 'targets failed' }, 500); }

  let sent = 0, skipped = 0;
  for (const t of (targets ?? []).slice(0, 200)) {
    // Re-check right before sending: an earlier row in this run may have used up this user's daily limit.
    const { data: allowed } = await admin.rpc('can_send_promo', { p_user: t.user_id, p_product: t.product_id });
    if (!allowed) { skipped++; continue; }

    const [{ data: p }, { data: prof }] = await Promise.all([
      admin.from('product_feed').select('id,title,price,display_price,campaign_id').eq('id', t.product_id).maybeSingle(),
      admin.from('profiles').select('push_token').eq('id', t.user_id).maybeSingle(),
    ]);
    if (!p || !prof?.push_token) { skipped++; continue; }

    const r = await sendPush(prof.push_token, `${t.discount_pct}% off: ${p.title}`,
      `Now ${ghs(p.display_price)} (was ${ghs(p.price)}). Tap to see it.`, { product_id: p.id, kind: 'price_drop' });
    if (r.ok) {
      await admin.from('promo_notification_log').insert({ user_id: t.user_id, product_id: t.product_id, campaign_id: p.campaign_id });
      sent++;
    } else { console.error('promo push failed', r.detail); skipped++; }
  }
  return json({ candidates: targets?.length ?? 0, sent, skipped });
});
