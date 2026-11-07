// Verifies "Standard Webhooks" signatures (the scheme Supabase Auth hooks use).
// Signed text = `${webhook-id}.${webhook-timestamp}.${raw body}`, HMAC-SHA256 with the base64 secret, result base64.
// The header can hold several space-separated signatures ("v1,abc v1,def"); any one matching is enough.
const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const bytesToB64 = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf)));

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyStandardWebhook(secret: string, body: string, headers: Headers, toleranceSec = 300): Promise<boolean> {
  try {
    const id = headers.get('webhook-id'), ts = headers.get('webhook-timestamp'), sigs = headers.get('webhook-signature');
    if (!id || !ts || !sigs || !secret) return false;
    const t = Number(ts);
    if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false; // stale or replayed
    // The dashboard shows "v1,whsec_<base64>"; accept that, "whsec_<base64>" or the bare base64.
    const keyB64 = secret.trim().replace(/^v1,/, '').replace(/^whsec_/, '');
    const key = await crypto.subtle.importKey('raw', b64ToBytes(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = bytesToB64(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
    return sigs.split(' ').some((s) => { const [v, sig] = s.split(','); return v === 'v1' && !!sig && sameText(sig, expected); });
  } catch { return false; }
}
