import { forwardRef, ReactNode, useImperativeHandle, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { Ctx, FONT, GameCanvas, easeOutCubic } from './canvasKit';

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
  // У браузері колесо малюється на канвасі; anim — поточне обертання.
  const anim = useRef({ from: 0, to: 0, start: 0, ms: 0, done: null as null | (() => void) });
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
        anim.current = { from: base, to: target, start: performance.now(), ms, done: onDone };
        forceDraw.current?.();
        return;
      }
      Animated.timing(rot, { toValue: target, duration: ms, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() =>
        onDone(),
      );
    },
  }));

  const forceDraw = useRef<(() => void) | null>(null);

  if (Platform.OS === 'web') {
    const draw = (ctx: Ctx, now: number) => {
      const a = anim.current;
      const t = a.ms ? (now - a.start) / a.ms : 1;
      // Та сама крива, що була в CSS: швидко на старті, плавно в кінці.
      const deg = a.from + (a.to - a.from) * easeOutCubic(t);
      ctx.clearRect(0, 0, size, size);
      const c = size / 2;
      ctx.fillStyle = '#0B0B14';
      ctx.beginPath();
      ctx.arc(c, c, size / 2 - 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#1F2937';
      ctx.stroke();
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate((deg * Math.PI) / 180);
      const rad = (step * Math.PI) / 180;
      const gapA = rad * 0.05;
      const r1 = radius + thickness / 2;
      const r0 = radius - thickness / 2;
      for (let i = 0; i < n; i++) {
        const sg = segments[i];
        // Сектор i стоїть зверху при нульовому куті, як і у версії з плитками.
        const mid = -Math.PI / 2 + i * rad;
        ctx.fillStyle = sg.color;
        ctx.beginPath();
        ctx.arc(0, 0, r1, mid - rad / 2 + gapA, mid + rad / 2 - gapA);
        ctx.arc(0, 0, r0, mid + rad / 2 - gapA, mid - rad / 2 + gapA, true);
        ctx.closePath();
        ctx.fill();
        if (sg.label) {
          ctx.save();
          ctx.rotate(mid + Math.PI / 2);
          ctx.font = `900 ${labelSize}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillStyle = sg.textColor ?? '#FFFFFF';
          ctx.fillText(sg.label, 0, -r1 + 4, ((2 * Math.PI * radius) / n) * 0.85);
          ctx.restore();
        }
      }
      ctx.restore();
      if (t >= 1 && a.done) {
        const d = a.done;
        a.done = null;
        setTimeout(d, 50);
      }
      return t < 1;
    };
    return (
      <View style={{ width: size, height: size }}>
        <View style={StyleSheet.absoluteFill}>
          <GameCanvas width={size} height={size} draw={draw} onKick={(f) => (forceDraw.current = f)} />
        </View>
        <View style={[styles.center, { margin: thickness + 8, borderRadius: size }]}>{children}</View>
        <View style={[styles.pointer, { left: size / 2 - 9 }]} />
      </View>
    );
  }

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { transform: [{ rotate: rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] },
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
