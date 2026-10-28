import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StripItem, StripSpinner, StripSpinnerHandle } from '../components/StripSpinner';
import { BetSelector, BigButton, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const SEGMENTS = [
  { mult: 0, weight: 613, color: '#374151' },
  { mult: 1.2, weight: 140, color: '#2563EB' },
  { mult: 1.5, weight: 110, color: '#0D9488' },
  { mult: 2, weight: 80, color: '#16A34A' },
  { mult: 3, weight: 50, color: '#CA8A04' },
  { mult: 5, weight: 25, color: '#EA580C' },
  { mult: 10, weight: 10, color: '#DC2626' },
  { mult: 50, weight: 2, color: '#9333EA' },
];

const ITEMS: StripItem[] = SEGMENTS.map((s) => ({ label: s.mult === 0 ? '✖' : `×${s.mult}`, color: s.color }));

function pick() {
  const total = SEGMENTS.reduce((a, s) => a + s.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SEGMENTS.length; i++) {
    r -= SEGMENTS[i].weight;
    if (r < 0) return i;
  }
  return 0;
}

export function WheelGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(100);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: 'Крути і лови множник до ×50', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const spinner = useRef<StripSpinnerHandle>(null);

  const spin = () => {
    if (busy) return;
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const idx = pick();
    setBusy(true);
    setMessage({ text: 'Крутиться...', tone: 'neutral' });
    spinner.current?.spin(idx, () => {
      setBusy(false);
      const mult = SEGMENTS[idx].mult;
      if (mult > 0) {
        const won = Math.floor(bet * mult);
        wallet.win(game.id, won);
        haptic('win');
        setMessage({ text: `×${mult}! +${formatCoins(won)}`, tone: 'win' });
      } else {
        setMessage({ text: 'Порожньо. Ще раз?', tone: 'lose' });
      }
    });
  };

  return (
    <View style={styles.root}>
      <StripSpinner ref={spinner} items={ITEMS} />
      <ResultLine text={message.text} tone={message.tone} />
      <BetSelector value={bet} onChange={setBet} disabled={busy} />
      <BigButton label={busy ? '...' : 'КРУТИТИ'} onPress={spin} disabled={busy} />
      <View style={styles.legend}>
        {SEGMENTS.filter((s) => s.mult > 0).map((s) => (
          <View key={s.mult} style={[styles.legendItem, { backgroundColor: s.color }]}>
            <Text style={styles.legendText}>×{s.mult}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  legendItem: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  legendText: { color: colors.text, fontWeight: '800', fontSize: 12 },
});
