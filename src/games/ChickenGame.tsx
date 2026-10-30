import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getSettings, sfx } from '../audio/sound';
import { Ctx, FONT, GameCanvas, WEB, imageOf, label, roundRect } from '../components/canvasKit';
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
    if (!WEB) scroll.current?.scrollTo({ x: Math.max(0, SIDE_W + (lane - 2) * LANE_W), animated: true });
  }, [lane]);
  // Веб: дорога на канвасі; тут лише стан анімацій (стрибок курки, наїзд машини, камера).
  const [roadW, setRoadW] = useState(360);
  const anim = useRef({ from: 0, to: 0, at: 0, cam: 0, crashAt: 0, winAt: 0 });
  const prevLane = useRef(0);
  if (prevLane.current !== lane) {
    anim.current = { ...anim.current, from: prevLane.current, to: lane, at: performance.now() };
    prevLane.current = lane;
  }
  if (crash != null && !anim.current.crashAt) anim.current.crashAt = performance.now();
  if (crash == null) anim.current.crashAt = 0;
  if (banner?.win && !anim.current.winAt) anim.current.winAt = performance.now();
  if (!banner?.win) anim.current.winAt = 0;

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
      <View style={styles.roadWrap} onLayout={(e: LayoutChangeEvent) => setRoadW(Math.floor(e.nativeEvent.layout.width))}>
        {WEB ? (
          <GameCanvas
            width={roadW}
            height={ROAD_H}
            draw={(ctx, now) => drawRoad(ctx, now, roadW, { lane, crash, active, lanes: cfg.lanes, level, mult }, anim.current)}
          />
        ) : (
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
        )}
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
          <Pressable onPress={() => cashOut()} disabled={lane === 0} style={({ pressed }) => [styles.btn, styles.btnCash, lane === 0 && styles.btnCashWait, pressed && styles.btnPressed]}>
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

const HOP_MS = 260;

