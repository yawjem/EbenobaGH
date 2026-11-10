// "Continue with Google": Supabase runs the Google login in a browser sheet, then sends the
// user back to the app through the ebenoba:// link with a session in the address.
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export async function signInWithGoogle(): Promise<{ ok: boolean; cancelled?: boolean; error?: string }> {
  const redirectTo = Linking.createURL('auth-callback');   // ebenoba://auth-callback (or exp://… in Expo Go)
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error || !data?.url) return { ok: false, error: error?.message ?? 'Could not start Google sign-in.' };

  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success' || !res.url) return { ok: false, cancelled: true };

  // Tokens come back after "#" (or a one-time "code" after "?" if PKCE is on)
  const [base, hash = ''] = res.url.split('#');
  const q = new URLSearchParams(hash || base.split('?')[1] || '');
  const err = q.get('error_description') ?? q.get('error');
  if (err) return { ok: false, error: err };
  const access_token = q.get('access_token'), refresh_token = q.get('refresh_token'), code = q.get('code');
  if (access_token && refresh_token) {
    const r = await supabase.auth.setSession({ access_token, refresh_token });
    return r.error ? { ok: false, error: r.error.message } : { ok: true };
  }
  if (code) {
    const r = await supabase.auth.exchangeCodeForSession(code);
    return r.error ? { ok: false, error: r.error.message } : { ok: true };
  }
  return { ok: false, error: 'Google did not return a sign-in. Please try again.' };
}
