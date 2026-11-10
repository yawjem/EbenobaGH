import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { claimGuestEvents } from '../lib/tracking';
import { registerForPush } from '../lib/push';

type Profile = {
  id: string; full_name: string | null; email: string | null; phone: string | null;
  role: string; promo_push_enabled: boolean; tracking_consent: boolean;
};
type Ctx = { session: Session | null; profile: Profile | null; loading: boolean; refreshProfile: () => Promise<void> };

const AuthCtx = createContext<Ctx>({ session: null, profile: null, loading: true, refreshProfile: async () => {} });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async (s: Session | null) => {
    if (!s) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', s.user.id).single();
    setProfile(data as Profile | null);
  };

  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  // Coming back to the app re-reads the profile, so a newly approved seller sees the My Shop tab without signing in again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active' && sessionRef.current) load(sessionRef.current); });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session); await load(data.session); setLoading(false);
      if (data.session) registerForPush(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (event, s) => {
      setSession(s); await load(s);
      if (event === 'SIGNED_IN' && s) { claimGuestEvents(); registerForPush(s.user.id); }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthCtx.Provider value={{ session, profile, loading, refreshProfile: () => load(session) }}>
      {children}
    </AuthCtx.Provider>
  );
}
