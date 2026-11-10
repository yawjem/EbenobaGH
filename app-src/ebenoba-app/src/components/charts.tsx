import React, { useState } from 'react';
import { Text, View, Pressable } from 'react-native';
import { colors, radius } from '../lib/theme';
import { ghs } from '../lib/format';

// Simple bar chart drawn with plain Views (no extra chart library to install).
// Tap a bar to see its exact value. The latest bar is crimson, earlier ones teal.
export function BarChart({ data, height = 140 }: { data: { label: string; value: number; sub?: string }[]; height?: number }) {
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const last = data.length - 1;
  const every = data.length > 14 ? Math.ceil(data.length / 6) : 1; // thin out axis labels on long ranges
  const shown = sel ?? last;
  return (
    <View>
      <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 8 }}>
        {data[shown] ? `${data[shown].label}: ` : ''}
        <Text style={{ color: colors.navy, fontWeight: '800' }}>{data[shown] ? ghs(data[shown].value) : ''}</Text>
        {data[shown]?.sub ? <Text style={{ color: colors.muted }}>{`  ·  ${data[shown].sub}`}</Text> : null}
      </Text>
      <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: data.length > 30 ? 1 : 3, borderBottomWidth: 1, borderColor: colors.border }}>
        {data.map((d, i) => (
          <Pressable key={i} onPress={() => setSel(i)} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
            <View style={{ height: Math.max(d.value > 0 ? 3 : 1, (d.value / max) * (height - 4)), borderTopLeftRadius: 3, borderTopRightRadius: 3,
              backgroundColor: i === shown ? colors.primary : d.value > 0 ? colors.teal : colors.border, opacity: i === shown || sel === null ? 1 : 0.75 }} />
          </Pressable>))}
      </View>
      <View style={{ flexDirection: 'row', gap: data.length > 30 ? 1 : 3, marginTop: 4 }}>
        {data.map((d, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            {i % every === 0 || i === last ? <Text numberOfLines={1} style={{ fontSize: 9, color: colors.muted, width: 40, textAlign: 'center' }}>{d.label}</Text> : null}
          </View>))}
      </View>
    </View>
  );
}

export function ProgressBar({ value, goal }: { value: number; goal: number }) {
  const pct = goal > 0 ? Math.min(1, value / goal) : 0;
  const done = goal > 0 && value >= goal;
  return (
    <View>
      <View style={{ height: 12, borderRadius: radius.pill, backgroundColor: colors.navySoft, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round(pct * 100)}%`, height: '100%', borderRadius: radius.pill, backgroundColor: done ? colors.success : colors.gold }} />
      </View>
      <Text style={{ marginTop: 6, color: done ? colors.greenText : colors.goldText, fontWeight: '700', fontSize: 12 }}>
        {goal > 0 ? `${Math.round((value / goal) * 100)}% of your goal${done ? ' — goal reached!' : ''}` : ''}
      </Text>
    </View>
  );
}

// "+12% vs the previous 30 days". Green for up, crimson for down; neutral when there is nothing to compare.
export function Delta({ now, before }: { now: number; before: number }) {
  if (!before) return <Text style={{ color: colors.muted, fontSize: 12 }}>{now > 0 ? 'First sales in this period' : 'No sales yet'}</Text>;
  const pct = Math.round(((now - before) / before) * 100);
  const up = pct >= 0;
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: up ? colors.successSoft : colors.blush, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Text style={{ color: up ? colors.greenText : colors.deep, fontWeight: '700', fontSize: 12 }}>{up ? '▲' : '▼'} {Math.abs(pct)}% vs previous</Text>
    </View>
  );
}
