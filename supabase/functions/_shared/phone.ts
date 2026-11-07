// Ghana numbers: 024 412 3456, +233244123456, 233244123456, 244123456  ->  +233244123456
export function normalizeGhPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/[^\d]/g, '');
  let national: string | null = null;
  if (d.startsWith('233') && d.length === 12) national = d.slice(3);
  else if (d.startsWith('0') && d.length === 10) national = d.slice(1);
  else if (d.length === 9) national = d;
  return national && /^[235]\d{8}$/.test(national) ? '+233' + national : null;
}
