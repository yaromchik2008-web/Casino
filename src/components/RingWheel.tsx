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
  {
    segments: RingSegment[];
    size: number;
    thickness?: number;
    children?: ReactNode;
    labelSize?: number;
    /** Відлік ставок по колу в центрі (лише веб): кінець за Date.now() і повна тривалість, мс. */
    countdown?: { end: number; total: number } | null;
  }
>(({ segments, size, thickness = size * 0.15, children, labelSize = 12, countdown }, ref) => {
  const rot = useRef(new Animated.Value(0)).current;
  const current = useRef(0);
  // У браузері колесо малюється на канвасі; anim — поточне обертання.
  const anim = useRef({ from: 0, to: 0, start: 0, ms: 0, index: -1, done: null as null | (() => void) });
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
        anim.current = { from: base, to: target, start: performance.now(), ms, index, done: onDone };
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
      const deg = a.from + (a.to - a.from) * easeOutCubic(t);
      const c = size / 2;
      const r1 = radius + thickness / 2;
      const r0 = radius - thickness / 2;
      const rad = (step * Math.PI) / 180;
      ctx.clearRect(0, 0, size, size);
      // Обідок: темне кільце з легким відблиском.
      const rim = ctx.createRadialGradient(c, c, r1, c, c, size / 2);
      rim.addColorStop(0, '#05050A');
      rim.addColorStop(0.45, '#1C1C2B');
      rim.addColorStop(1, '#07070D');
      ctx.fillStyle = rim;
      ctx.beginPath();
      ctx.arc(c, c, size / 2 - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      ctx.translate(c, c);
      ctx.rotate((deg * Math.PI) / 180);
      for (let i = 0; i < n; i++) {
        const sg = segments[i];
        // Сектор i стоїть зверху при нульовому куті.
        const mid = -Math.PI / 2 + i * rad;
        const g = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
        g.addColorStop(0, shade(sg.color, 0.22));
        g.addColorStop(0.55, sg.color);
        g.addColorStop(1, shade(sg.color, -0.35));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, r1, mid - rad / 2, mid + rad / 2);
        ctx.arc(0, 0, r0, mid + rad / 2, mid - rad / 2, true);
        ctx.closePath();
        ctx.fill();
        if (sg.label) {
          ctx.save();
          ctx.rotate(mid + Math.PI / 2);
          ctx.font = `900 ${labelSize}px ${FONT}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.lineWidth = Math.max(2, labelSize / 4);
          ctx.strokeStyle = 'rgba(0,0,0,0.45)';
          ctx.strokeText(sg.label, 0, -r1 + 5, ((2 * Math.PI * radius) / n) * 0.85);
          ctx.fillStyle = sg.textColor ?? '#FFFFFF';
          ctx.fillText(sg.label, 0, -r1 + 5, ((2 * Math.PI * radius) / n) * 0.85);
          ctx.restore();
        }
      }
      // Рівні тонкі розділювачі замість дірок між плитками.
      ctx.strokeStyle = 'rgba(5,5,10,0.85)';
      ctx.lineWidth = Math.max(1.5, size / 200);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const e = -Math.PI / 2 + (i - 0.5) * rad;
        ctx.moveTo(Math.cos(e) * r0, Math.sin(e) * r0);
        ctx.lineTo(Math.cos(e) * r1, Math.sin(e) * r1);
      }
      ctx.stroke();
      ctx.restore();
      // Тінь всередині кільця дає об'єм.
      const inner = ctx.createRadialGradient(c, c, r0, c, c, r1);
      inner.addColorStop(0, 'rgba(0,0,0,0.35)');
      inner.addColorStop(0.18, 'rgba(0,0,0,0)');
      inner.addColorStop(0.82, 'rgba(0,0,0,0)');
      inner.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = inner;
      ctx.beginPath();
      ctx.arc(c, c, r1, 0, Math.PI * 2);
      ctx.arc(c, c, r0, 0, Math.PI * 2, true);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(c, c, r1 + 1, 0, Math.PI * 2);
      ctx.stroke();
      // Виграшний сектор світиться після зупинки.
      const since = now - a.start - a.ms;
      let more = t < 1;
      if (a.ms && t >= 1 && since < 2600 && a.index >= 0) {
        more = true;
        const k = 0.35 + 0.35 * Math.sin(since / 120);
        ctx.save();
        ctx.translate(c, c);
        ctx.rotate((deg * Math.PI) / 180);
        const mid = -Math.PI / 2 + a.index * rad;
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 18;
        ctx.fillStyle = `rgba(255,255,255,${k})`;
        ctx.beginPath();
        ctx.arc(0, 0, r1, mid - rad / 2, mid + rad / 2);
        ctx.arc(0, 0, r0, mid + rad / 2, mid - rad / 2, true);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // Центр: темна чаша і кільце відліку.
      const hubR = r0 - Math.max(6, size * 0.03);
      const hub = ctx.createRadialGradient(c, c - hubR * 0.3, hubR * 0.1, c, c, hubR);
      hub.addColorStop(0, '#1E2233');
      hub.addColorStop(1, '#0A0B12');
      ctx.fillStyle = hub;
      ctx.beginPath();
      ctx.arc(c, c, hubR, 0, Math.PI * 2);
      ctx.fill();
      const cd = countdown;
      if (cd) {
        const left = Math.max(0, Math.min(1, (cd.end - Date.now()) / cd.total));
        const ringR = hubR - Math.max(5, size * 0.025);
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(4, size * 0.022);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.arc(c, c, ringR, 0, Math.PI * 2);
        ctx.stroke();
        if (left > 0) {
          // Колір іде від зеленого через жовтий до червоного.
          const col = `hsl(${Math.round(120 * left)}, 85%, 55%)`;
          ctx.strokeStyle = col;
          ctx.shadowColor = col;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(c, c, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left);
          ctx.stroke();
          ctx.shadowBlur = 0;
          more = true;
        }
        ctx.lineCap = 'butt';
      }
      // Стрілка зверху.
      const pw = Math.max(9, size * 0.035);
      const ph = Math.max(16, size * 0.07);
      ctx.save();
      ctx.shadowColor = 'rgba(255,200,61,0.8)';
      ctx.shadowBlur = 10;
      const pg = ctx.createLinearGradient(c - pw, 0, c + pw, 0);
      pg.addColorStop(0, '#FFE58A');
      pg.addColorStop(1, '#D99A06');
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.moveTo(c - pw, 1);
      ctx.lineTo(c + pw, 1);
      ctx.lineTo(c, ph + 4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#6B4A02';
      ctx.stroke();
      if (t >= 1 && a.done) {
        const d = a.done;
        a.done = null;
        setTimeout(d, 50);
      }
      return more;
    };
    return (
      <View style={{ width: size, height: size }}>
        <View style={StyleSheet.absoluteFill}>
          <GameCanvas width={size} height={size} draw={draw} onKick={(f) => (forceDraw.current = f)} />
        </View>
        <View style={[styles.centerWeb, { margin: thickness + 8, borderRadius: size }]} pointerEvents="none">
          {children}
        </View>
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
  centerWeb: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
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

/** Світліший (k > 0) чи темніший (k < 0) відтінок #RRGGBB. */
function shade(hex: string, k: number) {
  const v = parseInt(hex.slice(1, 7), 16);
  const ch = (x: number) => Math.round(k > 0 ? x + (255 - x) * k : x * (1 + k));
  return `rgb(${ch((v >> 16) & 255)},${ch((v >> 8) & 255)},${ch(v & 255)})`;
}
