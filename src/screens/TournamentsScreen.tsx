import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { BigButton, Chip, Panel } from '../components/ui';
import { friendsEnabled } from '../config';
import {
  Leader,
  TOURNEY_FEE,
  TOURNEY_MS,
  TourneyResult,
  TourneyRow,
  friendlyError,
  joinTourney,
  lastTourneyResult,
  leaderboard as globalLeaderboard,
  myProfile,
  reportTourney,
  startFriends,
  tourneyBoard,
  tourneyRound,
} from '../state/friends';
import { telegramName } from '../telegram';
import { formatDuration, useNow } from '../components/useNow';
import { TOURNAMENT_PRIZES, leaderboard, weekEndsAt, weekId, weekProgress } from '../state/progress';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';

type View3 = 'six' | 'leaders' | 'week';

export function TournamentsScreen() {
  const [view, setView] = useState<View3>(friendsEnabled() ? 'six' : 'week');
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>🏆 Турніри</Text>
      <View style={styles.tabs}>
        <Chip label="⏱️ 6 годин" active={view === 'six'} onPress={() => setView('six')} />
        <Chip label="📊 Лідери" active={view === 'leaders'} onPress={() => setView('leaders')} />
        <Chip label="🗓️ Тижневий" active={view === 'week'} onPress={() => setView('week')} />
      </View>
      {view === 'six' ? <SixHours /> : view === 'leaders' ? <Leaders /> : <Weekly />}
    </ScrollView>
  );
}

function useOnline() {
  const [me, setMe] = useState(myProfile());
  const [error, setError] = useState<string | null>(friendsEnabled() ? null : 'Потрібне підключення до сервера');
  useEffect(() => {
    if (!friendsEnabled() || me) return;
    startFriends(telegramName() ?? 'Гравець')
      .then(setMe)
      .catch((e) => setError(friendlyError(e)));
  }, [me]);
  return { me, error, setError };
}

