import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

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

  useImperativeHandle(ref, () => ({
    spin(targetIndex, onDone) {
      const next = Array.from({ length: STRIP_LEN }, () => Math.floor(Math.random() * items.length));
      next[TARGET_POS] = targetIndex;
      next[4] = strip[TARGET_POS] ?? next[4];
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
  };

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
