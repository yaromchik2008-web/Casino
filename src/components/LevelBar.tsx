import { StyleSheet, Text, View } from 'react-native';
import { LEVELS, levelName, xpForLevel } from '../state/progress';
import { colors, formatCoins } from '../theme';

export function LevelBar({ xp, level }: { xp: number; level: number }) {
  const max = level >= LEVELS.length;
  const from = xpForLevel(level);
  const to = xpForLevel(level + 1);
  const pct = max ? 1 : (xp - from) / (to - from);
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.level}>⭐ Рівень {level}: {levelName(level)}</Text>
        {!max && <Text style={styles.xp}>{Math.floor(xp).toLocaleString('uk-UA')} / {to.toLocaleString('uk-UA')} XP</Text>}
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.max(2, pct * 100)}%` }]} />
      </View>
      {!max && <Text style={styles.hint}>Наступний рівень: {levelName(level + 1)} і {formatCoins(1000 * (level + 1))}. 1 XP за кожні 10 копійок ставки</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6, width: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  level: { color: colors.gold, fontWeight: '800' },
  xp: { color: colors.muted, fontSize: 12 },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.accent, borderRadius: 5 },
  hint: { color: colors.muted, fontSize: 11 },
});
