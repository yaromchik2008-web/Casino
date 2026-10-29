import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { sfx } from '../audio/sound';
import { RingSegment, RingWheel, RingWheelHandle } from '../components/RingWheel';
import { BetSelector, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

type Color = 'red' | 'black' | 'green';
// 30 секторів: 14 червоних, 14 чорних, 2 зелені. Виплати ×2 і ×14 (RTP ≈ 93%).
const SECTORS: Color[] = Array.from({ length: 30 }, (_, i) => (i % 15 === 0 ? 'green' : i % 2 ? 'red' : 'black'));
export const COLOR_PAYS: Record<Color, number> = { red: 2, black: 2, green: 14 };
const INFO: Record<Color, { label: string; bg: string }> = {
  red: { label: 'Червоне', bg: '#E11D48' },
  black: { label: 'Чорне', bg: '#1F2937' },
  green: { label: 'Зелене', bg: '#16A34A' },
};
const SEGMENTS: RingSegment[] = SECTORS.map((c) => ({ color: INFO[c].bg }));
const BET_SECONDS = 10;

type Phase = 'bets' | 'spin' | 'result';

export function ColorWheelGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const { width } = useWindowDimensions();
  const [bet, setBet] = useState(1000);
  const [phase, setPhase] = useState<Phase>('bets');
  const [left, setLeft] = useState(BET_SECONDS);
  const [stakes, setStakes] = useState<Record<Color, number>>({ red: 0, black: 0, green: 0 });
  const [result, setResult] = useState<Color | null>(null);
  const [history, setHistory] = useState<Color[]>([]);
  const [message, setMessage] = useState({ text: 'Роби ставки, поки йде відлік', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const wheel = useRef<RingWheelHandle>(null);
  const stakesRef = useRef(stakes);
  stakesRef.current = stakes;
  const size = Math.min(320, width - 48);
  // Кінець відліку для кільця в центрі колеса.
  const [endAt, setEndAt] = useState(() => Date.now() + BET_SECONDS * 1000);
  useEffect(() => {
    if (phase === 'bets') setEndAt(Date.now() + left * 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  const countColor = left > 6 ? '#4ADE80' : left > 3 ? '#FACC15' : '#F87171';

  // Раунд: 10 секунд ставок, оберт, результат, і знову.
  useEffect(() => {
    if (phase !== 'bets') return;
    const t = setInterval(() => setLeft((l) => Math.max(0, l - 1)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  useEffect(() => {
    if (phase === 'bets' && left === 0) spin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, left]);

  const spin = () => {
    setPhase('spin');
    const idx = Math.floor(Math.random() * SECTORS.length);
    const color = SECTORS[idx];
    sfx('spin', 0.5);
    setMessage({ text: 'Крутиться...', tone: 'neutral' });
    wheel.current?.spin(idx, () => {
      const placed = stakesRef.current;
      const won = placed[color] * COLOR_PAYS[color];
      const total = placed.red + placed.black + placed.green;
      setResult(color);
      setHistory((h) => [color, ...h].slice(0, 14));
      if (won > 0) {
        wallet.win(game.id, won);
        sfx(color === 'green' ? 'bigwin' : 'win');
        haptic('win');
        setMessage({ text: `${INFO[color].label}! +${formatCoins(won)}`, tone: 'win' });
      } else if (total > 0) {
        sfx('lose', 0.6);
        setMessage({ text: `Випало ${INFO[color].label.toLowerCase()}`, tone: 'lose' });
      } else setMessage({ text: `Випало ${INFO[color].label.toLowerCase()}. Став у наступному раунді!`, tone: 'neutral' });
      setPhase('result');
      setTimeout(() => {
        setStakes({ red: 0, black: 0, green: 0 });
        setResult(null);
        setLeft(BET_SECONDS);
        setMessage({ text: 'Роби ставки, поки йде відлік', tone: 'neutral' });
        setPhase('bets');
      }, 2600);
    });
  };

  const place = (c: Color) => {
    if (phase !== 'bets') return;
    if (!wallet.bet(game.id, 'fast', bet)) return setMessage({ text: 'Недостатньо коштів', tone: 'lose' });
    sfx('coin', 0.5);
    haptic();
    setStakes((s) => ({ ...s, [c]: s[c] + bet }));
  };

  return (
    <View style={styles.root}>
      <RingWheel
        ref={wheel}
        segments={SEGMENTS}
        size={size}
        thickness={size * 0.17}
        countdown={phase === 'bets' ? { end: endAt, total: BET_SECONDS * 1000 } : null}
      >
        {phase === 'bets' ? (
          <>
            <Text style={[styles.count, { color: countColor, textShadowColor: countColor }]}>{left}</Text>
            <Text style={styles.countLabel}>ставки</Text>
          </>
        ) : result ? (
          <View style={[styles.resultDot, { backgroundColor: INFO[result].bg }]}>
            <Text style={styles.resultText}>×{COLOR_PAYS[result]}</Text>
            <Text style={styles.resultSub}>{INFO[result].label.toUpperCase()}</Text>
          </View>
        ) : (
          <Text style={styles.countLabel}>оберт…</Text>
        )}
      </RingWheel>
      <View style={styles.timeBar}>
        <View style={[styles.timeFill, { width: `${phase === 'bets' ? (left / BET_SECONDS) * 100 : 0}%` }]} />
      </View>
      <View style={styles.history}>
        {history.map((c, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: INFO[c].bg }]} />
        ))}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      <View style={styles.choices}>
        {(['red', 'green', 'black'] as Color[]).map((c) => (
          <Pressable
            key={c}
            onPress={() => place(c)}
            disabled={phase !== 'bets'}
            style={[styles.choice, { backgroundColor: INFO[c].bg }, phase !== 'bets' && styles.choiceOff, result === c && styles.choiceWin]}
          >
            <Text style={styles.choiceMult}>×{COLOR_PAYS[c]}</Text>
            <Text style={styles.choiceAmount}>{stakes[c] ? formatCoins(stakes[c]) : '+ ставка'}</Text>
          </Pressable>
        ))}
      </View>
      <BetSelector value={bet} onChange={setBet} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  count: { color: '#FFFFFF', fontSize: 64, fontWeight: '900', textShadowRadius: 14 },
  countLabel: { color: colors.muted, fontWeight: '800' },
  resultDot: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  resultText: { color: '#FFFFFF', fontWeight: '900', fontSize: 30 },
  resultSub: { color: '#FFFFFFCC', fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  timeBar: { width: '100%', maxWidth: 360, height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  timeFill: { height: '100%', backgroundColor: '#A3E635' },
  history: { flexDirection: 'row', gap: 4, minHeight: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: '#374151' },
  choices: { flexDirection: 'row', gap: 8, width: '100%', maxWidth: 420 },
  choice: { flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', borderWidth: 2, borderColor: 'transparent' },
  choiceOff: { opacity: 0.6 },
  choiceWin: { borderColor: colors.gold, opacity: 1 },
  choiceMult: { color: '#FFFFFFCC', fontWeight: '800', fontSize: 12 },
  choiceAmount: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 },
});
