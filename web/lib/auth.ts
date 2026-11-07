'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from './supabase';

export type Profile = { id: string; full_name: string | null; email: string | null; phone: string | null; role: string };

// Redirects to /login unless the signed-in user has one of the allowed roles.
// (Real protection is Supabase row-level security; this only decides what the UI shows.)
export function useRequireRole(roles: string[]) {
  const router = useRouter();
  const [state, setState] = useState<{ profile: Profile | null; loading: boolean }>({ profile: null, loading: true });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const { data } = await supabase.from('profiles').select('id,full_name,email,phone,role').eq('id', session.user.id).single();
      if (!alive) return;
      if (!data || !roles.includes(data.role)) {
        await supabase.auth.signOut();
        router.replace('/login?denied=1');
        return;
      }
      setState({ profile: data as Profile, loading: false });
    })();
    return () => { alive = false; };
  }, []);

  return state;
}

export async function signOut(router: ReturnType<typeof useRouter>) {
  await supabase.auth.signOut();
  router.replace('/login');
}
