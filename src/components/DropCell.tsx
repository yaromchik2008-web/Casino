import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Easing, ViewStyle } from 'react-native';
import { getSettings } from '../audio/sound';

/** Клітинка, що падає на своє місце зверху і «лопається», коли виграла. */
export function DropCell({
  row,
  col = 0,
  step,
  size,
  popping,
  pulse,
  style,
  children,
}: {
  row: number;
  /** Стовпець: падають по черзі зліва направо. */
  col?: number;
  step: number;
  size: number;
  popping: boolean;
  pulse?: boolean;
  style?: ViewStyle | ViewStyle[];
  children: ReactNode;
}) {
  const prevRow = useRef<number | null>(null);
  const y = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const from = prevRow.current === null ? -(row + 1.5) * step : (prevRow.current - row) * step;
    prevRow.current = row;
    if (from === 0 || getSettings().lite) return;
    y.setValue(from);
    Animated.timing(y, { toValue: 0, duration: 280 + row * 30, delay: col * 60, easing: Easing.bounce, useNativeDriver: true }).start();
  }, [row, col, step, y]);

  useEffect(() => {
    if (popping) {
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.25, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 140, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    } else if (pulse && !getSettings().lite) {
      const a = Animated.loop(
        Animated.sequence([
          Animated.timing(scale, { toValue: 1.15, duration: 350, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1, duration: 350, useNativeDriver: true }),
        ]),
      );
      a.start();
      return () => {
        a.stop();
        scale.setValue(1);
      };
    } else scale.setValue(1);
  }, [popping, pulse, scale]);

  return (
    <Animated.View
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        style,
        { transform: [{ translateY: y }, { scale }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}
