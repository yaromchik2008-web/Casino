import { useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { StripItem, StripSpinner, StripSpinnerHandle } from '../components/StripSpinner';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

type Color = 'red' | 'black' | 'green';
// 15 секторів: 7 червоних, 7 чорних, 1 зелений. Виплати ×2 і ×14 (RTP ≈ 93%).
const SECTORS: Color[] = ['green', ...Array.from({ length: 14 }, (_, i) => (i % 2 ? 'black' : 'red') as Color)];
export const COLOR_PAYS: Record<Color, number> = { red: 2, black: 2, green: 14 };
const INFO: Record<Color, { label: string; bg: string }> = {
  red: { label: 'Червоне', bg: '#DC2626' },
  black: { label: 'Чорне', bg: '#111827' },
  green: { label: 'Зелене', bg: '#16A34A' },
};
const ITEMS: StripItem[] = SECTORS.map((c) => ({ label: c === 'green' ? '★' : '', color: INFO[c].bg }));

export function ColorWheelGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(100);
  const [choice, setChoice] = useState<Color>('red');
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Color[]>([]);
  const [message, setMessage] = useState({ text: 'Обери колір і крути', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const spinner = useRef<StripSpinnerHandle>(null);

  const spin = () => {
    if (busy) return;
    if (!wallet.bet(game.id, 'fast', bet)) return setMessage({ text: 'Недостатньо коштів', tone: 'lose' });
    const idx = Math.floor(Math.random() * SECTORS.length);
    const result = SECTORS[idx];
    setBusy(true);
    sfx('spin', 0.5);
    setMessage({ text: 'Крутиться...', tone: 'neutral' });
    spinner.current?.spin(idx, () => {
      setBusy(false);
      setHistory((h) => [result, ...h].slice(0, 12));
      if (result === choice) {
        const won = bet * COLOR_PAYS[result];
        wallet.win(game.id, won);
        sfx(result === 'green' ? 'bigwin' : 'win');
        haptic('win');
        setMessage({ text: `${INFO[result].label}! +${formatCoins(won)}`, tone: 'win' });
      } else {
        sfx('lose', 0.6);
        setMessage({ text: `Випало ${INFO[result].label.toLowerCase()}`, tone: 'lose' });
      }
    });
  };

  return (
    <View style={styles.root}>
      <StripSpinner ref={spinner} items={ITEMS} />
      <View style={styles.history}>
        {history.map((c, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: INFO[c].bg }]} />
        ))}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      <View style={styles.choices}>
        {(['red', 'black', 'green'] as Color[]).map((c) => (
          <Chip
            key={c}
            label={`${INFO[c].label} ×${COLOR_PAYS[c]}`}
            active={choice === c}
            disabled={busy}
            onPress={() => setChoice(c)}
            style={{ backgroundColor: INFO[c].bg, borderColor: choice === c ? colors.gold : INFO[c].bg, borderWidth: 2 }}
          />
        ))}
      </View>
      <BetSelector value={bet} onChange={setBet} disabled={busy} />
      <BigButton label={busy ? '...' : `КРУТИТИ НА ${INFO[choice].label.toUpperCase()}`} onPress={spin} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  history: { flexDirection: 'row', gap: 4, minHeight: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#374151' },
  choices: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
});
