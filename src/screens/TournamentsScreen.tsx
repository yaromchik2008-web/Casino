import { LinearGradient } from 'expo-linear-gradient';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Panel } from '../components/ui';
import { formatDuration, useNow } from '../components/useNow';
import { TOURNAMENT_PRIZES, leaderboard, weekEndsAt, weekId, weekProgress } from '../state/progress';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';

export function TournamentsScreen() {
  const { state } = useWallet();
  const now = useNow();
  const week = weekId(new Date(now));
  const points = state.tournamentWeek === week ? state.tournamentPoints : 0;
  const rows = leaderboard(week, points, weekProgress(new Date(now)));
  const myPlace = rows.findIndex((r) => r.me) + 1;
  const pool = TOURNAMENT_PRIZES.reduce((a, b) => a + b, 0);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>🏆 Турніри</Text>
      <LinearGradient colors={['#0EA5E9', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroTitle}>Тижневий турнір «Зоряний марафон»</Text>
        <Text style={styles.heroPool}>{formatCoins(pool)} 🪙</Text>
        <Text style={styles.heroSub}>Очки = монети, виграні в будь-якій грі цього тижня</Text>
        <Text style={styles.heroTimer}>До кінця: {formatDuration(weekEndsAt(new Date(now)) - now)}</Text>
      </LinearGradient>

      <Panel style={styles.me}>
        <Text style={styles.meText}>Твоє місце: {points > 0 ? `#${myPlace}` : '—'}</Text>
        <Text style={styles.meText}>Очки: {formatCoins(points)}</Text>
        {points > 0 && myPlace <= TOURNAMENT_PRIZES.length && (
          <Text style={styles.mePrize}>Зараз ти отримуєш {formatCoins(TOURNAMENT_PRIZES[myPlace - 1])} 🪙</Text>
        )}
      </Panel>

      <Panel style={styles.board}>
        <Text style={styles.boardTitle}>Таблиця лідерів</Text>
        {rows.slice(0, 15).map((r, i) => (
          <View key={r.name} style={[styles.row, r.me && styles.rowMe]}>
            <Text style={styles.place}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`}</Text>
            <Text style={[styles.name, r.me && styles.nameMe]}>{r.name}</Text>
            <Text style={styles.points}>{formatCoins(r.points)}</Text>
            <Text style={styles.prize}>{TOURNAMENT_PRIZES[i] ? `+${formatCoins(TOURNAMENT_PRIZES[i])}` : ''}</Text>
          </View>
        ))}
        {myPlace > 15 && (
          <View style={[styles.row, styles.rowMe]}>
            <Text style={styles.place}>{myPlace}</Text>
            <Text style={[styles.name, styles.nameMe]}>Ти</Text>
            <Text style={styles.points}>{formatCoins(points)}</Text>
            <Text style={styles.prize} />
          </View>
        )}
      </Panel>
      <Text style={styles.note}>Приз нараховується автоматично на початку наступного тижня. Суперники в таблиці віртуальні.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  hero: { borderRadius: 20, padding: 18, gap: 6 },
  heroTitle: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  heroPool: { color: colors.gold, fontSize: 34, fontWeight: '900' },
  heroSub: { color: '#FFFFFFCC', fontSize: 12 },
  heroTimer: { color: '#FFFFFF', fontWeight: '700', marginTop: 4 },
  me: { gap: 4 },
  meText: { color: colors.text, fontWeight: '700' },
  mePrize: { color: colors.gold, fontWeight: '700' },
  board: { gap: 2 },
  boardTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, paddingHorizontal: 6, borderRadius: 8 },
  rowMe: { backgroundColor: colors.accent + '44' },
  place: { width: 32, color: colors.muted, fontWeight: '800', fontSize: 15 },
  name: { flex: 1, color: colors.text },
  nameMe: { fontWeight: '900', color: colors.gold },
  points: { width: 80, textAlign: 'right', color: colors.text, fontWeight: '700' },
  prize: { width: 70, textAlign: 'right', color: colors.green, fontSize: 12 },
  note: { color: colors.muted, fontSize: 11, textAlign: 'center' },
});