function SixHours() {
  const wallet = useWallet();
  const now = useNow();
  const { me, error, setError } = useOnline();
  const round = tourneyRound(now);
  const [rows, setRows] = useState<TourneyRow[]>([]);
  const [last, setLast] = useState<TourneyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const joined = wallet.state.tourney?.round === round;
  const myNet = joined ? wallet.state.tourney!.net : 0;

  const refresh = useCallback(() => {
    if (!myProfile()) return;
    const t = wallet.state.tourney;
    (t && t.round === round ? reportTourney(round, t.net) : Promise.resolve())
      .catch(() => {})
      .then(() => tourneyBoard(round))
      .then(setRows)
      .catch((e) => setError(friendlyError(e)));
    lastTourneyResult()
      .then(setLast)
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, me]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const join = async () => {
    if (!wallet.spend(TOURNEY_FEE)) return setError('Недостатньо коштів: вхід 200 ₴');
    setBusy(true);
    try {
      await joinTourney();
      wallet.enterTourney(round);
      sfx('bonus');
      wallet.notify('Ти в турнірі! Заробляй більше за всіх до кінця раунду');
      setError(null);
      refresh();
    } catch (e) {
      wallet.credit(TOURNEY_FEE);
      const msg = friendlyError(e);
      if (msg.includes('вже')) wallet.enterTourney(round);
      setError(msg);
    }
    setBusy(false);
  };

  const board = rows.map((r) => (r.id === me?.id ? { ...r, earned: myNet } : r)).sort((a, b) => b.earned - a.earned);
  const place = board.findIndex((r) => r.id === me?.id) + 1;
  const pool = rows.length * TOURNEY_FEE;

  return (
    <>
      <LinearGradient colors={['#F59E0B', '#7C2D12']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroTitle}>Турнір «Шість годин»</Text>
        <Text style={styles.heroPool}>{formatCoins(pool)}</Text>
        <Text style={styles.heroSub}>Вхід {formatCoins(TOURNEY_FEE)}. Хто заробить найбільше (виграші мінус ставки), забирає всі внески.</Text>
        <Text style={styles.heroTimer}>До кінця: {formatDuration((round + 1) * TOURNEY_MS - now)} · гравців: {rows.length}</Text>
      </LinearGradient>
      {error && <Text style={styles.error}>{error}</Text>}
      {joined ? (
        <Panel style={styles.me}>
          <Text style={styles.meText}>Твоє місце: {place ? `#${place}` : '—'}</Text>
          <Text style={[styles.meText, { color: myNet >= 0 ? colors.gold : colors.red }]}>
            Заробив: {myNet >= 0 ? '+' : '−'}
            {formatCoins(Math.abs(myNet))}
          </Text>
          {place === 1 && rows.length > 1 && <Text style={styles.mePrize}>Зараз весь банк {formatCoins(pool)} твій!</Text>}
        </Panel>
      ) : (
        <BigButton label={`ВЗЯТИ УЧАСТЬ · ${formatCoins(TOURNEY_FEE)}`} disabled={busy || !me} onPress={join} />
      )}
      <Panel style={styles.board}>
        <Text style={styles.boardTitle}>Учасники</Text>
        {board.length === 0 && <Text style={styles.note}>Поки нікого. Будь першим!</Text>}
        {board.map((r, i) => (
          <View key={r.id} style={[styles.row, r.id === me?.id && styles.rowMe]}>
            <Text style={styles.place}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`}</Text>
            <Text style={[styles.name, r.id === me?.id && styles.nameMe]}>{r.name}</Text>
            <Text style={styles.points}>
              {r.earned >= 0 ? '+' : '−'}
              {formatCoins(Math.abs(r.earned))}
            </Text>
          </View>
        ))}
      </Panel>
      {last && (
        <Text style={styles.note}>
          Минулий турнір: {last.players} гравців, банк {formatCoins(last.pool)}
          {last.winner === me?.id ? ' — переміг ти! 🏆' : ''}
        </Text>
      )}
      <Text style={styles.note}>Новий турнір кожні 6 годин. Приз приходить автоматично після кінця раунду. Очки оновлюються раз на 30 секунд.</Text>
    </>
  );
}

function Leaders() {
  const { me, error, setError } = useOnline();
  const [top, setTop] = useState<Leader[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  useEffect(() => {
    if (!me) return;
    const load = () =>
      globalLeaderboard()
        .then((r) => (setTop(r.top), setRank(r.myRank)))
        .catch((e) => setError(friendlyError(e)));
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);
  return (
    <>
      {error && <Text style={styles.error}>{error}</Text>}
      <Panel style={styles.me}>
        <Text style={styles.meText}>Твоє місце серед усіх гравців: {rank ? `#${rank}` : '—'}</Text>
      </Panel>
      <Panel style={styles.board}>
        <Text style={styles.boardTitle}>Найбагатші гравці</Text>
        {top.map((r, i) => (
          <View key={r.id} style={[styles.row, r.id === me?.id && styles.rowMe]}>
            <Text style={styles.place}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : `${i + 1}`}</Text>
            <View style={styles.name}>
              <Text style={[styles.leaderName, r.id === me?.id && styles.nameMe]}>{r.name}</Text>
              <Text style={styles.note2}>
                {r.status} · ⭐ {r.level}
              </Text>
            </View>
            <Text style={styles.points}>{formatCoins(Number(r.balance))}</Text>
          </View>
        ))}
      </Panel>
    </>
  );
}

function Weekly() {
  const { state } = useWallet();
  const now = useNow();
  const week = weekId(new Date(now));
  const points = state.tournamentWeek === week ? state.tournamentPoints : 0;
  const rows = leaderboard(week, points, weekProgress(new Date(now)));
  const myPlace = rows.findIndex((r) => r.me) + 1;
  const pool = TOURNAMENT_PRIZES.reduce((a, b) => a + b, 0);

  return (
    <>
      <LinearGradient colors={['#0EA5E9', '#4C1D95']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <Text style={styles.heroTitle}>Тижневий турнір «Зоряний марафон»</Text>
        <Text style={styles.heroPool}>{formatCoins(pool)}</Text>
        <Text style={styles.heroSub}>Очки = монети, виграні в будь-якій грі цього тижня</Text>
        <Text style={styles.heroTimer}>До кінця: {formatDuration(weekEndsAt(new Date(now)) - now)}</Text>
      </LinearGradient>

      <Panel style={styles.me}>
        <Text style={styles.meText}>Твоє місце: {points > 0 ? `#${myPlace}` : '—'}</Text>
        <Text style={styles.meText}>Очки: {formatCoins(points)}</Text>
        {points > 0 && myPlace <= TOURNAMENT_PRIZES.length && (
          <Text style={styles.mePrize}>Зараз ти отримуєш {formatCoins(TOURNAMENT_PRIZES[myPlace - 1])}</Text>
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
    </>
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
  points: { width: 110, textAlign: 'right', color: colors.text, fontWeight: '700' },
  prize: { width: 70, textAlign: 'right', color: colors.green, fontSize: 12 },
  note: { color: colors.muted, fontSize: 11, textAlign: 'center' },
  note2: { color: colors.muted, fontSize: 11 },
  tabs: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  error: { color: colors.red, fontWeight: '700', textAlign: 'center' },
  leaderName: { color: colors.text, fontWeight: '700' },
});
