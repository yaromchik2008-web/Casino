import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors, formatCoins } from '../theme';
import { useCountUp } from './Celebration';

/** Лічильник останнього виграшу, що «набігає» від нуля. */
export function WinCounter({ amount, countKey }: { amount: number; countKey: number }) {
  const value = useCountUp(amount, 900, countKey);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!countKey) return;
    pop.setValue(1.35);
    Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [countKey, pop]);
  return (
    <Animated.View style={[styles.box, { transform: [{ scale: pop }] }]}>
      <Text style={styles.label}>ВИГРАШ</Text>
      <Text style={styles.value}>{formatCoins(countKey ? value : 0)}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#12102E',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: { color: colors.muted, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  value: { color: colors.gold, fontSize: 20, fontWeight: '900', minWidth: 90, textAlign: 'right' },
});
