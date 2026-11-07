// Pure helpers (no Deno globals) so they can be unit-tested anywhere.

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Paystack signs the RAW request body with HMAC-SHA512 using your secret key (x-paystack-signature).
export async function verifySignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody)));
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return diff === 0;
}

// Paystack amounts are in the smallest unit (pesewas). Our database stores cedis.
export const toPesewas = (cedis: number) => Math.round(Number(cedis) * 100);
export const fromPesewas = (pesewas: number) => Math.round(Number(pesewas)) / 100;
