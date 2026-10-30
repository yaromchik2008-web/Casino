import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { LevelBar } from '../components/LevelBar';
import { BigButton, Panel } from '../components/ui';
import { SettingsPanel } from '../components/SettingsPanel';
import { findGame } from '../games/catalog';
import { levelName } from '../state/progress';
import { topCar } from '../state/shop';
import { TIERS } from '../games/plateEngine';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';

export function ProfileScreen({ onOpenGame }: { onOpenGame: (id: string) => void }) {
  const wallet = useWallet();
  const s = wallet.state;
  const [confirmReset, setConfirmReset] = useState(false);
  const top = Object.entries(s.played)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, n]) => ({ game: findGame(id), n }))
    .filter((x) => x.game);

  const stats = [
    { label: 'Баланс (ігрові ₴)', value: `${formatCoins(s.balance)}` },
    { label: 'Ставок зроблено', value: s.bets.toLocaleString('uk-UA') },
    { label: 'Усього поставлено', value: formatCoins(s.totalBet) },
    { label: 'Усього виграно', value: formatCoins(s.totalWon) },
    { label: 'Найбільший виграш', value: `${formatCoins(s.biggestWin)}` },
    { label: 'Серія щоденних входів', value: `${s.dailyStreak} дн.` },
  ];

  // Авто + номер за 96 000 ₴ (за бажанням ghj номер показуємо лише ексклюзивний).
  const car = topCar(s.owned);
  const vip = (s.plates ?? []).find((x) => x.value >= TIERS.exclusive.value);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>🧑‍🚀</Text>
        </View>
        <View>
          <Text style={styles.name}>Гравець</Text>
          <Text style={styles.status}>{levelName(s.level)}</Text>
          {car && vip && (
            <Text style={styles.status}>
              {car.emoji} {car.title} · {vip.id}
            </Text>
          )}
        </View>
      </View>
      <Panel>
        <LevelBar xp={s.xp} level={s.level} />
      </Panel>
      <Panel style={styles.stats}>
        {stats.map((st) => (
          <View key={st.label} style={styles.stat}>
            <Text style={styles.statLabel}>{st.label}</Text>
            <Text style={styles.statValue}>{st.value}</Text>
          </View>
        ))}
      </Panel>
      {top.length > 0 && (
        <Panel style={styles.stats}>
          <Text style={styles.section}>Улюблені за кількістю ігор</Text>
          {top.map(({ game, n }) => (
            <Text key={game!.id} style={styles.topRow} onPress={() => onOpenGame(game!.id)}>
              {game!.emoji} {game!.title} · {n}
            </Text>
          ))}
        </Panel>
      )}
      <SettingsPanel />
      <Panel style={styles.stats}>
        <Text style={styles.section}>Про застосунок</Text>
        <Text style={styles.about}>
          CASINO VICTOR — це безкоштовна гра для розваги. Гривні тут ігрові (₴): їх не можна купити, вивести чи обміняти
          на реальні гроші або призи. Усі результати випадкові. Застосунок призначений для осіб від 18 років. Якщо азартні
          ігри стають проблемою, звернись по допомогу на гарячу лінію підтримки у твоїй країні.
        </Text>
      </Panel>
      <BigButton
        label={confirmReset ? 'ТОЧНО СКИНУТИ? НАТИСНИ ЩЕ РАЗ' : 'Скинути прогрес'}
        color={confirmReset ? colors.red : colors.surfaceAlt}
        onPress={() => {
          if (confirmReset) {
            wallet.reset();
            setConfirmReset(false);
          } else setConfirmReset(true);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: colors.gold,
  },
  avatarText: { fontSize: 38 },
  name: { color: colors.text, fontSize: 22, fontWeight: '900' },
  status: { color: colors.gold, fontWeight: '700' },
  stats: { gap: 8 },
  stat: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { color: colors.muted },
  statValue: { color: colors.text, fontWeight: '800' },
  section: { color: colors.text, fontSize: 16, fontWeight: '800' },
  topRow: { color: colors.text, fontSize: 14, paddingVertical: 2 },
  about: { color: colors.muted, fontSize: 12, lineHeight: 18 },
});
