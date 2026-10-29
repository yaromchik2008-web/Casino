import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Ctx, FONT, GameCanvas, WEB, roundRect } from '../components/canvasKit';
import { BetSelector, BigButton, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const ROWS = 10;
const BUCKETS = [10, 4, 2, 1.2, 0.7, 0.4, 0.7, 1.2, 2, 4, 10]; // RTP ≈ 0.94
const STEP_MS = 110;
const BOARD_H = 20 + ROWS * 22 + 40;

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

  // Веб: кульки летять на канвасі, кидати можна кілька одночасно.
  const balls = useRef<{ path: number[]; start: number }[]>([]);
  const hits = useRef<{ bucket: number; at: number }[]>([]);
  const [flying, setFlying] = useState(0);
  const BALL_MS = STEP_MS * 1.6;

  const dropWeb = () => {
    if (balls.current.length >= 12) return;
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const path = Array.from({ length: ROWS }, () => (Math.random() < 0.5 ? 0 : 1));
    const b = { path, start: performance.now() };
    balls.current.push(b);
    setFlying((n) => n + 1);
    const stake = bet;
    setTimeout(() => {
      balls.current = balls.current.filter((x) => x !== b);
      const pos = path.reduce<number>((a, v) => a + v, 0);
      hits.current.push({ bucket: pos, at: performance.now() });
      const mult = BUCKETS[pos];
      const won = Math.floor(stake * mult);
      wallet.win(game.id, won);
      if (mult >= 1) haptic('win');
      setLastBucket(pos);
      setFlying((n) => n - 1);
      setMessage({ text: `×${mult}: ${won >= stake ? '+' : ''}${formatCoins(won)}`, tone: mult >= 1 ? 'win' : 'lose' });
    }, ROWS * BALL_MS);
  };

  const drawBoard = (ctx: Ctx, now: number) => {
    const H = BOARD_H;
    ctx.clearRect(0, 0, width, H);
    ctx.fillStyle = '#C4B5FD';
    for (let r = 0; r < ROWS; r++)
      for (let i = 0; i < r + 2; i++) {
        ctx.beginPath();
        ctx.arc(width / 2 + (i - (r + 1) / 2) * gap, 23 + r * rowH, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    // Лунки знизу; та, куди щойно впала кулька, підстрибує.
    const bw = gap - 3;
    const total = BUCKETS.length * bw + (BUCKETS.length - 1) * 3;
    const by = H - 8 - 28;
    hits.current = hits.current.filter((h) => now - h.at < 500);
    BUCKETS.forEach((m, i) => {
      const hit = hits.current.find((h) => h.bucket === i);
      const k = hit ? Math.sin(((now - hit.at) / 500) * Math.PI) : 0;
      const x = width / 2 - total / 2 + i * (bw + 3);
      ctx.fillStyle = bucketColor(m);
      roundRect(ctx, x, by + k * 6, bw, 28, 6);
      ctx.fill();
      if (hit) {
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 10px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(m), x + bw / 2, by + 14 + k * 6);
    });
    for (const b of balls.current) {
      const e = (now - b.start) / BALL_MS;
      const row = Math.min(ROWS, Math.floor(e));
      const f = Math.min(1, e - row);
      let pos = 0;
      for (let k = 0; k < row; k++) pos += b.path[k];
      const x0 = width / 2 + (pos - row / 2) * gap;
      const nextPos = row < ROWS ? pos + b.path[row] : pos;
      const x1 = width / 2 + (nextPos - (row + 1) / 2) * gap;
      const x = row < ROWS ? x0 + (x1 - x0) * f : x0;
      // Кожен відскок від кілочка — маленька дуга.
      const y = 14 + (row + f) * rowH - Math.sin(f * Math.PI) * 9;
      ctx.fillStyle = colors.accent;
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#FFFFFF';
      ctx.stroke();
    }
    return balls.current.length > 0 || hits.current.length > 0;
  };

  const drop = () => {
    if (WEB) return dropWeb();
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
      {WEB ? (
        <View style={styles.board} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width - 4)}>
          <GameCanvas width={width} height={BOARD_H} draw={drawBoard} />
        </View>
      ) : (
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
      )}
      <ResultLine text={message.text} tone={message.tone} />
      <BetSelector value={bet} onChange={setBet} disabled={WEB ? flying > 0 : !!ball} />
      <BigButton label={!WEB && ball ? '...' : WEB && flying > 0 ? `КИНУТИ ЩЕ (${flying} летить)` : 'КИНУТИ'} onPress={drop} disabled={!WEB && !!ball} />
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
