import { colors } from './theme';

export const ghs = (n: number | null | undefined) =>
  'GH₵' + Number(n ?? 0).toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Buyer-friendly labels for package statuses (matches the package_status enum).
export const STATUS_LABEL: Record<string, string> = {
  new: 'Waiting for payment',
  paid: 'Paid',
  processing: 'Being prepared',
  ready: 'Waiting to be shipped',
  assigned: 'Rider assigned',
  dispatched: 'Shipped',
  in_transit: 'On its way',
  awaiting_pickup: 'Waiting to be picked up',
  delivered: 'Delivered',
  completed: 'Completed',
  cancelled: 'Cancelled',
  returned: 'Returned',
  refunded: 'Refunded',
};

// One colour per stage of the journey: amber = needs you, navy = we're preparing,
// teal = moving, green = done, grey = closed.
export const STATUS_COLOR = (s: string) =>
  ['delivered', 'completed'].includes(s) ? colors.success
  : ['assigned', 'dispatched', 'in_transit', 'awaiting_pickup'].includes(s) ? colors.teal
  : ['paid', 'processing', 'ready'].includes(s) ? colors.navy
  : ['cancelled', 'returned', 'refunded'].includes(s) ? colors.muted
  : colors.warning; // new / awaiting payment

// Text on the tinted pill needs a darker shade than the dot/line colour to stay readable.
const TEXT_FOR: Record<string, string> = { [colors.success]: colors.greenText, [colors.teal]: colors.tealText, [colors.warning]: colors.goldText };
export const STATUS_TEXT = (s: string) => TEXT_FOR[STATUS_COLOR(s)] ?? STATUS_COLOR(s);
export const STATUS_TINT = (s: string) => STATUS_COLOR(s) + '1F'; // ~12% background for pills

// Steps shown in the tracking timeline (happy path).
export const TIMELINE = ['paid', 'processing', 'ready', 'dispatched', 'in_transit', 'delivered'];

export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
