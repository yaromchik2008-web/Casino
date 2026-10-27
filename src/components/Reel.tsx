import { ReactNode, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../theme';

const STRIP = 6;

/** Барабан, що прокручує стрічку символів і пружинить при зупинці. */
export function Reel<T>({
  items,
  spinning,
  size,
  gap = 6,
  render,
  randomItem,
  win,
  speed = 260,
  cellStyle,
}: {
  items: T[];
  spinning: boolean;
  size: number;
  gap?: number;
  render: (item: T, row: number) => ReactNode;
  randomItem: () => T;
  win?: boolean[];
  speed?: number;
  cellStyle?: ViewStyle;
}) {
  const scroll = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const step = size + gap;
  const height = items.length * size + (items.length - 1) * gap;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const strip = useMemo(() => {
    const half = Array.from({ length: STRIP }, () => randomItem());
    return [...half, ...half];
  }, [spinning]);

  useEffect(() => {
    if (spinning) {
      scroll.setValue(0);
      const loop = Animated.loop(
        Animated.timing(scroll, { toValue: 1, duration: speed, easing: Easing.linear, useNativeDriver: true }),
      );
      loop.start();
      return () => loop.stop();
    }
    bounce.setValue(-size * 0.35);
    Animated.spring(bounce, { toValue: 0, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [spinning, scroll, bounce, size, speed]);

  return (
    <View style={{ height, overflow: 'hidden' }}>
      {spinning ? (
        <Animated.View
          style={{
            gap,
            transform: [
              { translateY: scroll.interpolate({ inputRange: [0, 1], outputRange: [-STRIP * step, 0] }) },
            ],
          }}
        >
          {strip.map((item, i) => (
            <View key={i} style={[styles.cell, cellStyle, { width: size, height: size }, styles.blur]}>
              {render(item, -1)}
            </View>
          ))}
        </Animated.View>
      ) : (
        <Animated.View style={{ gap, transform: [{ translateY: bounce }] }}>
          {items.map((item, row) => (
            <WinCell key={row} size={size} win={!!win?.[row]} style={cellStyle}>
              {render(item, row)}
            </WinCell>
          ))}
        </Animated.View>
      )}
    </View>
  );
}

export function WinCell({
  size,
  win,
  children,
  style,
}: {
  size: number;
  win: boolean;
  children: ReactNode;
  style?: ViewStyle;
}) {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!win) {
      pulse.setValue(0);
      return;
    }
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [win, pulse]);
  return (
    <Animated.View
      style={[
        styles.cell,
        style,
        { width: size, height: size },
        win && styles.cellWin,
        { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: 12,
    backgroundColor: '#FFFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  cellWin: { borderColor: colors.gold, backgroundColor: '#FFF3C4' },
  blur: { opacity: 0.75 },
});
