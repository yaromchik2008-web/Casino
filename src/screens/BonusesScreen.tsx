import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LevelBar } from '../components/LevelBar';
import { StripItem, StripSpinner, StripSpinnerHandle } from '../components/StripSpinner';
import { BigButton, Panel, haptic } from '../components/ui';
import { formatDuration, useNow } from '../components/useNow';
import { MISSIONS, dayId } from '../state/progress';
import {
  DAILY_REWARDS,
  HOURLY_BONUS,
  HOURLY_COOLDOWN_MS,
  WHEEL_COOLDOWN_MS,
  useWallet,
} from '../state/WalletContext';
import { colors, formatCoins, formatShort } from '../theme';

const WHEEL_PRIZES = [
  { amount: 200, weight: 30, color: '#2563EB' },
  { amount: 500, weight: 28, color: '#0D9488' },
  { amount: 1000, weight: 20, color: '#16A34A' },
  { amount: 2000, weight: 12, color: '#CA8A04' },
  { amount: 5000, weight: 7, color: '#EA580C' },
  { amount: 10000, weight: 2.5, color: '#DC2626' },
  { amount: 25000, weight: 0.5, color: '#9333EA' },
];
const WHEEL_ITEMS: StripItem[] = WHEEL_PRIZES.map((p) => ({ label: `${formatShort(p.amount)}₴`, color: p.color }));

