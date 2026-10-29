import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';
import { Ctx, FONT, GameCanvas, WEB, easeOutCubic, roundRect } from './canvasKit';

export interface StripItem {
  label: string;
  color: string;
}

export interface StripSpinnerHandle {
  spin: (targetIndex: number, onDone: () => void) => void;
}

const ITEM_W = 76;
const STRIP_LEN = 60;
const TARGET_POS = 50;

// Стрічка-рулетка: прокручується і зупиняється на обраному елементі під маркером.
export const StripSpinner = forwardRef<StripSpinnerHandle, { items: StripItem[] }>(({ items }, ref) => {
  const [strip, setStrip] = useState<number[]>(() =>
    Array.from({ length: STRIP_LEN }, () => Math.floor(Math.random() * items.length)),
  );
  const [width, setWidth] = useState(320);
  const offset = useRef(new Animated.Value(0)).current;

  const center = (pos: number) => -(pos * ITEM_W - width / 2 + ITEM_W / 2);
  // Веб: стрічка малюється на канвасі, рух рахується в draw без React-рендерів.
  const anim = useRef({ strip: [] as number[], from: 0, to: 0, start: 0, ms: 0, done: null as null | (() => void) });
  const wake = useRef<(() => void) | null>(null);

  useImperativeHandle(ref, () => ({
    spin(targetIndex, onDone) {
      const next = Array.from({ length: STRIP_LEN }, () => Math.floor(Math.random() * items.length));
      next[TARGET_POS] = targetIndex;
      next[4] = strip[TARGET_POS] ?? next[4];
      if (WEB) {
        anim.current = {
          strip: next,
          from: center(4),
          to: center(TARGET_POS) + (Math.random() - 0.5) * ITEM_W * 0.6,
          start: performance.now(),
          ms: 3200,
          done: onDone,
        };
        wake.current?.();
        return;
      }
      setStrip(next);
      offset.setValue(center(4));
      Animated.timing(offset, {
        toValue: center(TARGET_POS) + (Math.random() - 0.5) * ITEM_W * 0.6,
        duration: 3200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => onDone());
    },
  }));

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth(w);
    offset.setValue(-(4 * ITEM_W - w / 2 + ITEM_W / 2));
    if (WEB && !anim.current.ms) anim.current = { ...anim.current, from: -(4 * ITEM_W - w / 2 + ITEM_W / 2), to: -(4 * ITEM_W - w / 2 + ITEM_W / 2) };
  };

  if (WEB) {
    if (!anim.current.strip.length) anim.current = { strip, from: center(4), to: center(4), start: 0, ms: 0, done: null };
    const draw = (ctx: Ctx, now: number) => {
      const a = anim.current;
      const t = a.ms ? (now - a.start) / a.ms : 1;
      const x0 = a.from + (a.to - a.from) * easeOutCubic(t);
      const h = 90;
      ctx.clearRect(0, 0, width, h);
      const first = Math.max(0, Math.floor(-x0 / ITEM_W) - 1);
      const last = Math.min(a.strip.length - 1, Math.ceil((width - x0) / ITEM_W));
      for (let i = first; i <= last; i++) {
        const it = items[a.strip[i]];
        const x = x0 + i * ITEM_W + 2;
        ctx.fillStyle = it.color;
        roundRect(ctx, x, 7, ITEM_W - 4, 76, 10);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `900 18px ${FONT}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(it.label, x + (ITEM_W - 4) / 2, 45, ITEM_W - 10);
      }
      if (t >= 1 && a.done) {
        const d = a.done;
        a.done = null;
        setTimeout(d, 0);
      }
      return t < 1;
    };
    return (
      <View style={styles.frame} onLayout={onLayout}>
        <GameCanvas width={width} height={90} draw={draw} onKick={(f) => (wake.current = f)} />
        <View pointerEvents="none" style={styles.marker} />
        <View pointerEvents="none" style={styles.markerTop} />
      </View>
    );
  }

  return (
    <View style={styles.frame} onLayout={onLayout}>
      <Animated.View style={[styles.strip, { transform: [{ translateX: offset }] }]}>
        {strip.map((idx, i) => (
          <View key={i} style={[styles.item, { backgroundColor: items[idx].color }]}>
            <Text style={styles.itemText} numberOfLines={1} adjustsFontSizeToFit>
              {items[idx].label}
            </Text>
          </View>
        ))}
      </Animated.View>
      <View pointerEvents="none" style={styles.marker} />
      <View pointerEvents="none" style={styles.markerTop} />
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    height: 96,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#0B0B2B',
    borderWidth: 3,
    borderColor: colors.gold,
    justifyContent: 'center',
  },
  strip: { flexDirection: 'row', position: 'absolute', left: 0 },
  item: {
    width: ITEM_W - 4,
    height: 76,
    marginHorizontal: 2,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  itemText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  marker: { position: 'absolute', left: '50%', marginLeft: -2, width: 4, top: 0, bottom: 0, backgroundColor: colors.gold },
  markerTop: {
    position: 'absolute',
    left: '50%',
    marginLeft: -10,
    top: -2,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 14,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.gold,
  },
});
