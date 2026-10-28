import { forwardRef, ReactNode, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export interface RingSegment {
  color: string;
  label?: string;
  textColor?: string;
}

export interface RingWheelHandle {
  spin: (index: number, onDone: () => void, ms?: number) => void;
}

// Кругле колесо з секторів-плиток. Сектор index після обертання зупиняється під стрілкою зверху.
export const RingWheel = forwardRef<
  RingWheelHandle,
  { segments: RingSegment[]; size: number; thickness?: number; children?: ReactNode; labelSize?: number }
>(({ segments, size, thickness = size * 0.15, children, labelSize = 12 }, ref) => {
  const rot = useRef(new Animated.Value(0)).current;
  const current = useRef(0);
  // У браузері обертаємо CSS-переходом, щоб не навантажувати JS на кожен кадр.
  const [css, setCss] = useState({ deg: 0, ms: 0 });
  const n = segments.length;
  const step = 360 / n;
  const radius = size / 2 - thickness / 2 - 4;
  const segW = ((2 * Math.PI * radius) / n) * 0.9;

  useImperativeHandle(ref, () => ({
    spin(index, onDone, ms = 4200) {
      const base = current.current;
      const jitter = (Math.random() - 0.5) * step * 0.6;
      const want = (((360 - index * step + jitter - (base % 360)) % 360) + 360) % 360;
      const target = base + 360 * 5 + want;
      current.current = target;
      if (Platform.OS === 'web') {
        setCss({ deg: target, ms });
        setTimeout(onDone, ms + 50);
        return;
      }
      Animated.timing(rot, { toValue: target, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() =>
        onDone(),
      );
    },
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          Platform.OS === 'web'
            ? ({
                transform: [{ rotate: `${css.deg}deg` }],
                transitionProperty: 'transform',
                transitionDuration: `${css.ms}ms`,
                transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
              } as object)
            : { transform: [{ rotate: rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] },
        ]}
      >
        <View style={[styles.rim, { borderRadius: size / 2 }]} />
        {segments.map((s, i) => (
          <View
            key={i}
            style={[
              styles.seg,
              {
                width: segW,
                height: thickness,
                left: size / 2 - segW / 2,
                top: size / 2 - thickness / 2,
                backgroundColor: s.color,
                transform: [{ rotate: `${i * step}deg` }, { translateY: -radius }],
              },
            ]}
          >
            {s.label ? (
              <Text style={[styles.label, { fontSize: labelSize, color: s.textColor ?? '#FFFFFF' }]} numberOfLines={1}>
                {s.label}
              </Text>
            ) : null}
          </View>
        ))}
      </Animated.View>
      <View style={[styles.center, { margin: thickness + 8, borderRadius: size }]}>{children}</View>
      <View style={[styles.pointer, { left: size / 2 - 9 }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  rim: { ...StyleSheet.absoluteFill, backgroundColor: '#0B0B14', borderWidth: 3, borderColor: '#1F2937' },
  seg: { position: 'absolute', borderRadius: 6, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 4 },
  label: { fontWeight: '900' },
  center: { ...StyleSheet.absoluteFill, backgroundColor: '#11111C', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1F2937' },
  pointer: {
    position: 'absolute',
    top: -4,
    width: 18,
    height: 26,
    backgroundColor: colors.gold,
    borderBottomLeftRadius: 9,
    borderBottomRightRadius: 9,
    borderWidth: 2,
    borderColor: '#713F12',
  },
});
