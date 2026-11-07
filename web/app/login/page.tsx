'use client';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

function LoginForm() {
  const router = useRouter();
  const denied = useSearchParams().get('denied');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setErr(error.message);
    router.replace('/');
  };

  return (
    <div className="center-page">
      <form className="login-card" onSubmit={submit}>
        <img src="/logo.jpg" alt="Ebenoba GH" />
        <p className="muted right" style={{ textAlign: 'center', marginTop: 0 }}>Admin &amp; rider portal</p>
        {denied && <div className="notice err">This account does not have access to the portal.</div>}
        {err && <div className="notice err">{err}</div>}
        <div className="field"><label>Email</label><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="field"><label>Password</label><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <button className="btn big-btn" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </div>
  );
}

export default function Login() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}
