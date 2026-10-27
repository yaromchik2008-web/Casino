import { useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const PAYOUT = 1.88;

export function CoinGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(50);
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [side, setSide] = useState<'heads' | 'tails'>('heads');
  const [busy, setBusy] = useState(false);
  const [streak, setStreak] = useState(0);
  const [message, setMessage] = useState({ text: 'Орел чи решка?', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const flip = useRef(new Animated.Value(0)).current;

  const play = () => {
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    setBusy(true);
    flip.setValue(0);
    Animated.timing(flip, { toValue: 1, duration: 1100, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
      setSide(result);
      setBusy(false);
      if (result === choice) {
        const won = Math.floor(bet * PAYOUT);
        wallet.win(game.id, won);
        haptic('win');
        setStreak((s) => s + 1);
        setMessage({ text: `${result === 'heads' ? 'Орел' : 'Решка'}! +${formatCoins(won)}`, tone: 'win' });
      } else {
        setStreak(0);
        setMessage({ text: `${result === 'heads' ? 'Орел' : 'Решка'}. Не вгадав`, tone: 'lose' });
      }
    });
  };

  const scaleX = flip.interpolate({
    inputRange: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1],
    outputRange: [1, 0.05, 1, 0.05, 1, 0.05, 1, 0.05, 1],
  });
  const translateY = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -60, 0] });

  return (
    <View style={styles.root}>
      <View style={styles.stage}>
        <Animated.View style={[styles.coin, { transform: [{ translateY }, { scaleX }] }]}>
          <Text style={styles.coinText}>{side === 'heads' ? '🦅' : '🔱'}</Text>
        </Animated.View>
        <Text style={styles.streak}>Серія перемог: {streak}</Text>
      </View>
      <View style={styles.row}>
        <Chip label="🦅 Орел" active={choice === 'heads'} onPress={() => setChoice('heads')} disabled={busy} />
        <Chip label="🔱 Решка" active={choice === 'tails'} onPress={() => setChoice('tails')} disabled={busy} />
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      <BetSelector value={bet} onChange={setBet} disabled={busy} />
      <BigButton label={busy ? '...' : `ПІДКИНУТИ ×${PAYOUT}`} onPress={play} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  stage: { height: 220, width: '100%', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 10, gap: 12 },
  coin: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: colors.gold,
    borderWidth: 6,
    borderColor: '#B45309',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinText: { fontSize: 60 },
  streak: { color: colors.muted, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10 },
});
