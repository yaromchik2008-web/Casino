import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getSettings, sfx } from '../audio/sound';
import { BetSelector, BigButton, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const ART = {
  chicken: require('../../assets/arcade/chicken.png'),
  hit: require('../../assets/arcade/chicken_hit.png'),
  manhole: require('../../assets/arcade/manhole.png'),
  gold: require('../../assets/arcade/manhole_gold.png'),
  bush: require('../../assets/arcade/bush.png'),
  barrier: require('../../assets/arcade/barrier.png'),
  cars: [
    require('../../assets/arcade/car_red.png'),
    require('../../assets/arcade/car_taxi.png'),
    require('../../assets/arcade/car_blue.png'),
    require('../../assets/arcade/car_white.png'),
  ],
};

const LANE_W = 92;
const SIDE_W = 96;
const ROAD_H = 300;
const CAR_W = 50;
const CAR_H = 90;
// Шанс, що на смузі зіб'є машина. Множник чесний з 6% перевагою: 0.94 / шанс дійти.
export const CHICKEN_LEVELS = [
  { id: 'easy', label: 'Легкий', hit: 0.04, lanes: 24 },
  { id: 'medium', label: 'Середній', hit: 0.12, lanes: 22 },
  { id: 'hard', label: 'Хард', hit: 0.2, lanes: 20 },
  { id: 'god', label: 'Бог', hit: 0.4, lanes: 15 },
] as const;

export function chickenMultiplier(hit: number, lanes: number) {
  return lanes <= 0 ? 1 : Math.floor((0.94 / (1 - hit) ** lanes) * 100) / 100;
}

function short(m: number) {
  return m >= 1000 ? `×${Math.round(m / 100) / 10}k` : `×${m}`;
}

// Машина, що їде вниз по смузі. На айфоні в легкому режимі не анімуємо.
function Traffic({ seed }: { seed: number }) {
  const y = useRef(new Animated.Value(0)).current;
  const lite = getSettings().lite;
  useEffect(() => {
    if (lite) return;
    const run = Animated.loop(
      Animated.sequence([
        Animated.delay(400 + (seed * 677) % 1800),
        Animated.timing(y, { toValue: 1, duration: 1300 + (seed * 331) % 900, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    run.start();
    return () => run.stop();
  }, [y, seed, lite]);
  if (lite) return null;
  return (
    <Animated.Image
      source={ART.cars[seed % ART.cars.length]}
      style={[
        styles.car,
        { transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [-CAR_H - 10, ROAD_H + 10] }) }, { rotate: '180deg' }] },
      ]}
    />
  );
}

export function ChickenGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(1500);
  const [level, setLevel] = useState(1);
  const [lane, setLane] = useState(0); // скільки смуг пройдено
  const [active, setActive] = useState(false);
  const [crash, setCrash] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ win: boolean; title: string; amount: string; sub?: string } | null>(null);
  const [message, setMessage] = useState({ text: 'Переведи курку через дорогу і встигни забрати виграш', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const cfg = CHICKEN_LEVELS[level];
  const mult = (k: number) => chickenMultiplier(cfg.hit, k);
  const cashValue = Math.floor(bet * mult(lane));

  useEffect(() => {
    scroll.current?.scrollTo({ x: Math.max(0, SIDE_W + (lane - 2) * LANE_W), animated: true });
  }, [lane]);

  const start = () => {
    if (!wallet.bet(game.id, 'fast', bet)) return setMessage({ text: 'Недостатньо коштів', tone: 'lose' });
    setLane(0);
    setCrash(null);
    setBanner(null);
    setActive(true);
    sfx('click');
    setMessage({ text: `Смуга 0/${cfg.lanes}. Тисни «Вперед»!`, tone: 'neutral' });
  };

  const cashOut = (k = lane) => {
    const won = Math.floor(bet * mult(k));
    wallet.win(game.id, won);
    setActive(false);
    sfx(k >= 8 ? 'bigwin' : 'cash');
    haptic('win');
    setBanner({ win: true, title: k === cfg.lanes ? 'ПЕРЕЙШЛА!' : 'ЗАБРАВ', amount: `+${formatCoins(won)}`, sub: `×${mult(k)}` });
    setMessage({ text: 'Ще раз?', tone: 'win' });
  };

  const go = () => {
    if (!active) return;
    const next = lane + 1;
    setBanner(null);
    if (Math.random() < cfg.hit) {
      setCrash(next);
      setLane(next);
      setActive(false);
      sfx('bomb');
      haptic('lose');
      setBanner({ win: false, title: 'ПОТРАПИВ ПІД МАШИНУ', amount: `−${formatCoins(bet)}` });
      setMessage({ text: 'Не пощастило. Спробуй ще!', tone: 'lose' });
      return;
    }
    setLane(next);
    sfx('pop', 0.7);
    haptic();
    if (next === cfg.lanes) return cashOut(next);
    setMessage({ text: `Смуга ${next}/${cfg.lanes} · далі ×${mult(next + 1)}`, tone: 'win' });
  };

  return (
    <View style={styles.root}>
      <View style={styles.roadWrap}>
        <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ height: ROAD_H }}>
          <View style={styles.side}>
            {[0, 1, 2, 3].map((k) => (
              <Image key={k} source={ART.bush} style={[styles.bush, { top: k * 78 - 10 }]} />
            ))}
            {lane === 0 && crash == null && <Image source={ART.chicken} style={styles.chicken} />}
          </View>
          <View style={styles.curb} />
          {Array.from({ length: cfg.lanes }, (_, i) => {
            const n = i + 1;
            const here = lane === n;
            const passed = n < lane || (here && crash == null);
            const ahead = n > lane;
            return (
              <View key={n} style={styles.lane}>
                {Array.from({ length: 7 }, (_, d) => (
                  <View key={d} style={[styles.dash, { top: d * 46 + 6 }]} />
                ))}
                {passed && !here && <Image source={ART.barrier} style={styles.barrier} />}
                {active && ahead && n <= lane + 4 && <Traffic seed={n * 7 + level} />}
                <View style={styles.hole}>
                  <Image source={passed ? ART.gold : ART.manhole} style={styles.holeImg} />
                  {!here && <Text style={[styles.holeText, passed && styles.holeTextGold]}>{short(mult(n))}</Text>}
                </View>
                {here && crash === n && <Image source={ART.cars[n % 4]} style={[styles.car, styles.crashCar]} />}
                {here && <Image source={crash === n ? ART.hit : ART.chicken} style={styles.chicken} />}
                {here && crash == null && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>×{mult(n)}</Text>
                  </View>
                )}
              </View>
            );
          })}
          <View style={[styles.side, styles.finish]}>
            <Text style={styles.finishText}>🏁{'\n'}ФІНІШ</Text>
          </View>
        </ScrollView>
        {banner && (
          <View pointerEvents="none" style={[styles.banner, banner.win ? styles.bannerWin : styles.bannerLose]}>
            <Text style={styles.bannerTitle}>{banner.title}</Text>
            <Text style={styles.bannerAmount}>{banner.amount}</Text>
            {banner.sub && <Text style={styles.bannerSub}>{banner.sub}</Text>}
          </View>
        )}
      </View>

      <View style={styles.levels}>
        {CHICKEN_LEVELS.map((l, i) => (
          <Pressable key={l.id} disabled={active} onPress={() => setLevel(i)} style={[styles.level, level === i && styles.levelActive]}>
            <Text style={[styles.levelText, level === i && styles.levelTextActive]}>{l.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.infoRow}>
        <Text style={styles.info}>
          Смуга {lane}/{cfg.lanes}
        </Text>
        <Text style={styles.info}>{active ? `Забереш ${formatCoins(cashValue)}` : `До ×${short(mult(cfg.lanes)).slice(1)}`}</Text>
      </View>
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${(lane / cfg.lanes) * 100}%` }]} />
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      {active ? (
        <View style={styles.buttons}>
          <Pressable onPress={() => cashOut()} disabled={lane === 0} style={[styles.btn, styles.btnCash, lane === 0 && styles.btnOff]}>
            <Text style={styles.btnCashText}>ЗАБРАТИ {formatCoins(cashValue)}</Text>
          </Pressable>
          <Pressable onPress={go} style={[styles.btn, styles.btnGo]}>
            <Text style={styles.btnGoText}>ВПЕРЕД ×{mult(lane + 1)}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label={`ПОЧАТИ · ${formatCoins(bet)}`} onPress={start} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  roadWrap: { width: '100%', maxWidth: 480, height: ROAD_H, borderRadius: 18, overflow: 'hidden', backgroundColor: '#6B7280' },
  side: { width: SIDE_W, height: ROAD_H, backgroundColor: '#86C45A' },
  curb: { width: 10, height: ROAD_H, backgroundColor: '#E5D3A6' },
  finish: { backgroundColor: '#3F6212', alignItems: 'center', justifyContent: 'center' },
  finishText: { color: '#FFFFFF', fontWeight: '900', textAlign: 'center', fontSize: 16 },
  bush: { position: 'absolute', left: 4, width: 70, height: 70 },
  lane: { width: LANE_W, height: ROAD_H, backgroundColor: '#6B7280', overflow: 'hidden' },
  dash: { position: 'absolute', right: -2, width: 4, height: 24, backgroundColor: '#F3F4F6', borderRadius: 2 },
  barrier: { position: 'absolute', top: 30, left: (LANE_W - 70) / 2, width: 70, height: 56 },
  hole: { position: 'absolute', top: ROAD_H / 2 - 34, left: (LANE_W - 68) / 2, width: 68, height: 68, alignItems: 'center', justifyContent: 'center' },
  holeImg: { position: 'absolute', width: 68, height: 68 },
  holeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 14, textShadowColor: '#000', textShadowRadius: 3, textShadowOffset: { width: 1, height: 1 } },
  holeTextGold: { color: '#7C2D12', textShadowRadius: 0 },
  chicken: { position: 'absolute', top: ROAD_H / 2 - 60, left: '50%', marginLeft: -40, width: 80, height: 80 },
  car: { position: 'absolute', left: (LANE_W - CAR_W) / 2, top: 0, width: CAR_W, height: CAR_H },
  crashCar: { top: ROAD_H / 2 - CAR_H + 10, transform: [{ rotate: '180deg' }] },
  badge: { position: 'absolute', top: ROAD_H / 2 + 26, alignSelf: 'center', backgroundColor: '#2563EB', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
  banner: { position: 'absolute', top: 26, alignSelf: 'center', borderRadius: 16, paddingHorizontal: 22, paddingVertical: 10, alignItems: 'center' },
  bannerWin: { backgroundColor: '#15803DEE' },
  bannerLose: { backgroundColor: '#B91C1CEE' },
  bannerTitle: { color: '#FFFFFF', fontWeight: '900', fontSize: 12, letterSpacing: 1 },
  bannerAmount: { color: '#FFFFFF', fontWeight: '900', fontSize: 30 },
  bannerSub: { color: '#FFFFFFCC', fontWeight: '800', fontSize: 12 },
  levels: { flexDirection: 'row', gap: 6, width: '100%' },
  level: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.surfaceAlt, alignItems: 'center' },
  levelActive: { backgroundColor: '#3A2E12', borderWidth: 2, borderColor: colors.gold },
  levelText: { color: colors.muted, fontWeight: '900', fontSize: 13 },
  levelTextActive: { color: colors.gold },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  info: { color: colors.muted, fontWeight: '700' },
  progress: { width: '100%', height: 6, borderRadius: 3, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.gold },
  buttons: { flexDirection: 'row', gap: 10, width: '100%' },
  btn: { flex: 1, borderRadius: 18, paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
  btnCash: { backgroundColor: '#B7891F' },
  btnGo: { backgroundColor: colors.green },
  btnOff: { opacity: 0.5 },
  btnCashText: { color: '#1F1300', fontWeight: '900', fontSize: 15 },
  btnGoText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
});
