import { useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Ctx, GameCanvas, WEB, drawEmoji, label } from '../components/canvasKit';
import { BetSelector, BigButton, Chip, Label, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const AUTO_OPTIONS = [0, 1.5, 2, 3, 5, 10];
const GROWTH = 0.16; // множник = e^(0.16·t)
const SKY_H = 240;

function crashPoint() {
  const u = Math.random();
  return Math.max(1, Math.floor((0.94 / (1 - u)) * 100) / 100);
}

export function CrashGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(100);
  const [autoCash, setAutoCash] = useState(2);
  const [multiplier, setMultiplier] = useState(1);
  const [running, setRunning] = useState(false);
  const [crashed, setCrashed] = useState(false);
  const [cashedAt, setCashedAt] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [message, setMessage] = useState({ text: 'Зроби ставку і запускай ракету', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const round = useRef({ crashAt: 1, start: 0, cashed: false, bet: 0, cashAt: 0, endAt: 0 });
  const [skyW, setSkyW] = useState(340);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const cashOut = (at: number) => {
    const r = round.current;
    if (r.cashed) return;
    r.cashed = true;
    r.cashAt = at;
    const won = Math.floor(r.bet * at);
    wallet.win(game.id, won);
    haptic('win');
    setCashedAt(at);
    setMessage({ text: `Забрав на ×${at.toFixed(2)}: +${formatCoins(won)}`, tone: 'win' });
  };

  const launch = () => {
    if (running) return;
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    round.current = { crashAt: crashPoint(), start: Date.now(), cashed: false, bet, cashAt: 0, endAt: 0 };
    setRunning(true);
    setCrashed(false);
    setCashedAt(null);
    setMultiplier(1);
    setMessage({ text: 'Летимо!', tone: 'neutral' });
    timer.current = setInterval(() => {
      const r = round.current;
      const t = (Date.now() - r.start) / 1000;
      const m = Math.floor(Math.exp(GROWTH * t) * 100) / 100;
      if (m >= r.crashAt) {
        clearInterval(timer.current!);
        r.endAt = Date.now();
        setMultiplier(r.crashAt);
        setCrashed(true);
        setRunning(false);
        setHistory((h) => [r.crashAt, ...h].slice(0, 10));
        if (!r.cashed) {
          haptic('lose');
          setMessage({ text: `Вибух на ×${r.crashAt.toFixed(2)}`, tone: 'lose' });
        }
        return;
      }
      setMultiplier(m);
      if (autoCash > 0 && m >= autoCash) cashOut(autoCash);
    }, WEB ? 100 : 50);
  };

  const height = Math.min(1, Math.log(multiplier) / Math.log(10));

  return (
    <View style={styles.root}>
      <View style={styles.history}>
        {history.map((h, i) => (
          <Text key={i} style={[styles.histItem, { color: h >= 2 ? colors.green : colors.red }]}>
            ×{h.toFixed(2)}
          </Text>
        ))}
      </View>
      {WEB ? (
        <View style={[styles.sky, styles.skyCanvas]} onLayout={(e: LayoutChangeEvent) => setSkyW(Math.floor(e.nativeEvent.layout.width) - 4)}>
          <GameCanvas width={skyW} height={SKY_H - 4} draw={(ctx, now) => drawCrash(ctx, now, skyW, SKY_H - 4, round.current, running)} />
        </View>
      ) : (
      <View style={styles.sky}>
        <Text style={[styles.rocket, { bottom: 10 + height * 170, left: 20 + height * 200 }]}>
          {crashed ? '💥' : '🚀'}
        </Text>
        <Text style={[styles.multiplier, crashed && { color: colors.red }, cashedAt !== null && { color: colors.green }]}>
          ×{multiplier.toFixed(2)}
        </Text>
      </View>
      )}
      <ResultLine text={message.text} tone={message.tone} />
      {running ? (
        <BigButton
          label={round.current.cashed ? 'ЗАБРАНО' : `ЗАБРАТИ ${formatCoins(bet * multiplier)}`}
          onPress={() => cashOut(multiplier)}
          disabled={round.current.cashed}
          color="#F59E0B"
        />
      ) : (
        <>
          <BetSelector value={bet} onChange={setBet} />
          <Label>Автовиведення</Label>
          <View style={styles.autoRow}>
            {AUTO_OPTIONS.map((a) => (
              <Chip key={a} label={a === 0 ? 'Вимк' : `×${a}`} active={autoCash === a} onPress={() => setAutoCash(a)} />
            ))}
          </View>
          <BigButton label="ЗАПУСК" onPress={launch} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  history: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', minHeight: 18 },
  histItem: { fontSize: 12, fontWeight: '800' },
  sky: {
    width: '100%',
    height: 240,
    borderRadius: 20,
    backgroundColor: '#0B0B2B',
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rocket: { position: 'absolute', fontSize: 40 },
  skyCanvas: { alignItems: 'stretch', justifyContent: 'flex-start' },
  multiplier: { color: '#FFFFFF', fontSize: 56, fontWeight: '900' },
  autoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
});

const STARS = Array.from({ length: 28 }, (_, i) => [((i * 97) % 100) / 100, ((i * 57) % 100) / 100, 1 + (i % 3)] as const);

/** Графік польоту: зірки летять назустріч, крива множника з заливкою, ракета на кінчику, вибух. */
function drawCrash(
  ctx: Ctx,
  now: number,
  W: number,
  H: number,
  r: { crashAt: number; start: number; cashed: boolean; cashAt: number; endAt: number },
  running: boolean,
) {
  const flying = running && !r.endAt;
  const t = r.start ? ((r.endAt || Date.now()) - r.start) / 1000 : 0;
  const m = r.start ? Math.min(r.crashAt, Math.exp(GROWTH * t)) : 1;
  ctx.fillStyle = '#0B0B2B';
  ctx.fillRect(0, 0, W, H);
  // Зірки зміщуються, поки ракета летить.
  const drift = (Date.now() / 1000) * (flying ? 40 : 6);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const [sx, sy, sz] of STARS) {
    const x = (((sx * W - drift * sz * 0.6) % W) + W) % W;
    const y = (sy * H + drift * sz * 0.3) % H;
    ctx.fillRect(x, y, sz, sz);
  }
  // Сітка й підписи осі множника.
  const pad = 26;
  const tMax = Math.max(8, t * 1.15);
  const mMax = Math.max(2, m * 1.25);
  const X = (tt: number) => pad + ((W - pad - 10) * tt) / tMax;
  const Y = (mm: number) => H - pad - ((H - pad - 16) * (mm - 1)) / (mMax - 1);
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  ctx.font = '700 10px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const stepM = mMax > 20 ? 10 : mMax > 6 ? 2 : mMax > 3 ? 1 : 0.5;
  for (let mm = 1; mm <= mMax; mm += stepM) {
    const y = Y(mm);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.fillText(`${+mm.toFixed(1)}×`, pad - 3, y);
  }
  if (r.start) {
    const crashed = !!r.endAt && !r.cashed ? true : !!r.endAt;
    const col = r.cashed ? '#22C55E' : crashed ? '#EF4444' : '#FFD54A';
    const n = 60;
    ctx.beginPath();
    ctx.moveTo(X(0), Y(1));
    for (let k = 1; k <= n; k++) {
      const tt = (t * k) / n;
      ctx.lineTo(X(tt), Y(Math.exp(GROWTH * tt)));
    }
    ctx.lineTo(X(t), H - pad);
    ctx.lineTo(X(0), H - pad);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, col + '66');
    g.addColorStop(1, col + '05');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.beginPath();
    for (let k = 0; k <= n; k++) {
      const tt = (t * k) / n;
      if (k === 0) ctx.moveTo(X(tt), Y(Math.exp(GROWTH * tt)));
      else ctx.lineTo(X(tt), Y(Math.exp(GROWTH * tt)));
    }
    ctx.strokeStyle = col;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.stroke();
    // Ракета на кінці кривої, нахилена по дотичній.
    const tx = X(t);
    const ty = Y(m);
    if (r.endAt && !r.cashed) {
      const age = (Date.now() - r.endAt) / 1000;
      const rad = 10 + age * 120;
      ctx.globalAlpha = Math.max(0, 1 - age * 1.4);
      const bg = ctx.createRadialGradient(tx, ty, 0, tx, ty, rad);
      bg.addColorStop(0, 'rgba(255,230,160,1)');
      bg.addColorStop(0.5, 'rgba(255,120,40,0.8)');
      bg.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(tx, ty, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      drawEmoji(ctx, '💥', tx, ty, 34);
    } else {
      const dt = 0.05;
      const ang = Math.atan2(Y(Math.exp(GROWTH * t)) - Y(Math.exp(GROWTH * (t - dt))), X(t) - X(t - dt));
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(ang + Math.PI / 4);
      drawEmoji(ctx, '🚀', 0, 0, 34);
      ctx.restore();
    }
    const big = r.endAt && !r.cashed ? '#EF4444' : r.cashed ? '#22C55E' : '#FFFFFF';
    label(ctx, `×${m.toFixed(2)}`, W / 2, H / 2 - 10, 52, big, 900, 'rgba(0,0,0,0.4)');
    if (r.cashed) label(ctx, `Забрано на ×${r.cashAt.toFixed(2)}`, W / 2, H / 2 + 30, 14, '#22C55E', 800);
    else if (r.endAt) label(ctx, 'ВИБУХ', W / 2, H / 2 + 30, 14, '#EF4444', 900);
    // Після вибуху ще трохи малюємо, щоб догорів спалах.
    return flying || (!!r.endAt && Date.now() - r.endAt < 900) || running;
  }
  label(ctx, '×1.00', W / 2, H / 2 - 10, 52, '#FFFFFF', 900, 'rgba(0,0,0,0.4)');
  return false;
}
