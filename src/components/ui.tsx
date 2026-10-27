import * as Haptics from 'expo-haptics';
import { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { BETS, colors } from '../theme';

export function haptic(kind: 'tap' | 'win' | 'lose' = 'tap') {
  if (Platform.OS === 'web') return;
  if (kind === 'win') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else if (kind === 'lose') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  else Haptics.selectionAsync().catch(() => {});
}

export function BetSelector({
  value,
  onChange,
  disabled,
  options = BETS,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  options?: number[];
}) {
  return (
    <View style={styles.betRow}>
      {options.map((b) => (
        <Pressable
          key={b}
          disabled={disabled}
          onPress={() => {
            haptic();
            onChange(b);
          }}
          style={[styles.betChip, value === b && styles.betChipActive, disabled && styles.dim]}
        >
          <Text style={[styles.betText, value === b && styles.betTextActive]}>{b}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function BigButton({
  label,
  onPress,
  disabled,
  color = colors.green,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  color?: string;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.bigButton,
        { backgroundColor: color },
        disabled && styles.dim,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text style={styles.bigButtonText}>{label}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  active,
  onPress,
  disabled,
  style,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => {
        haptic();
        onPress();
      }}
      style={[styles.chip, active && styles.chipActive, disabled && styles.dim, style]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function ResultLine({ text, tone = 'neutral' }: { text: string; tone?: 'win' | 'lose' | 'neutral' }) {
  const color = tone === 'win' ? colors.gold : tone === 'lose' ? colors.muted : colors.text;
  return <Text style={[styles.result, { color }]}>{text}</Text>;
}

export function Panel({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  betRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  betChip: {
    minWidth: 52,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.gold,
    alignItems: 'center',
  },
  betChipActive: { backgroundColor: colors.gold },
  betText: { color: colors.gold, fontSize: 15, fontWeight: '700' },
  betTextActive: { color: colors.bg },
  bigButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 40,
    alignItems: 'center',
  },
  bigButtonText: { color: '#FFFFFF', fontSize: 20, fontWeight: '900', letterSpacing: 2 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  chipTextActive: { color: '#FFFFFF' },
  result: { fontSize: 20, fontWeight: '800', textAlign: 'center', minHeight: 28 },
  panel: { backgroundColor: colors.surface, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 1 },
  dim: { opacity: 0.4 },
  pressed: { transform: [{ scale: 0.97 }] },
});
