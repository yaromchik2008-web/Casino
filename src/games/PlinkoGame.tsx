import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { BetSelector, BigButton, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const ROWS = 10;
const BUCKETS = [10, 4, 2, 1.2, 0.7, 0.4, 0.7, 1.2, 2, 4, 10]; // RTP ≈ 0.94
const STEP_MS = 110;

function bucketColor(m: number) {
  if (m >= 10) return '#DC2626';
  if (m >= 5) return '#EA580C';
  if (m >= 2) return '#CA8A04';
  if (m >= 1) return '#16A34A';
  return '#475569';
}

export function PlinkoGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(100);
  const [width, setWidth] = useState(320);
  const [ball, setBall] = useState<{ row: number; pos: number } | null>(null);
  const [lastBucket, setLastBucket] = useState<number | null>(null);
  const [message, setMessage] = useState({ text: 'Кидай кульку!', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const gap = width / (BUCKETS.length + 1);
  const rowH = 22;

  const drop = () => {
    if (ball) return;
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const path = Array.from({ length: ROWS }, () => (Math.random() < 0.5 ? 0 : 1));
    let row = 0;
    let pos = 0;
    setLastBucket(null);
    setBall({ row: 0, pos: 0 });
    timer.current = setInterval(() => {
      pos += path[row];
      row++;
      setBall({ row, pos });
      if (row >= ROWS) {
        clearInterval(timer.current!);
        const mult = BUCKETS[pos];
        const won = Math.floor(bet * mult);
        wallet.win(game.id, won);
        if (mult >= 1) haptic('win');
        setLastBucket(pos);
        setMessage({ text: `×${mult}: ${won >= bet ? '+' : ''}${formatCoins(won)}`, tone: mult >= 1 ? 'win' : 'lose' });
        setTimeout(() => setBall(null), 300);
      }
    }, STEP_MS);
  };

  // Позиція кульки: у рядку r кілочки центровані, кулька зміщується на пів кроку вправо при відскоку.
  const ballX = ball ? width / 2 + (ball.pos - ball.row / 2) * gap : 0;
  const ballY = ball ? 10 + ball.row * rowH : 0;

  return (
    <View style={styles.root}>
      <View style={styles.board} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
        {Array.from({ length: ROWS }, (_, r) =>
          Array.from({ length: r + 2 }, (_, i) => (
            <View
              key={`${r}-${i}`}
              style={[styles.peg, { left: width / 2 + (i - (r + 1) / 2) * gap - 3, top: 20 + r * rowH }]}
            />
          )),
        )}
        {ball && <View style={[styles.ball, { left: ballX - 8, top: ballY + 4 }]} />}
        <View style={styles.buckets}>
          {BUCKETS.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bucket,
                { width: gap - 3, backgroundColor: bucketColor(m) },
                lastBucket === i && styles.bucketHit,
              ]}
            >
              <Text style={styles.bucketText}>{m}</Text>
            </View>
          ))}
        </View>
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      <BetSelector value={bet} onChange={setBet} disabled={!!ball} />
      <BigButton label={ball ? '...' : 'КИНУТИ'} onPress={drop} disabled={!!ball} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  board: {
    width: '100%',
    height: 20 + ROWS * 22 + 44,
    backgroundColor: '#140F35',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
  },
  peg: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#C4B5FD' },
  ball: { position: 'absolute', width: 16, height: 16, borderRadius: 8, backgroundColor: colors.accent, borderWidth: 2, borderColor: '#FFFFFF' },
  buckets: { position: 'absolute', bottom: 8, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 3 },
  bucket: { height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  bucketHit: { transform: [{ scale: 1.2 }], borderWidth: 2, borderColor: '#FFFFFF' },
  bucketText: { color: '#FFFFFF', fontSize: 10, fontWeight: '800' },
});
