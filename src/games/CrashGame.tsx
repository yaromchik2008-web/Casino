import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BetSelector, BigButton, Chip, Label, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const AUTO_OPTIONS = [0, 1.5, 2, 3, 5, 10];

function crashPoint() {
  const u = Math.random();
  return Math.max(1, Math.floor((0.97 / (1 - u)) * 100) / 100);
}

export function CrashGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(50);
  const [autoCash, setAutoCash] = useState(2);
  const [multiplier, setMultiplier] = useState(1);
  const [running, setRunning] = useState(false);
  const [crashed, setCrashed] = useState(false);
  const [cashedAt, setCashedAt] = useState<number | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [message, setMessage] = useState({ text: 'Зроби ставку і запускай ракету', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const round = useRef({ crashAt: 1, start: 0, cashed: false, bet: 0 });

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const cashOut = (at: number) => {
    const r = round.current;
    if (r.cashed) return;
    r.cashed = true;
    const won = Math.floor(r.bet * at);
    wallet.win(game.id, won);
    haptic('win');
    setCashedAt(at);
    setMessage({ text: `Забрав на ×${at.toFixed(2)}: +${formatCoins(won)} 🪙`, tone: 'win' });
  };

  const launch = () => {
    if (running) return;
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    round.current = { crashAt: crashPoint(), start: Date.now(), cashed: false, bet };
    setRunning(true);
    setCrashed(false);
    setCashedAt(null);
    setMultiplier(1);
    setMessage({ text: 'Летимо!', tone: 'neutral' });
    timer.current = setInterval(() => {
      const r = round.current;
      const t = (Date.now() - r.start) / 1000;
      const m = Math.floor(Math.exp(0.16 * t) * 100) / 100;
      if (m >= r.crashAt) {
        clearInterval(timer.current!);
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
    }, 50);
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
      <View style={styles.sky}>
        <Text style={[styles.rocket, { bottom: 10 + height * 170, left: 20 + height * 200 }]}>
          {crashed ? '💥' : '🚀'}
        </Text>
        <Text style={[styles.multiplier, crashed && { color: colors.red }, cashedAt !== null && { color: colors.green }]}>
          ×{multiplier.toFixed(2)}
        </Text>
      </View>
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
  multiplier: { color: '#FFFFFF', fontSize: 56, fontWeight: '900' },
  autoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
});
