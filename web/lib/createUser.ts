import { supabase } from './supabase';

export async function createUser(input: { email: string; full_name: string; phone?: string; password?: string; role: 'seller' | 'rider' }) {
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch('/api/admin/create-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? 'Request failed');
  return json as { id: string; created: boolean };
}
