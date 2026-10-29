import { useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import { Ctx, FONT, GameCanvas, WEB, label, roundRect } from '../components/canvasKit';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

export function DiceGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(100);
  const [target, setTarget] = useState(50);
  const [over, setOver] = useState(true);
  const [roll, setRoll] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const dice = useRef({ start: 0, from: 50, to: 50 });
  const [boxW, setBoxW] = useState(320);
  const [message, setMessage] = useState({ text: 'Обери поріг і кидай', tone: 'neutral' as 'win' | 'lose' | 'neutral' });

  const chance = over ? 99 - target : target;
  const multiplier = Math.floor((94 / chance) * 100) / 100;

  const adjust = (d: number) => setTarget((t) => Math.max(2, Math.min(97, t + d)));

  const play = () => {
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    setRolling(true);
    let ticks = 0;
    const pre = Math.floor(Math.random() * 100);
    if (WEB) dice.current = { start: performance.now(), from: roll ?? 50, to: pre };
    const t = setInterval(() => {
      ticks++;
      if (!WEB) setRoll(Math.floor(Math.random() * 100));
      if (ticks >= 12) {
        clearInterval(t);
        const result = WEB ? pre : Math.floor(Math.random() * 100);
        setRoll(result);
        setRolling(false);
        const won = over ? result > target : result < target;
        if (won) {
          const amount = Math.floor(bet * multiplier);
          wallet.win(game.id, amount);
          haptic('win');
          setMessage({ text: `Випало ${result}! +${formatCoins(amount)}`, tone: 'win' });
        } else {
          setMessage({ text: `Випало ${result}. Мимо`, tone: 'lose' });
        }
      }
    }, 50);
  };

  return (
    <View style={styles.root}>
      {WEB ? (
        <View style={styles.display} onLayout={(e: LayoutChangeEvent) => setBoxW(Math.floor(e.nativeEvent.layout.width) - 36)}>
          <GameCanvas width={boxW} height={120} draw={(ctx, now) => drawDice(ctx, now, boxW, dice.current, roll, target, over)} />
          <Text style={styles.caption}>
            {over ? `Більше за ${target}` : `Менше за ${target}`} · Шанс {chance}% · ×{multiplier}
          </Text>
        </View>
      ) : (
      <View style={styles.display}>
        <Text style={styles.roll}>{roll ?? '--'}</Text>
        <View style={styles.bar}>
          <View
            style={[
              styles.zone,
              over ? { left: `${target + 1}%`, right: 0 } : { left: 0, width: `${target}%` },
            ]}
          />
          {roll !== null && <View style={[styles.marker, { left: `${roll}%` }]} />}
        </View>
        <Text style={styles.caption}>
          {over ? `Більше за ${target}` : `Менше за ${target}`} · Шанс {chance}% · ×{multiplier}
        </Text>
      </View>
      )}
      <View style={styles.row}>
        <Chip label="Більше" active={over} onPress={() => setOver(true)} disabled={rolling} />
        <Chip label="Менше" active={!over} onPress={() => setOver(false)} disabled={rolling} />
      </View>
      <View style={styles.row}>
        {[-10, -1, 1, 10].map((d) => (
          <Chip key={d} label={d > 0 ? `+${d}` : `${d}`} onPress={() => adjust(d)} disabled={rolling} />
        ))}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      <BetSelector value={bet} onChange={setBet} disabled={rolling} />
      <BigButton label={rolling ? '...' : 'КИНУТИ'} onPress={play} disabled={rolling} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  display: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 18, alignItems: 'center', gap: 12 },
  roll: { color: '#FFFFFF', fontSize: 64, fontWeight: '900' },
  bar: { width: '100%', height: 14, borderRadius: 7, backgroundColor: '#7F1D1D', overflow: 'hidden' },
  zone: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.green },
  marker: { position: 'absolute', top: -2, bottom: -2, width: 4, backgroundColor: '#FFFFFF' },
  caption: { color: colors.muted, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
});

const ROLL_MS = 650;

/** Число «прокручується» до результату, маркер їде по смузі виграшної зони. */
function drawDice(ctx: Ctx, now: number, W: number, d: { start: number; from: number; to: number }, roll: number | null, target: number, over: boolean) {
  const t = d.start ? Math.min(1, (now - d.start) / ROLL_MS) : 1;
  const e = 1 - (1 - t) ** 3;
  const v = d.start ? d.from + (d.to - d.from) * e : (roll ?? 50);
  const shownNum = d.start ? (t < 1 ? Math.floor(v + Math.sin(now / 20) * 4 * (1 - t)) : d.to) : roll;
  ctx.clearRect(0, 0, W, 120);
  const win = roll != null && t >= 1 && (over ? roll > target : roll < target);
  label(ctx, shownNum == null ? '--' : String(Math.max(0, Math.min(99, shownNum))), W / 2, 40, 60, t < 1 || roll == null ? '#FFFFFF' : win ? '#22C55E' : '#EF4444', 900, '');
  const y = 92;
  ctx.fillStyle = '#7F1D1D';
  roundRect(ctx, 0, y, W, 14, 7);
  ctx.fill();
  ctx.fillStyle = '#22C55E';
  if (over) roundRect(ctx, (W * (target + 1)) / 100, y, W - (W * (target + 1)) / 100, 14, 7);
  else roundRect(ctx, 0, y, (W * target) / 100, 14, 7);
  ctx.fill();
  if (d.start || roll != null) {
    const mx = (W * Math.max(0, Math.min(99, v))) / 100;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, mx - 3, y - 6, 6, 26, 3);
    ctx.fill();
    ctx.font = `800 11px ${FONT}`;
  }
  return t < 1;
}
