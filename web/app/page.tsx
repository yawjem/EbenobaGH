'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

// Sends each person to the right place after sign-in.
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return router.replace('/login');
      const { data } = await supabase.from('profiles').select('role').eq('id', session.user.id).single();
      router.replace(data?.role === 'admin' ? '/admin' : data?.role === 'rider' ? '/rider' : '/login?denied=1');
    })();
  }, []);
  return <div className="center-page"><p className="muted">Loading…</p></div>;
}
