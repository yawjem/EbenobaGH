import React from 'react';

export const money = (n: number | null | undefined) =>
  'GH₵' + Number(n ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const PACKAGE_STATUSES = [
  'new', 'paid', 'processing', 'ready', 'assigned', 'dispatched', 'in_transit',
  'awaiting_pickup', 'delivered', 'completed', 'cancelled', 'returned', 'refunded',
] as const;

export const STATUS_LABEL: Record<string, string> = {
  new: 'Awaiting payment', paid: 'Paid', processing: 'Processing', ready: 'Ready to ship', assigned: 'Rider assigned',
  dispatched: 'Dispatched', in_transit: 'In transit', awaiting_pickup: 'Awaiting pickup', delivered: 'Delivered',
  completed: 'Completed', cancelled: 'Cancelled', returned: 'Returned', refunded: 'Refunded',
  awaiting_payment: 'Awaiting payment', expired: 'Expired',
};

const tone = (s: string) =>
  ['delivered', 'completed', 'success', 'resolved', 'available', 'active', 'refunded'].includes(s) ? 'ok'
  : ['cancelled', 'returned', 'expired', 'rejected', 'suspended', 'closed', 'failed'].includes(s) ? 'dim'
  : ['new', 'awaiting_payment', 'pending', 'requested', 'open', 'escalated', 'draft'].includes(s) ? 'warn'
  : ['assigned', 'dispatched', 'in_transit', 'awaiting_pickup', 'item_returning', 'in_review'].includes(s) ? 'teal'   // moving
  : ['paid', 'processing', 'ready', 'received', 'approved'].includes(s) ? 'navy'                                      // we're working on it
  : 'brand';

export const Badge = ({ s, text }: { s: string; text?: string }) => (
  <span className={`badge ${tone(s)}`}>{text ?? STATUS_LABEL[s] ?? s.replace(/_/g, ' ')}</span>
);

export const PageHeader = ({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) => (
  <div className="page-head">
    <div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>
    <div className="row">{children}</div>
  </div>
);

export const Stat = ({ label, value, hint, warn, tone }: { label: string; value: React.ReactNode; hint?: string; warn?: boolean; tone?: 'navy' | 'teal' | 'gold' | 'green' }) => (
  <div className={`stat ${warn ? 'warn' : tone ? 't-' + tone : ''}`}>
    <div className="stat-label">{label}</div><div className="stat-value">{value}</div>{hint && <div className="muted small">{hint}</div>}
  </div>
);

export const Empty = ({ text }: { text: string }) => <div className="empty">{text}</div>;
