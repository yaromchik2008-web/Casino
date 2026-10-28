import { ComponentRef, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { BetSelector, BigButton, Chip, Label, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

export const CHICKEN_LANES = 15;
const LANE_W = 74;
// Шанс, що на смузі зіб'є машина. Множник чесний з 6% перевагою: 0.94 / шанс дійти.
export const CHICKEN_LEVELS = [
  { id: 'easy', label: 'Легко', hit: 0.08 },
  { id: 'medium', label: 'Середньо', hit: 0.16 },
  { id: 'hard', label: 'Складно', hit: 0.28 },
] as const;

export function chickenMultiplier(hit: number, lanes: number) {
  return lanes <= 0 ? 1 : Math.floor((0.94 / (1 - hit) ** lanes) * 100) / 100;
}

export function ChickenGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(100);
  const [level, setLevel] = useState(0);
  const [lane, setLane] = useState(0); // скільки смуг пройдено
  const [active, setActive] = useState(false);
  const [crash, setCrash] = useState<number | null>(null);
  const [message, setMessage] = useState({ text: 'Переведи курку через дорогу і не попади під колеса', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const hit = CHICKEN_LEVELS[level].hit;
  const mult = (k: number) => chickenMultiplier(hit, k);

  useEffect(() => {
    scroll.current?.scrollTo({ x: Math.max(0, (lane - 1) * LANE_W), animated: true });
  }, [lane]);

  const start = () => {
    if (!wallet.bet(game.id, 'fast', bet)) return setMessage({ text: 'Недостатньо коштів', tone: 'lose' });
    setLane(0);
    setCrash(null);
    setActive(true);
    sfx('click');
    setMessage({ text: `Перша смуга: ×${mult(1)}`, tone: 'neutral' });
  };

  const cashOut = (k = lane) => {
    const won = Math.floor(bet * mult(k));
    wallet.win(game.id, won);
    setActive(false);
    sfx(k >= 8 ? 'bigwin' : 'cash');
    haptic('win');
    setMessage({ text: k === CHICKEN_LANES ? `Курка перейшла! +${formatCoins(won)}` : `Забрав ×${mult(k)}: +${formatCoins(won)}`, tone: 'win' });
  };

  const go = () => {
    if (!active) return;
    const next = lane + 1;
    if (Math.random() < hit) {
      setCrash(next);
      setLane(next);
      setActive(false);
      sfx('bomb');
      haptic('lose');
      setMessage({ text: 'Бах! Курку збила машина 🚗💥', tone: 'lose' });
      return;
    }
    setLane(next);
    sfx('pop', 0.7);
    haptic();
    if (next === CHICKEN_LANES) return cashOut(next);
    setMessage({ text: `×${mult(next)} = ${formatCoins(Math.floor(bet * mult(next)))} · далі ×${mult(next + 1)}`, tone: 'win' });
  };

  return (
    <View style={styles.root}>
      <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} style={styles.road} contentContainerStyle={styles.roadInner}>
        <View style={[styles.lane, styles.side]}>
          <Text style={styles.big}>{lane === 0 && crash == null ? '🐔' : ''}</Text>
          <Text style={styles.laneMult}>СТАРТ</Text>
        </View>
        {Array.from({ length: CHICKEN_LANES }, (_, i) => {
          const n = i + 1;
          const here = lane === n;
          const passed = lane > n || (here && crash == null);
          return (
            <View key={n} style={[styles.lane, passed && styles.lanePassed, here && styles.laneHere]}>
              <View style={styles.dash} />
              <Text style={styles.big}>{here ? (crash === n ? '💥' : '🐔') : crash === n ? '' : n > lane && n <= lane + 1 && active ? '🚧' : ''}</Text>
              {crash === n && <Text style={styles.car}>🚗</Text>}
              <Text style={[styles.laneMult, passed && styles.multPassed]}>×{mult(n)}</Text>
            </View>
          );
        })}
        <View style={[styles.lane, styles.side]}>
          <Text style={styles.big}>🌽</Text>
          <Text style={styles.laneMult}>ФІНІШ</Text>
        </View>
      </ScrollView>
      <ResultLine text={message.text} tone={message.tone} />
      {active ? (
        <View style={styles.buttons}>
          <BigButton label="ВПЕРЕД" onPress={go} style={styles.half} />
          <BigButton
            label="ЗАБРАТИ"
            color="#F59E0B"
            disabled={lane === 0}
            onPress={() => cashOut()}
            style={styles.half}
          />
        </View>
      ) : (
        <>
          <Label>Складність</Label>
          <View style={styles.levels}>
            {CHICKEN_LEVELS.map((l, i) => (
              <Chip key={l.id} label={l.label} active={level === i} onPress={() => setLevel(i)} />
            ))}
          </View>
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label={`НА ДОРОГУ · ${formatCoins(bet)}`} onPress={start} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  road: { width: '100%', maxWidth: 480, borderRadius: 16, backgroundColor: '#334155' },
  roadInner: { paddingVertical: 8 },
  lane: {
    width: LANE_W,
    height: 190,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderRightWidth: 2,
    borderRightColor: '#475569',
    borderStyle: 'dashed',
  },
  side: { backgroundColor: '#3F6212', borderRightWidth: 0 },
  lanePassed: { backgroundColor: '#3B4A5F' },
  laneHere: { backgroundColor: '#4B5563' },
  dash: { position: 'absolute', top: 0, bottom: 0, left: LANE_W / 2 - 1, width: 2, backgroundColor: 'rgba(255,255,255,0.08)' },
  big: { fontSize: 38, marginTop: 40 },
  car: { position: 'absolute', top: 18, fontSize: 30 },
  laneMult: { color: '#CBD5E1', fontWeight: '900', fontSize: 13 },
  multPassed: { color: colors.gold },
  buttons: { flexDirection: 'row', gap: 10, width: '100%' },
  half: { flex: 1 },
  levels: { flexDirection: 'row', gap: 8 },
});
