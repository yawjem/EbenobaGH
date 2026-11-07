// Cron worker: sends everything waiting in notification_outbox (order-status push / SMS / email).
// Call it every minute with header  x-cron-secret: <CRON_SECRET>  (see README).
// Order-status messages are NOT subject to the promo limits.
import { corsHeaders, json } from '../_shared/cors.ts';
import { adminClient, isCron } from '../_shared/supabase.ts';
import { emailHtml, messageFor } from '../_shared/templates.ts';
import { sendEmail, sendPush, sendSms } from '../_shared/senders.ts';
import { normalizeGhPhone } from '../_shared/phone.ts';

const MAX_ATTEMPTS = 5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!isCron(req)) return json({ error: 'forbidden' }, 403);

  const admin = adminClient();
  const { data: jobs, error } = await admin.from('notification_outbox').select('*')
    .eq('status', 'pending').lt('attempts', MAX_ATTEMPTS).order('id').limit(40);
  if (error) { console.error(error); return json({ error: 'queue read failed' }, 500); }

  const stats = { sent: 0, retry: 0, failed: 0, skipped: 0 };
  const sentPaid = new Set<string>(); // one "payment received" per order, even if it has several packages

  for (const job of jobs ?? []) {
    // Claim the job (bumps attempts) so two overlapping runs cannot both send it.
    const claim = await admin.from('notification_outbox').update({ attempts: job.attempts + 1 })
      .eq('id', job.id).eq('status', 'pending').eq('attempts', job.attempts).select('id');
    if (!claim.data?.length) { stats.skipped++; continue; }

    const finish = (status: 'sent' | 'failed' | 'pending') =>
      admin.from('notification_outbox').update({ status, sent_at: status === 'sent' ? new Date().toISOString() : null }).eq('id', job.id);

    const msg = messageFor(job.kind, job.payload ?? {});
    const dupKey = `${job.user_id}:${job.payload?.order_id}:${job.kind}`;
    if (!msg || (job.kind === 'package_paid' && sentPaid.has(dupKey))) { await finish('sent'); stats.skipped++; continue; }
    if (job.kind === 'package_paid') sentPaid.add(dupKey);

    const { data: prof } = await admin.from('profiles').select('full_name,email,phone,push_token').eq('id', job.user_id).maybeSingle();
    if (!prof) { await finish('sent'); stats.skipped++; continue; }

    const wanted = msg.channels.filter((c) => (job.channels as string[]).includes(c));
    const tasks: Promise<{ ok: boolean; detail?: string }>[] = [];
    if (wanted.includes('push') && prof.push_token)
      tasks.push(sendPush(prof.push_token, msg.title, msg.body, { order_id: job.payload?.order_id, kind: job.kind }));
    const phone = normalizeGhPhone(prof.phone);
    if (wanted.includes('sms') && phone) tasks.push(sendSms(phone, `Ebenoba GH: ${msg.body}`));
    if (wanted.includes('email') && prof.email && !prof.email.endsWith('@users.ebenoba.app'))
      tasks.push(sendEmail(prof.email, `${msg.title} — ${job.payload?.order_number ?? 'Ebenoba GH'}`, emailHtml(prof.full_name, msg)));

    const results = await Promise.all(tasks);
    results.filter((r) => !r.ok).forEach((r) => console.error(`notification ${job.id} (${job.kind}) channel failed:`, r.detail));

    // Delivered on at least one channel (or the customer has no reachable channel): done.
    // Only retry when every attempted channel failed, so a customer is never texted twice.
    if (results.length === 0 || results.some((r) => r.ok)) { await finish('sent'); stats.sent++; }
    else if (job.attempts + 1 >= MAX_ATTEMPTS) { await finish('failed'); stats.failed++; }
    else { await finish('pending'); stats.retry++; }
  }

  return json({ processed: jobs?.length ?? 0, ...stats });
});
