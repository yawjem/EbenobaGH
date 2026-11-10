import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, radius } from '../lib/theme';

export function Button({ title, onPress, variant = 'primary', loading, disabled, style }:
  { title: string; onPress: () => void; variant?: 'primary' | 'outline' | 'soft'; loading?: boolean; disabled?: boolean; style?: ViewStyle }) {
  const bg = variant === 'primary' ? colors.primary : variant === 'soft' ? colors.blush : 'transparent';
  const fg = variant === 'primary' ? '#fff' : colors.primary;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [b.btn, { backgroundColor: pressed && variant === 'primary' ? colors.deep : bg,
        borderColor: colors.primary, borderWidth: variant === 'outline' ? 1.5 : 0, opacity: disabled ? 0.5 : 1 }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[b.txt, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export const Section = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
  <View style={{ marginTop: 20 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, marginBottom: 6 }}>
      <Text style={{ fontSize: 17, fontWeight: '800', color: colors.navy }}>{title}</Text>{action}
    </View>
    {children}
  </View>
);

export const Empty = ({ text }: { text: string }) => (
  <View style={{ padding: 32, alignItems: 'center' }}><Text style={{ color: colors.muted, textAlign: 'center' }}>{text}</Text></View>
);

const b = StyleSheet.create({
  btn: { borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  txt: { fontWeight: '700', fontSize: 15 },
});
