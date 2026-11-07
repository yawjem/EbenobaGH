import React, { useEffect, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../src/lib/supabase';
import { toE164Gh } from '../src/lib/phone';
import { colors, radius } from '../src/lib/theme';
import { Button } from '../src/components/ui';

// Two ways in: a code texted to your phone (no password to remember), or email + password.
// Nobody has to sign in to look around: "Continue browsing" closes this screen and the whole shop stays open.
// An account is only needed to order, track deliveries, save a wishlist or sell.
const RESEND_SECONDS = 60;

const friendly = (m: string) =>
  /rate limit|too many|security purposes/i.test(m) ? 'Too many tries. Please wait a minute and try again.'
  : /expired|invalid/i.test(m) ? 'That code is wrong or has expired. Check it, or ask for a new one.'
  : /Ghana/i.test(m) ? 'Please use a Ghana mobile number.'
  : m;

export default function Login() {
  const [way, setWay] = useState<'phone' | 'email'>('phone');
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const inp = { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: 14, marginTop: 10, backgroundColor: '#fff', fontSize: 16 } as const;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 16 }} keyboardShouldPersistTaps="handled">
        <Image source={require('../assets/splash.png')} style={{ width: 150, height: 150, alignSelf: 'center' }} resizeMode="contain" />
        <Text style={{ fontSize: 22, fontWeight: '800', color: colors.navy, textAlign: 'center' }}>Welcome to Ebenoba GH</Text>
        <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 4, marginBottom: 18 }}>Sign in to order and track your deliveries.</Text>

        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radius.pill, padding: 4, borderWidth: 1, borderColor: colors.border }}>
          {([['phone', 'Phone number', 'call-outline'], ['email', 'Email', 'mail-outline']] as const).map(([k, label, icon]) => (
            <Pressable key={k} onPress={() => setWay(k)} style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: radius.pill, backgroundColor: way === k ? colors.primary : 'transparent' }}>
              <Ionicons name={icon} size={16} color={way === k ? '#fff' : colors.muted} />
              <Text style={{ fontWeight: '700', color: way === k ? '#fff' : colors.muted }}>{label}</Text></Pressable>))}
        </View>

        {way === 'phone' ? <PhoneLogin inp={inp} onDone={close} /> : <EmailLogin inp={inp} onDone={close} />}

        <View style={{ marginTop: 28, padding: 14, borderRadius: radius.lg, backgroundColor: colors.tealSoft, alignItems: 'center' }}>
          <Text style={{ color: colors.tealText, fontWeight: '700', textAlign: 'center' }}>No account needed to look around</Text>
          <Text style={{ color: colors.tealText, textAlign: 'center', fontSize: 12, marginTop: 2 }}>Browse every shop, search and fill your cart. Sign in only when you are ready to order.</Text>
          <Button title="Continue browsing" variant="soft" onPress={close} style={{ marginTop: 10, alignSelf: 'stretch' }} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function PhoneLogin({ inp, onDone }: { inp: any; onDone: () => void }) {
  const [step, setStep] = useState<'number' | 'code'>('number');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const e164 = toE164Gh(phone);

  useEffect(() => { if (wait <= 0) return; const t = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(t); }, [wait]);

  const send = async () => {
    if (!e164) return Alert.alert('Check your number', 'Enter a Ghana mobile number, e.g. 024 412 3456.');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ phone: e164, options: { data: name.trim() ? { full_name: name.trim() } : undefined } });
    setBusy(false);
    if (error) return Alert.alert('Could not send the code', friendly(error.message));
    setCode(''); setStep('code'); setWait(RESEND_SECONDS);
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) return Alert.alert('Enter the 6-digit code from the SMS');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({ phone: e164!, token: code, type: 'sms' });
    setBusy(false);
    if (error) return Alert.alert('Could not sign in', friendly(error.message));
    onDone();
  };

  if (step === 'number') return (
    <View>
      <TextInput placeholder="Your name (optional)" value={name} onChangeText={setName} style={inp} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ ...inp, paddingVertical: 14, paddingHorizontal: 12 }}><Text style={{ fontSize: 16 }}>🇬🇭 +233</Text></View>
        <TextInput placeholder="024 412 3456" keyboardType="phone-pad" value={phone} onChangeText={setPhone} style={{ ...inp, flex: 1 }} autoComplete="tel" />
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>We will text you a 6-digit code. New here? Your account is created automatically.</Text>
      <Button title="Send code" loading={busy} onPress={send} style={{ marginTop: 16 }} />
    </View>);

  return (
    <View>
      <Text style={{ marginTop: 16, color: colors.text }}>Enter the 6-digit code sent to <Text style={{ fontWeight: '800' }}>{e164}</Text></Text>
      <TextInput placeholder="••••••" keyboardType="number-pad" maxLength={6} value={code} onChangeText={(v) => setCode(v.replace(/\D/g, ''))}
        textContentType="oneTimeCode" autoComplete="sms-otp" style={{ ...inp, fontSize: 26, letterSpacing: 12, textAlign: 'center', fontWeight: '800' }} />
      <Button title="Verify and continue" loading={busy} onPress={verify} style={{ marginTop: 16 }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
        <Pressable onPress={() => setStep('number')}><Text style={{ color: colors.primary, fontWeight: '600' }}>Change number</Text></Pressable>
        <Pressable disabled={wait > 0 || busy} onPress={send}><Text style={{ color: wait > 0 ? colors.muted : colors.primary, fontWeight: '600' }}>{wait > 0 ? `Send again in ${wait}s` : 'Send a new code'}</Text></Pressable>
      </View>
    </View>);
}

function EmailLogin({ inp, onDone }: { inp: any; onDone: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    const res = mode === 'in'
      ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
      : await supabase.auth.signUp({ email: email.trim(), password, options: { data: { full_name: name } } });
    setBusy(false);
    if (res.error) return Alert.alert(mode === 'in' ? 'Could not sign in' : 'Could not sign up', friendly(res.error.message));
    if (mode === 'up' && !res.data.session) return Alert.alert('Check your email', 'We sent a confirmation link. Confirm it, then sign in.');
    onDone();
  };

  return (
    <View>
      {mode === 'up' && <TextInput placeholder="Full name" value={name} onChangeText={setName} style={inp} />}
      <TextInput placeholder="Email" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} style={inp} />
      <TextInput placeholder="Password" secureTextEntry value={password} onChangeText={setPassword} style={inp} />
      <Button title={mode === 'in' ? 'Sign in' : 'Create account'} loading={busy} onPress={submit} style={{ marginTop: 16 }} />
      <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')} style={{ marginTop: 14, alignItems: 'center' }}>
        <Text style={{ color: colors.primary, fontWeight: '600' }}>{mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}</Text>
      </Pressable>
    </View>);
}
