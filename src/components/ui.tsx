import * as Haptics from 'expo-haptics';
import { ReactNode, useState } from 'react';
import { Platform, Pressable, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { getSettings } from '../audio/sound';
import { telegramHaptic } from '../telegram';
import { BETS, MAX_BET, MIN_BET, colors, formatCoins, formatShort } from '../theme';

export function haptic(kind: 'tap' | 'win' | 'lose' = 'tap') {
  if (!getSettings().vibration) return;
  if (Platform.OS === 'web') {
    telegramHaptic(kind);
    return;
  }
  if (kind === 'win') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else if (kind === 'lose') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  else Haptics.selectionAsync().catch(() => {});
}

/** Перетворює «0,15» або «2.5» у копійки; null, якщо введено не число. */
export function parseMoney(text: string): number | null {
  const v = Number(text.replace(',', '.').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100);
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
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const custom = !options.includes(value);
  const apply = () => {
    const v = parseMoney(text);
    if (v !== null) onChange(Math.min(MAX_BET, Math.max(MIN_BET, v)));
    setEditing(false);
  };
  return (
    <View style={styles.betWrap}>
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
            <Text style={[styles.betText, value === b && styles.betTextActive]}>{formatShort(b)}</Text>
          </Pressable>
        ))}
        <Pressable
          disabled={disabled}
          onPress={() => {
            setText(formatShort(value));
            setEditing(true);
          }}
          style={[styles.betChip, custom && styles.betChipActive, disabled && styles.dim]}
        >
          <Text style={[styles.betText, custom && styles.betTextActive]}>{custom ? formatShort(value) : 'Своя ✎'}</Text>
        </Pressable>
      </View>
      {editing && (
        <View style={styles.customRow}>
          <TextInput
            autoFocus
            value={text}
            onChangeText={setText}
            onSubmitEditing={apply}
            keyboardType="decimal-pad"
            placeholder="1"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <Text style={styles.currency}>₴</Text>
          <Pressable onPress={apply} style={[styles.betChip, styles.betChipActive]}>
            <Text style={[styles.betText, styles.betTextActive]}>OK</Text>
          </Pressable>
        </View>
      )}
      <Text style={styles.betHint}>
        Ставка: {formatCoins(value)} · від {formatCoins(MIN_BET)} до {formatCoins(MAX_BET)}
      </Text>
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

export function Panel({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  betWrap: { gap: 8, alignItems: 'center', width: '100%' },
  betRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 },
  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    width: 110,
    borderWidth: 2,
    borderColor: colors.gold,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    backgroundColor: colors.bg,
  },
  currency: { color: colors.gold, fontSize: 20, fontWeight: '900' },
  betHint: { color: colors.muted, fontSize: 12 },
  betChip: {
    minWidth: 44,
    paddingVertical: 7,
    paddingHorizontal: 10,
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