/** Дорога: камера їде за куркою, машини мчать по смугах попереду, курка стрибає дугою. */
function drawRoad(
  ctx: Ctx,
  now: number,
  W: number,
  g: { lane: number; crash: number | null; active: boolean; lanes: number; level: number; mult: (k: number) => number },
  a: { from: number; to: number; at: number; cam: number; crashAt: number; winAt: number },
) {
  const lite = getSettings().lite;
  const hop = Math.min(1, (now - a.at) / HOP_MS);
  const pos = a.from + (a.to - a.from) * hop; // дробова смуга курки
  const laneX = (k: number) => SIDE_W + 10 + (k - 1) * LANE_W; // ліва межа смуги k (1..lanes)
  const chickenX = (k: number) => (k <= 0 ? SIDE_W / 2 + 10 : laneX(k) + LANE_W / 2);
  const cxNow = chickenX(Math.floor(pos)) + (chickenX(Math.ceil(pos)) - chickenX(Math.floor(pos))) * (pos - Math.floor(pos));
  const worldW = SIDE_W + 10 + g.lanes * LANE_W + SIDE_W;
  const target = Math.max(0, Math.min(worldW - W, cxNow - W * 0.35));
  a.cam += (target - a.cam) * 0.15;
  if (Math.abs(target - a.cam) < 0.5) a.cam = target;
  const cam = a.cam;
  const landT = now - a.at - HOP_MS; // скільки мс минуло від приземлення
  const crashT = g.crash != null && a.crashAt ? now - a.crashAt : -1;
  ctx.save();
  // Удар машини трусить усю дорогу.
  if (crashT >= 0 && crashT < 380) {
    const k = (1 - crashT / 380) * 9;
    ctx.translate((Math.random() - 0.5) * k, (Math.random() - 0.5) * k);
  }
  ctx.translate(-Math.round(cam), 0);
  // Узбіччя з кущами.
  ctx.fillStyle = '#86C45A';
  ctx.fillRect(0, 0, SIDE_W, ROAD_H);
  const bush = imageOf(ART.bush);
  if (bush) for (let k = 0; k < 4; k++) ctx.drawImage(bush, 4, k * 78 - 10, 70, 70);
  ctx.fillStyle = '#E5D3A6';
  ctx.fillRect(SIDE_W, 0, 10, ROAD_H);
  const first = Math.max(1, Math.floor((cam - SIDE_W) / LANE_W));
  const last = Math.min(g.lanes, Math.ceil((cam + W - SIDE_W) / LANE_W) + 1);
  const hole = imageOf(ART.manhole);
  const gold = imageOf(ART.gold);
  const barrier = imageOf(ART.barrier);
  for (let n = first; n <= last; n++) {
    const x = laneX(n);
    // Асфальт: темніший до країв смуги, з дрібною крихтою й тріщинами.
    const asph = ctx.createLinearGradient(x, 0, x + LANE_W, 0);
    asph.addColorStop(0, '#4B515A');
    asph.addColorStop(0.5, '#5F6670');
    asph.addColorStop(1, '#4B515A');
    ctx.fillStyle = asph;
    ctx.fillRect(x, 0, LANE_W, ROAD_H);
    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    for (let k = 0; k < 18; k++) ctx.fillRect(x + hash(n * 31 + k) * LANE_W, hash(n * 17 + k * 3) * ROAD_H, 2, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let k = 0; k < 10; k++) ctx.fillRect(x + hash(n * 7 + k * 5) * LANE_W, hash(n * 13 + k) * ROAD_H, 3, 2);
    if (hash(n * 3.3) > 0.55) {
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const cy = hash(n * 9.1) * ROAD_H * 0.8;
      ctx.moveTo(x + 14, cy);
      ctx.lineTo(x + 30, cy + 12);
      ctx.lineTo(x + 26, cy + 30);
      ctx.lineTo(x + 44, cy + 44);
      ctx.stroke();
    }
    ctx.fillStyle = '#F3F4F6';
    for (let d = 0; d < 7; d++) {
      roundRect(ctx, x + LANE_W - 2, d * 46 + 6, 4, 24, 2);
      ctx.fill();
    }
    const here = g.lane === n;
    const passed = n < g.lane || (here && g.crash == null);
    const hx = x + (LANE_W - 68) / 2;
    const hy = ROAD_H / 2 - 34;
    if (passed) {
      // Пройдені люки світяться золотом.
      const pulse = here ? 0.55 + 0.25 * Math.sin(now / 160) : 0.35;
      const gl = ctx.createRadialGradient(x + LANE_W / 2, ROAD_H / 2, 10, x + LANE_W / 2, ROAD_H / 2, 54);
      gl.addColorStop(0, `rgba(255,213,74,${pulse})`);
      gl.addColorStop(1, 'rgba(255,213,74,0)');
      ctx.fillStyle = gl;
      ctx.fillRect(x, ROAD_H / 2 - 54, LANE_W, 108);
    }
    const im = passed ? gold : hole;
    if (im) ctx.drawImage(im, hx, hy, 68, 68);
    if (g.active && n === g.lane + 1) {
      // Наступна смуга: пульсує ціль.
      ctx.strokeStyle = `rgba(255,255,255,${0.45 + 0.35 * Math.sin(now / 140)})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = -now / 30;
      ctx.beginPath();
      ctx.arc(x + LANE_W / 2, ROAD_H / 2, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (!here) {
      const m = g.mult(n);
      const txt = m >= 1000 ? `×${Math.round(m / 100) / 10}k` : `×${m}`;
      label(ctx, txt, x + LANE_W / 2, ROAD_H / 2, 14, passed ? '#7C2D12' : '#FFFFFF', 900, passed ? '' : 'rgba(0,0,0,0.7)');
    }
    if (passed && !here && barrier) {
      // Шлагбаум падає зверху щойно курка перейшла смугу.
      const bt = n === g.lane - 1 ? Math.min(1, Math.max(0, landT / 260)) : 1;
      const by = -60 + 90 * (1 - (1 - bt) ** 3) + (bt < 1 ? 0 : 0);
      ctx.drawImage(barrier, x + (LANE_W - 70) / 2, by, 70, 56);
    }
    // Машини мчать по смугах попереду (на айфоні в легкому режимі їх немає).
    if (g.active && !lite && n > g.lane && n <= g.lane + 4) {
      const seed = n * 7 + g.level;
      const period = 1300 + ((seed * 331) % 900) + 400 + ((seed * 677) % 1800);
      const ph = ((now + seed * 137) % period) / period;
      const drive = (1300 + ((seed * 331) % 900)) / period;
      if (ph < drive) {
        const y = -CAR_H - 10 + (ROAD_H + CAR_H + 20) * (ph / drive);
        const car = imageOf(ART.cars[seed % ART.cars.length]);
        if (car) drawCar(ctx, car, x + LANE_W / 2, y + CAR_H / 2, true);
      }
    }
  }
  // Фініш.
  const fx = laneX(g.lanes + 1);
  ctx.fillStyle = '#3F6212';
  ctx.fillRect(fx, 0, SIDE_W, ROAD_H);
  label(ctx, '🏁 ФІНІШ', fx + SIDE_W / 2, ROAD_H / 2, 15, '#FFFFFF', 900, '');
  // Машина, що збила курку, налітає зверху.
  let carBusy = false;
  if (g.crash != null && a.crashAt) {
    const t = Math.min(1, (now - a.crashAt) / 220);
    carBusy = t < 1;
    const car = imageOf(ART.cars[g.crash % 4]);
    const x = laneX(g.crash) + (LANE_W - CAR_W) / 2;
    const y = -CAR_H + (ROAD_H / 2 - 10) * t;
    if (car) drawCar(ctx, car, x + CAR_W / 2, y + CAR_H / 2, t < 1);
  }
  // Курка стрибає дугою на наступну смугу.
  const chick = imageOf(g.crash != null && hop >= 1 ? ART.hit : ART.chicken);
  const jump = Math.sin(hop * Math.PI) * 30;
  // Тінь під куркою меншає в стрибку.
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(cxNow, ROAD_H / 2 + 16, 26 - jump * 0.3, 8 - jump * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  let fxBusy = false;
  // Пил і золоті іскри при приземленні.
  if (a.to > 0 && landT >= 0 && landT < 650 && g.crash == null) {
    fxBusy = true;
    const t = landT / 650;
    ctx.fillStyle = `rgba(220,220,210,${0.5 * (1 - t)})`;
    for (let k = 0; k < 6; k++) {
      const dir = k < 3 ? -1 : 1;
      ctx.beginPath();
      ctx.arc(cxNow + dir * (10 + t * 34 + (k % 3) * 6), ROAD_H / 2 + 14 - (k % 3) * 4, 5 + t * 6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2 + a.to;
      const d = 12 + t * 60;
      ctx.fillStyle = `rgba(255,${200 + (k % 3) * 20},74,${1 - t})`;
      ctx.fillRect(cxNow + Math.cos(ang) * d - 2, ROAD_H / 2 - Math.sin(ang) * d * 0.7 - 2, 4, 4);
    }
    ctx.globalAlpha = 1 - t;
    label(ctx, `×${g.mult(g.lane)}`, cxNow, ROAD_H / 2 - 74 - t * 40, 22, '#FFE58A');
    ctx.globalAlpha = 1;
  }
  if (chick) {
    // Сплющується при приземленні, як у мультиках.
    const sq = landT >= 0 && landT < 160 && g.crash == null ? Math.sin((landT / 160) * Math.PI) * 0.16 : 0;
    const w = 80 * (1 + sq);
    const h = 80 * (1 - sq);
    ctx.drawImage(chick, cxNow - w / 2, ROAD_H / 2 - 60 - jump + (80 - h), w, h);
  }
  // Пір'я розлітається від удару.
  if (crashT >= 0 && crashT < 1200) {
    fxBusy = true;
    const t = crashT / 1200;
    for (let k = 0; k < 16; k++) {
      const ang = hash(k + 1) * Math.PI * 2;
      const v = 50 + hash(k + 7) * 90;
      const fx2 = cxNow + Math.cos(ang) * v * t;
      const fy = ROAD_H / 2 - 20 + Math.sin(ang) * v * t * 0.8 + 60 * t * t;
      ctx.save();
      ctx.translate(fx2, fy);
      ctx.rotate(t * 6 + k);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = k % 4 === 0 ? '#F59E0B' : '#FFFFFF';
      ctx.beginPath();
      ctx.ellipse(0, 0, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  if (g.crash == null && g.lane > 0 && hop >= 1) {
    const txt = `×${g.mult(g.lane)}`;
    ctx.font = `900 13px ${FONT}`;
    const w = ctx.measureText(txt).width + 20;
    ctx.fillStyle = '#2563EB';
    roundRect(ctx, cxNow - w / 2, ROAD_H / 2 + 26, w, 22, 10);
    ctx.fill();
    label(ctx, txt, cxNow, ROAD_H / 2 + 37, 13, '#FFFFFF', 900, '');
  }
  ctx.restore();
  // Червоний спалах при ударі.
  if (crashT >= 0 && crashT < 500) {
    ctx.fillStyle = `rgba(220,38,38,${0.35 * (1 - crashT / 500)})`;
    ctx.fillRect(0, 0, W, ROAD_H);
  }
  // Конфеті, коли забрав виграш.
  const winT = a.winAt ? now - a.winAt : -1;
  if (winT >= 0 && winT < 1800) {
    fxBusy = true;
    const t = winT / 1800;
    const cols = ['#FFD54A', '#22C55E', '#3B82F6', '#EC4899', '#FFFFFF'];
    for (let k = 0; k < 46; k++) {
      const x0 = hash(k * 1.7) * W;
      const fall = (40 + hash(k * 2.3) * 160) * t * 1.6;
      const y = -10 + fall + hash(k * 4.1) * 40 - 30 * (1 - t);
      ctx.save();
      ctx.translate(x0 + Math.sin(t * 8 + k) * 12, y);
      ctx.rotate(t * 10 + k);
      ctx.globalAlpha = 1 - t * 0.7;
      ctx.fillStyle = cols[k % cols.length];
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  const waiting = !hole || !gold || !chick;
  return waiting || hop < 1 || carBusy || fxBusy || landT < 300 || Math.abs(target - a.cam) > 0.5 || (g.active && !lite);
}

const hash = (n: number) => {
  const v = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

/** Машина згори: тінь, світло фар попереду і сама машина (їде вниз). */
function drawCar(ctx: Ctx, car: HTMLImageElement, cx: number, cy: number, moving: boolean) {
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, cx - CAR_W / 2 + 4, cy - CAR_H / 2 + 8, CAR_W, CAR_H, 12);
  ctx.fill();
  const hl = ctx.createLinearGradient(0, cy + CAR_H / 2 - 6, 0, cy + CAR_H / 2 + 60);
  hl.addColorStop(0, 'rgba(255,250,210,0.55)');
  hl.addColorStop(1, 'rgba(255,250,210,0)');
  ctx.fillStyle = hl;
  ctx.beginPath();
  ctx.moveTo(cx - CAR_W * 0.38, cy + CAR_H / 2 - 6);
  ctx.lineTo(cx - CAR_W * 0.75, cy + CAR_H / 2 + 60);
  ctx.lineTo(cx + CAR_W * 0.75, cy + CAR_H / 2 + 60);
  ctx.lineTo(cx + CAR_W * 0.38, cy + CAR_H / 2 - 6);
  ctx.closePath();
  ctx.fill();
  if (moving) {
    // Смуги швидкості позаду.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const dx of [-0.32, 0, 0.32]) {
      ctx.moveTo(cx + dx * CAR_W, cy - CAR_H / 2 - 4);
      ctx.lineTo(cx + dx * CAR_W, cy - CAR_H / 2 - 34);
    }
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.PI);
  ctx.drawImage(car, -CAR_W / 2, -CAR_H / 2, CAR_W, CAR_H);
  ctx.restore();
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
  // Яскраве золото з підсвіткою, щоб кнопка не виглядала натиснутою.
  btnCash: {
    backgroundColor: '#FFC93C',
    borderWidth: 2,
    borderColor: '#FFE9A8',
    shadowColor: '#FFC93C',
    shadowOpacity: 0.6,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  btnGo: { backgroundColor: colors.green },
  btnOff: { opacity: 0.5 },
  btnCashWait: { opacity: 0.8, shadowOpacity: 0 },
  btnPressed: { transform: [{ scale: 0.97 }], opacity: 0.85 },
  btnCashText: { color: '#1F1300', fontWeight: '900', fontSize: 15 },
  btnGoText: { color: '#FFFFFF', fontWeight: '900', fontSize: 15 },
});
