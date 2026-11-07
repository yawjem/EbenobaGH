// What customers are told when a package changes status. Edit the wording here.
// `channels` also controls cost: SMS is the only paid channel, so "payment received"
// is push + email only; every shipping step also goes by SMS.
export type Channel = 'push' | 'sms' | 'email';
export type Message = { title: string; body: string; channels: Channel[] };

type P = { order_number?: string; shop_name?: string; reason?: string | null; pin?: string | null; courier_name?: string | null; tracking_number?: string | null };

const courier = (p: P) =>
  p.courier_name ? ` Courier: ${p.courier_name}${p.tracking_number ? `, tracking no. ${p.tracking_number}` : ''}.` : '';

export function messageFor(kind: string, p: P): Message | null {
  const n = p.order_number ?? 'your order';
  const from = p.shop_name ? ` from ${p.shop_name}` : '';
  switch (kind) {
    case 'package_paid':
      return { title: 'Payment received', body: `Thank you! We received your payment for order ${n}. Your items are being prepared.`, channels: ['push', 'email'] };
    case 'package_ready':
      return { title: 'Waiting to be shipped', body: `Your package${from} (order ${n}) is packed and waiting to be shipped.`, channels: ['push', 'sms', 'email'] };
    case 'package_dispatched':
      return { title: 'Your package has shipped', body: `Your package${from} (order ${n}) has been shipped.${courier(p)}`, channels: ['push', 'sms', 'email'] };
    case 'package_in_transit':
      return { title: 'Your package is on its way', body: `Your package${from} (order ${n}) is on its way to you.${courier(p)}${p.pin ? ` Your delivery code is ${p.pin}. Give it to the rider only when you have your items.` : ''}`, channels: ['push', 'sms', 'email'] };
    case 'package_awaiting_pickup':
      return { title: 'Ready for pickup', body: `Your package${from} (order ${n}) is waiting to be picked up. Please bring your order number.`, channels: ['push', 'sms', 'email'] };
    case 'package_delivered':
      return { title: 'Delivered', body: `Your package${from} (order ${n}) has been delivered. Enjoy! Rate your purchase in the app.`, channels: ['push', 'sms', 'email'] };
    case 'package_cancelled':
      return { title: 'Package cancelled', body: `Your package${from} (order ${n}) was cancelled. If you paid, contact us and we will help with a refund.`, channels: ['push', 'sms', 'email'] };
    // Shop owners (push/email only, so seller alerts never cost SMS credit)
    case 'seller_new_order':
      return { title: 'New order', body: `You have a new paid order ${n}. Open My Shop and pack it.`, channels: ['push'] };
    case 'seller_approved':
      return { title: 'Your shop is approved', body: `${p.shop_name ?? 'Your shop'} is live on Ebenoba GH. Open the My Shop tab to add your products.`, channels: ['push', 'email'] };
    case 'seller_rejected':
      return { title: 'Shop application update', body: `We could not approve ${p.shop_name ?? 'your shop'} yet.${p.reason ? ` Reason: ${p.reason}.` : ''} You can update your details and apply again.`, channels: ['push', 'email'] };
    default:
      return null;
  }
}

// Login code SMS (one message, under 160 characters)
export const otpMessage = (code: string) => `Ebenoba GH: your login code is ${code}. Never share it with anyone.`;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export const emailHtml = (name: string | null, m: Message) => `<!doctype html><html><body style="margin:0;background:#FAF7F7;font-family:Arial,Helvetica,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="520" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #EDE7E8">
<tr><td style="background:#D50100;color:#fff;padding:18px 24px;font-size:20px;font-weight:bold">Ebenoba GH</td></tr>
<tr><td style="padding:24px;color:#1F1A1B;font-size:15px;line-height:22px">
<div style="font-size:18px;font-weight:bold;color:#88050D;margin-bottom:10px">${esc(m.title)}</div>
${name ? `<div>Hi ${esc(name.split(' ')[0])},</div>` : ''}<div style="margin-top:8px">${esc(m.body)}</div>
<div style="margin-top:20px;color:#6B6466;font-size:12px">Open the Ebenoba GH app and tap Orders to track your package.</div></td></tr>
</table></td></tr></table></body></html>`;
