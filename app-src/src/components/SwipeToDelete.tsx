// Swipe a row left to reveal a red "Remove" button; swipe far enough (or tap it) to delete.
// Uses only React Native's built-in PanResponder + Animated, so it needs no extra packages.
import React, { useRef } from 'react';
import { Animated, PanResponder, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../lib/theme';

const REVEAL = 88;          // width of the red button
const COMMIT = 190;         // swipe past this and the row is removed straight away

export function SwipeToDelete({ children, onDelete, style }: { children: React.ReactNode; onDelete: () => void; style?: any }) {
  const x = useRef(new Animated.Value(0)).current;
  const open = useRef(false);
  const onDeleteRef = useRef(onDelete); onDeleteRef.current = onDelete;

  const settle = (to: number, cb?: () => void) =>
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0, speed: 20 }).start(cb);

  const remove = () =>
    Animated.timing(x, { toValue: -500, duration: 160, useNativeDriver: true }).start(() => onDeleteRef.current());

  const pan = useRef(PanResponder.create({
    // only take over for clearly horizontal drags, so the list can still scroll up and down
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderMove: (_, g) => {
      const base = open.current ? -REVEAL : 0;
      x.setValue(Math.min(0, Math.max(-320, base + g.dx)));
    },
    onPanResponderRelease: (_, g) => {
      const end = (open.current ? -REVEAL : 0) + g.dx;
      if (end < -COMMIT || g.vx < -1.6) return remove();
      if (end < -REVEAL / 2) { open.current = true; settle(-REVEAL); }
      else { open.current = false; settle(0); }
    },
    onPanResponderTerminate: () => { settle(open.current ? -REVEAL : 0); },
  })).current;

  return (
    <View style={[{ marginBottom: 10 }, style]}>
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: REVEAL + 20, borderRadius: radius.md, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'flex-end' }}>
        <Pressable onPress={remove} accessibilityRole="button" accessibilityLabel="Remove from cart"
          style={{ width: REVEAL, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
          <Ionicons name="trash-outline" size={22} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 12, marginTop: 2 }}>Remove</Text>
        </Pressable>
      </View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }], backgroundColor: colors.bg }}>
        {children}
      </Animated.View>
    </View>
  );
}
