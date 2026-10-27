import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

interface OutsideBet {
  id: string;
  label: string;
  payout: number;
  test: (n: number) => boolean;
}

const OUTSIDE: OutsideBet[] = [
  { id: 'red', label: 'Червоне', payout: 2, test: (n) => RED.has(n) },
  { id: 'black', label: 'Чорне', payout: 2, test: (n) => n > 0 && !RED.has(n) },
  { id: 'even', label: 'Парне', payout: 2, test: (n) => n > 0 && n % 2 === 0 },
  { id: 'odd', label: 'Непарне', payout: 2, test: (n) => n % 2 === 1 },
  { id: 'low', label: '1–18', payout: 2, test: (n) => n >= 1 && n <= 18 },
  { id: 'high', label: '19–36', payout: 2, test: (n) => n >= 19 },
  { id: 'd1', label: '1–12', payout: 3, test: (n) => n >= 1 && n <= 12 },
  { id: 'd2', label: '13–24', payout: 3, test: (n) => n >= 13 && n <= 24 },
  { id: 'd3', label: '25–36', payout: 3, test: (n) => n >= 25 },
];

function numberColor(n: number) {
  if (n === 0) return '#16A34A';
  return RED.has(n) ? '#DC2626' : '#1F2937';
}

function payoutFor(key: string, n: number): number {
  if (key.startsWith('n')) return Number(key.slice(1)) === n ? 36 : 0;
  const bet = OUTSIDE.find((o) => o.id === key);
  return bet && bet.test(n) ? bet.payout : 0;
}

export function RouletteGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [chip, setChip] = useState(25);
  const [bets, setBets] = useState<Record<string, number>>({});
  const [spinning, setSpinning] = useState(false);
  const [shown, setShown] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [message, setMessage] = useState({ text: 'Розстав фішки і крути', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const total = Object.values(bets).reduce((a, b) => a + b, 0);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const place = (key: string) => {
    if (spinning) return;
    if (total + chip > wallet.state.balance) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    haptic();
    setBets((b) => ({ ...b, [key]: (b[key] ?? 0) + chip }));
  };

  const spin = () => {
    if (spinning || total === 0) return;
    if (!wallet.bet(game.id, 'table', total)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const result = Math.floor(Math.random() * 37);
    setSpinning(true);
    setMessage({ text: 'Ставок більше немає...', tone: 'neutral' });
    let ticks = 0;
    timer.current = setInterval(() => {
      ticks++;
      setShown(Math.floor(Math.random() * 37));
      if (ticks >= 25) {
        clearInterval(timer.current!);
        setShown(result);
        setHistory((h) => [result, ...h].slice(0, 12));
        const won = Object.entries(bets).reduce((sum, [key, amount]) => sum + amount * payoutFor(key, result), 0);
        if (won > 0) {
          wallet.win(game.id, won);
          haptic('win');
          setMessage({ text: `Випало ${result}. Виграш +${formatCoins(won)}`, tone: 'win' });
        } else {
          setMessage({ text: `Випало ${result}. Не цього разу`, tone: 'lose' });
        }
        setSpinning(false);
      }
    }, 80);
  };

  const numbers = Array.from({ length: 36 }, (_, i) => i + 1);

  return (
    <View style={styles.root}>
      <View style={styles.wheel}>
        <View style={[styles.ball, { backgroundColor: shown === null ? colors.surfaceAlt : numberColor(shown) }]}>
          <Text style={styles.ballText}>{shown ?? '?'}</Text>
        </View>
        <View style={styles.history}>
          {history.map((n, i) => (
            <View key={i} style={[styles.histDot, { backgroundColor: numberColor(n) }]}>
              <Text style={styles.histText}>{n}</Text>
            </View>
          ))}
        </View>
      </View>
      <ResultLine text={message.text} tone={message.tone} />

      <Pressable onPress={() => place('n0')} style={[styles.zero, { backgroundColor: numberColor(0) }]}>
        <Text style={styles.numText}>0</Text>
        {bets.n0 ? <Text style={styles.chipMark}>{bets.n0}</Text> : null}
      </Pressable>
      <View style={styles.grid}>
        {numbers.map((n) => (
          <Pressable key={n} onPress={() => place(`n${n}`)} style={[styles.num, { backgroundColor: numberColor(n) }]}>
            <Text style={styles.numText}>{n}</Text>
            {bets[`n${n}`] ? <Text style={styles.chipMark}>{bets[`n${n}`]}</Text> : null}
          </Pressable>
        ))}
      </View>
      <View style={styles.outside}>
        {OUTSIDE.map((o) => (
          <Pressable key={o.id} onPress={() => place(o.id)} style={styles.outsideCell}>
            <Text style={styles.outsideText}>{o.label}</Text>
            <Text style={styles.outsidePay}>×{o.payout}</Text>
            {bets[o.id] ? <Text style={styles.chipMark}>{bets[o.id]}</Text> : null}
          </Pressable>
        ))}
      </View>

      <Text style={styles.total}>Фішка: {chip} · Усього на столі: {formatCoins(total)}</Text>
      <BetSelector value={chip} onChange={setChip} disabled={spinning} />
      <View style={styles.row}>
        <Chip label="Очистити" onPress={() => setBets({})} disabled={spinning || total === 0} />
      </View>
      <BigButton label={spinning ? '...' : 'КРУТИТИ'} onPress={spin} disabled={spinning || total === 0} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  wheel: { alignItems: 'center', gap: 10 },
  ball: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 6,
    borderColor: colors.gold,
  },
  ballText: { color: '#FFFFFF', fontSize: 44, fontWeight: '900' },
  history: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', minHeight: 24 },
  histDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  histText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  zero: { width: '100%', height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  num: { width: '15.2%', aspectRatio: 1.2, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  numText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  chipMark: {
    position: 'absolute',
    top: 2,
    right: 2,
    backgroundColor: colors.gold,
    color: colors.bg,
    fontSize: 9,
    fontWeight: '900',
    paddingHorizontal: 3,
    borderRadius: 6,
    overflow: 'hidden',
  },
  outside: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  outsideCell: {
    width: '31.5%',
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#14532D',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#22C55E55',
  },
  outsideText: { color: '#FFFFFF', fontWeight: '700' },
  outsidePay: { color: colors.gold, fontSize: 11 },
  total: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', gap: 10 },
});
