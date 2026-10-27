import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { sfx } from '../audio/sound';
import { colors, formatCoins } from '../theme';

export type CelebrationSpec =
  | { kind: 'win'; amount: number; bet: number }
  | { kind: 'intro'; emoji: string; title: string; subtitle: string; color?: string }
  | { kind: 'total'; title: string; amount: number; emoji?: string };

interface Entry {
  spec: CelebrationSpec;
  done: () => void;
}

let current: Entry | null = null;
const queue: Entry[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Показує святкування поверх екрана; проміс завершується, коли гравець його закрив. */
export function celebrate(spec: CelebrationSpec): Promise<void> {
  return new Promise((resolve) => {
    queue.push({ spec, done: resolve });
    if (!current) next();
  });
}

function next() {
  current = queue.shift() ?? null;
  emit();
}

function close() {
  const e = current;
  next();
  e?.done();
}

export function winTier(amount: number, bet: number): string | null {
  const x = amount / Math.max(1, bet);
  if (x >= 50) return 'ЕПІЧНИЙ ВИГРАШ';
  if (x >= 25) return 'МЕГА ВИГРАШ';
  if (x >= 10) return 'ВЕЛИКИЙ ВИГРАШ';
  return null;
}

export function useCountUp(target: number, duration = 1200, key: unknown = target) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = Date.now();
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, target, duration]);
  return value;
}

const COINS = 22;

export function CoinRain({ emoji = '🪙', count = COINS }: { emoji?: string; count?: number }) {
  const { width, height } = useWindowDimensions();
  const drops = useRef(
    Array.from({ length: count }, () => ({
      x: Math.random(),
      delay: Math.random() * 1400,
      dur: 1300 + Math.random() * 1200,
      size: 22 + Math.random() * 18,
      v: new Animated.Value(0),
    })),
  ).current;
  useEffect(() => {
    const anims = drops.map((d) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(d.delay),
          Animated.timing(d.v, { toValue: 1, duration: d.dur, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [drops]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {drops.map((d, i) => (
        <Animated.Text
          key={i}
          style={{
            position: 'absolute',
            left: d.x * (width - 30),
            top: 0,
            fontSize: d.size,
            transform: [
              { translateY: d.v.interpolate({ inputRange: [0, 1], outputRange: [-60, height + 60] }) },
              { rotate: d.v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${i % 2 ? 540 : -540}deg`] }) },
            ],
          }}
        >
          {emoji}
        </Animated.Text>
      ))}
    </View>
  );
}

function WinBody({ amount, title }: { amount: number; title: string }) {
  const value = useCountUp(amount, 2200);
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [pulse]);
  return (
    <>
      <Animated.Text
        style={[styles.tier, { transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }] }]}
      >
        {title}
      </Animated.Text>
      <Text style={styles.amount}>{formatCoins(value)}</Text>
    </>
  );
}

export function CelebrationLayer() {
  const entry = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  const scale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!entry) return;
    scale.setValue(0.3);
    Animated.spring(scale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    const s = entry.spec;
    sfx(s.kind === 'intro' ? 'bonus' : 'bigwin');
    const t = setTimeout(close, s.kind === 'intro' ? 3200 : 5000);
    return () => clearTimeout(t);
  }, [entry, scale]);

  if (!entry) return null;
  const s = entry.spec;
  return (
    <Pressable style={styles.backdrop} onPress={close}>
      {s.kind !== 'intro' && <CoinRain />}
      {s.kind === 'intro' && <CoinRain emoji="✨" count={14} />}
      <Animated.View style={[styles.card, s.kind === 'intro' && s.color ? { borderColor: s.color } : null, { transform: [{ scale }] }]}>
        {s.kind === 'win' && <WinBody amount={s.amount} title={winTier(s.amount, s.bet) ?? 'ВИГРАШ'} />}
        {s.kind === 'total' && (
          <>
            <Text style={styles.big}>{s.emoji ?? '🏆'}</Text>
            <WinBody amount={s.amount} title={s.title} />
          </>
        )}
        {s.kind === 'intro' && (
          <>
            <Text style={styles.big}>{s.emoji}</Text>
            <Text style={styles.tier}>{s.title}</Text>
            <Text style={styles.subtitle}>{s.subtitle}</Text>
          </>
        )}
        <Text style={styles.hint}>Торкнись, щоб продовжити</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(5,3,20,0.82)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  card: {
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 30,
    borderRadius: 28,
    borderWidth: 3,
    borderColor: colors.gold,
    backgroundColor: '#2A0E5C',
    gap: 6,
    maxWidth: 340,
  },
  big: { fontSize: 64 },
  tier: { color: colors.gold, fontSize: 30, fontWeight: '900', textAlign: 'center', letterSpacing: 1 },
  amount: { color: '#FFFFFF', fontSize: 38, fontWeight: '900' },
  subtitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  hint: { color: colors.muted, fontSize: 12, marginTop: 10 },
});
