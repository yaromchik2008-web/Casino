import { useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Ctx, GameCanvas, WEB, drawEmoji } from '../components/canvasKit';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const PAYOUT = 1.88;
const FLIP_MS = 1100;

export function CoinGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(100);
  const [choice, setChoice] = useState<'heads' | 'tails'>('heads');
  const [side, setSide] = useState<'heads' | 'tails'>('heads');
  const [busy, setBusy] = useState(false);
  const [streak, setStreak] = useState(0);
  const [message, setMessage] = useState({ text: 'Орел чи решка?', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const flip = useRef(new Animated.Value(0)).current;
  const coin = useRef({ start: 0, from: 'heads' as 'heads' | 'tails', to: 'heads' as 'heads' | 'tails' });
  const [stageW, setStageW] = useState(340);

  const play = () => {
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    setBusy(true);
    flip.setValue(0);
    if (WEB) coin.current = { start: performance.now(), from: side, to: result };
    const animate = WEB
      ? (cb: () => void) => setTimeout(cb, FLIP_MS)
      : (cb: () => void) => Animated.timing(flip, { toValue: 1, duration: FLIP_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(cb);
    animate(() => {
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
      <View style={styles.stage} onLayout={(e: LayoutChangeEvent) => setStageW(Math.floor(e.nativeEvent.layout.width))}>
        {WEB ? (
          <GameCanvas width={stageW} height={180} draw={(ctx, now) => drawCoin(ctx, now, stageW, 180, coin.current, side)} />
        ) : (
        <Animated.View style={[styles.coin, { transform: [{ translateY }, { scaleX }] }]}>
          <Text style={styles.coinText}>{side === 'heads' ? '🦅' : '🔱'}</Text>
        </Animated.View>
        )}
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

/** Монета летить угору й обертається; сторону видно за знаком «ширини» (cos кута). */
function drawCoin(ctx: Ctx, now: number, W: number, H: number, c: { start: number; from: string; to: string }, side: string) {
  const t = c.start ? Math.min(1, (now - c.start) / FLIP_MS) : 1;
  const e = 1 - (1 - t) ** 2;
  // 4 повних оберти; якщо сторона змінюється, ще пів оберту.
  const turns = 4 + (c.from !== c.to ? 0.5 : 0);
  const ang = e * turns * Math.PI * 2;
  const k = Math.cos(ang);
  const face = t >= 1 ? side : (k >= 0 ? c.from : c.from === 'heads' ? 'tails' : 'heads');
  const R = 62;
  const lift = Math.sin(t * Math.PI) * 70;
  const cx = W / 2;
  const cy = H - R - 10 - lift;
  ctx.clearRect(0, 0, W, H);
  // Тінь на «підлозі» зменшується, коли монета високо.
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, H - 8, R * (1 - lift / 160), 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(Math.max(0.04, Math.abs(k)), 1);
  ctx.fillStyle = '#B45309';
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, 4, 0, 0, R - 6);
  g.addColorStop(0, '#FFF1A6');
  g.addColorStop(1, '#F2B705');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R - 6, 0, Math.PI * 2);
  ctx.fill();
  drawEmoji(ctx, face === 'heads' ? '🦅' : '🔱', 0, 0, 58);
  ctx.restore();
  return t < 1;
}