function pickPrize() {
  const total = WHEEL_PRIZES.reduce((a, p) => a + p.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < WHEEL_PRIZES.length; i++) {
    r -= WHEEL_PRIZES[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

export function BonusesScreen({ onOpenTournaments }: { onOpenTournaments: () => void }) {
  const wallet = useWallet();
  const s = wallet.state;
  const now = useNow();
  const spinner = useRef<StripSpinnerHandle>(null);
  const [wheelBusy, setWheelBusy] = useState(false);

  const today = dayId();
  const dailyClaimed = s.lastDailyDay === today;
  const yesterday = dayId(new Date(now - 24 * 3600 * 1000));
  const streakAlive = s.lastDailyDay === yesterday || dailyClaimed;
  const currentStreak = streakAlive ? s.dailyStreak : 0;
  const nextDayIndex = dailyClaimed ? (currentStreak - 1) % 7 : currentStreak % 7;

  const hourlyLeft = Math.max(0, s.lastHourlyAt + HOURLY_COOLDOWN_MS - now);
  const hourlyReady = hourlyLeft === 0 || s.balance < 10;
  const wheelLeft = Math.max(0, s.lastWheelAt + WHEEL_COOLDOWN_MS - now);
  const cashback = Math.floor(s.lossSinceCashback * 0.1);
  const cashbackReady = cashback > 0 && s.lastCashbackDay !== today;

  const spinWheel = () => {
    if (wheelBusy || wheelLeft > 0) return;
    const idx = pickPrize();
    setWheelBusy(true);
    spinner.current?.spin(idx, () => {
      setWheelBusy(false);
      wallet.claimWheel(WHEEL_PRIZES[idx].amount);
      haptic('win');
      wallet.notify(`Колесо фортуни: +${formatCoins(WHEEL_PRIZES[idx].amount)}`);
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>🎁 Бонуси</Text>

      <BigButton label="🏆 ТИЖНЕВИЙ ТУРНІР" color={colors.blue} onPress={onOpenTournaments} />

      <Panel style={styles.panel}>
        <LevelBar xp={s.xp} level={s.level} />
      </Panel>

      <Panel style={styles.panel}>
        <Text style={styles.cardTitle}>📅 Щоденний бонус</Text>
        <Text style={styles.cardSub}>Заходь кожен день поспіль, щоб нагорода росла. Серія: {currentStreak} дн.</Text>
        <View style={styles.days}>
          {DAILY_REWARDS.map((r, i) => {
            const done = dailyClaimed ? i <= nextDayIndex : i < nextDayIndex;
            const isNext = !dailyClaimed && i === nextDayIndex;
            return (
              <View key={i} style={[styles.day, done && styles.dayDone, isNext && styles.dayNext]}>
                <Text style={styles.dayLabel}>День {i + 1}</Text>
                <Text style={styles.dayValue}>{formatShort(r)}₴</Text>
                <Text style={styles.dayIcon}>{done ? '✅' : i === 6 ? '👑' : '🪙'}</Text>
              </View>
            );
          })}
        </View>
        <BigButton
          label={dailyClaimed ? 'ЗАБРАНО СЬОГОДНІ' : `ЗАБРАТИ ${formatCoins(DAILY_REWARDS[nextDayIndex])}`}
          disabled={dailyClaimed}
          onPress={() => {
            const r = wallet.claimDaily();
            if (r) {
              haptic('win');
              wallet.notify(`Щоденний бонус +${formatCoins(r)}`);
            }
          }}
        />
      </Panel>

      <Panel style={styles.panel}>
        <Text style={styles.cardTitle}>🎡 Колесо фортуни</Text>
        <Text style={styles.cardSub}>Безкоштовне обертання кожні 4 години. Приз до 250 ₴</Text>
        <StripSpinner ref={spinner} items={WHEEL_ITEMS} />
        <BigButton
          label={wheelBusy ? '...' : wheelLeft > 0 ? `ЧЕРЕЗ ${formatDuration(wheelLeft)}` : 'КРУТИТИ БЕЗКОШТОВНО'}
          disabled={wheelBusy || wheelLeft > 0}
          onPress={spinWheel}
          color={colors.accent}
        />
      </Panel>

      <View style={styles.twoCol}>
        <Panel style={styles.half}>
          <Text style={styles.cardTitle}>⏰ Щогодини</Text>
          <Text style={styles.cardSub}>{formatCoins(HOURLY_BONUS)} кожну годину або одразу, якщо гроші скінчились</Text>
          <BigButton
            label={hourlyReady ? 'ЗАБРАТИ' : formatDuration(hourlyLeft)}
            disabled={!hourlyReady}
            onPress={() => {
              if (wallet.claimHourly()) {
                haptic('win');
                wallet.notify(`+${formatCoins(HOURLY_BONUS)}`);
              }
            }}
            style={styles.smallBtn}
          />
        </Panel>
        <Panel style={styles.half}>
          <Text style={styles.cardTitle}>💸 Кешбек 10%</Text>
          <Text style={styles.cardSub}>Повертаємо 10% програних монет раз на день. Доступно: {formatCoins(cashback)}</Text>
          <BigButton
            label={cashbackReady ? 'ЗАБРАТИ' : s.lastCashbackDay === today ? 'ЗАВТРА' : 'НЕМАЄ'}
            disabled={!cashbackReady}
            onPress={() => {
              const r = wallet.claimCashback();
              if (r) {
                haptic('win');
                wallet.notify(`Кешбек +${formatCoins(r)}`);
              }
            }}
            color={colors.blue}
            style={styles.smallBtn}
          />
        </Panel>
      </View>

      <Panel style={styles.panel}>
        <Text style={styles.cardTitle}>🎯 Завдання дня</Text>
        <Text style={styles.cardSub}>Оновлюються щодня опівночі</Text>
        {MISSIONS.map((m) => {
          const progress = Math.min(m.goal, s.missionProgress[m.id] ?? 0);
          const claimed = s.missionClaimed.includes(m.id);
          const done = progress >= m.goal;
          return (
            <View key={m.id} style={styles.mission}>
              <Text style={styles.missionIcon}>{m.icon}</Text>
              <View style={styles.missionBody}>
                <Text style={styles.missionTitle}>{m.title}</Text>
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${(progress / m.goal) * 100}%` }]} />
                </View>
                <Text style={styles.missionMeta}>
                  {progress}/{m.goal} · нагорода {formatCoins(m.reward)}
                </Text>
              </View>
              <BigButton
                label={claimed ? '✓' : 'ВЗЯТИ'}
                disabled={!done || claimed}
                onPress={() => {
                  const r = wallet.claimMission(m.id);
                  if (r) {
                    haptic('win');
                    wallet.notify(`Завдання виконано: +${formatCoins(r)}`);
                  }
                }}
                style={styles.missionBtn}
              />
            </View>
          );
        })}
      </Panel>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  title: { color: colors.text, fontSize: 26, fontWeight: '900' },
  panel: { gap: 10 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  cardSub: { color: colors.muted, fontSize: 12 },
  days: { flexDirection: 'row', gap: 4 },
  day: {
    flex: 1,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  dayDone: { opacity: 0.55 },
  dayNext: { borderColor: colors.gold },
  dayLabel: { color: colors.muted, fontSize: 9 },
  dayValue: { color: colors.gold, fontWeight: '900', fontSize: 13 },
  dayIcon: { fontSize: 14 },
  twoCol: { flexDirection: 'row', gap: 10 },
  half: { flex: 1, gap: 8, justifyContent: 'space-between' },
  smallBtn: { paddingVertical: 10 },
  mission: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  missionIcon: { fontSize: 26 },
  missionBody: { flex: 1, gap: 4 },
  missionTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  missionMeta: { color: colors.muted, fontSize: 11 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: colors.green },
  missionBtn: { width: 72, paddingVertical: 8 },
});
