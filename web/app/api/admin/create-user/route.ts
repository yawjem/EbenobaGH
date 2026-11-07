import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Creates a login for a shop owner or rider. Runs on the server only (uses the service_role key).
// The caller must send their own session token and must be an admin.
export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_ROLE_KEY is not set on the server.' }, { status: 500 });

  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: caller, error: callerErr } = await admin.auth.getUser(token);
  if (callerErr || !caller.user) return NextResponse.json({ error: 'Invalid session.' }, { status: 401 });
  const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.user.id).single();
  if (callerProfile?.role !== 'admin') return NextResponse.json({ error: 'Admins only.' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const role = body.role === 'rider' ? 'rider' : 'seller'; // admins are promoted by hand in SQL on purpose
  const fullName = String(body.full_name ?? '').trim();
  const phone = String(body.phone ?? '').trim() || null;
  const password = String(body.password ?? '');
  if (!email || !email.includes('@')) return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });

  // Existing account? Promote it instead of creating a duplicate.
  const { data: existing } = await admin.from('profiles').select('id,role').eq('email', email).maybeSingle();
  if (existing) {
    if (existing.role === 'admin') return NextResponse.json({ error: 'That email belongs to an admin.' }, { status: 400 });
    await admin.from('profiles').update({ role, ...(fullName ? { full_name: fullName } : {}), ...(phone ? { phone } : {}) }).eq('id', existing.id);
    return NextResponse.json({ id: existing.id, created: false });
  }

  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  const { data, error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name: fullName },
  });
  if (error || !data.user) return NextResponse.json({ error: error?.message ?? 'Could not create user.' }, { status: 400 });

  // The handle_new_user trigger has already created a buyer profile; upgrade it.
  const { error: upErr } = await admin.from('profiles')
    .update({ role, full_name: fullName || null, ...(phone ? { phone } : {}) }).eq('id', data.user.id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 });
  return NextResponse.json({ id: data.user.id, created: true });
}
