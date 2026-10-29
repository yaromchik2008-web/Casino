import { createElement, memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { sfx } from '../audio/sound';
import { celebrate, winTier } from '../components/Celebration';
import { BetSelector, BigButton, Panel, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';
import {
  BLOCKS,
  BOTTOM_BONUS,
  Block,
  FPS,
  MINE_COLS,
  MINE_ROWS,
  ORE_SCALE,
  PICK_TIERS,
  blockValue,
  generateMine,
  rollPick,
  simulateRun,
  strike,
} from './mineEngine';

const TEX = {
  dirt: require('../../assets/arcade/dirt.png'),
  grass: require('../../assets/arcade/grass.png'),
  stone: require('../../assets/arcade/stone.png'),
  gravel: require('../../assets/arcade/gravel.png'),
  coal: require('../../assets/arcade/coal.png'),
  iron: require('../../assets/arcade/iron.png'),
  gold: require('../../assets/arcade/gold.png'),
  diamond: require('../../assets/arcade/diamond.png'),
  chest: require('../../assets/arcade/chest.png'),
  tnt: require('../../assets/arcade/tnt.png'),
};
const CRACKS = [
  require('../../assets/arcade/crack1.png'),
  require('../../assets/arcade/crack2.png'),
  require('../../assets/arcade/crack3.png'),
];
const PICKS = [
  require('../../assets/arcade/pick_wood.png'),
  require('../../assets/arcade/pick_stone.png'),
  require('../../assets/arcade/pick_iron.png'),
  require('../../assets/arcade/pick_diamond.png'),
];

const STARS: [number, number, number][] = [
  [6, 20, 0.9], [18, 55, 0.6], [31, 15, 0.8], [44, 70, 0.5], [57, 30, 0.9], [69, 60, 0.6], [83, 18, 0.7], [92, 50, 0.8],
];

function texture(block: Block, index: number) {
  if (block.type === 'dirt') return index < MINE_COLS ? TEX.grass : TEX.dirt;
  if (block.type === 'stone') return index % 3 === 0 ? TEX.gravel : TEX.stone;
  return TEX[block.type];
}

const BlockView = memo(function BlockView({
  block,
  index,
  size,
  canHit,
  onPress,
  shakeKey,
}: {
  block: Block;
  index: number;
  size: number;
  canHit: boolean;
  onPress: () => void;
  shakeKey: number;
}) {
  const info = BLOCKS[block.type];
  const shake = useRef(new Animated.Value(0)).current;
  const lastKey = useRef(shakeKey);
  if (lastKey.current !== shakeKey) {
    lastKey.current = shakeKey;
    shake.setValue(1);
    Animated.spring(shake, { toValue: 0, friction: 3, tension: 200, useNativeDriver: true }).start();
  }
  if (block.broken)
    return (
      <View style={{ width: size, height: size }}>
        <Image source={TEX.dirt} style={{ width: size, height: size }} />
        <View style={[StyleSheet.absoluteFill, styles.caveShade]} />
      </View>
    );
  const damage = 1 - block.hp / info.hp;
  const depth = Math.floor(index / MINE_COLS);
  return (
    <Pressable onPress={onPress} disabled={!canHit}>
      <Animated.View
        style={{ width: size, height: size, overflow: 'hidden', transform: [{ translateX: shake.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }) }] }}
      >
        <Image source={texture(block, index)} style={{ width: size, height: size }} />
        {damage > 0 && <Image source={CRACKS[Math.min(2, Math.floor(damage * 3))]} style={{ position: 'absolute', left: 0, top: 0, width: size, height: size }} />}
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${Math.min(0.3, depth * 0.018) + (canHit ? 0 : 0.22)})` }]}
        />
      </Animated.View>
    </Pressable>
  );
});

const NOOP = () => {};
// На вебі шахта малюється на Canvas (див. drawMine), на телефонах без вебу лишаються звичайні View.
const WEB = Platform.OS === 'web';

// ───────────── Веб: уся шахта малюється на одному Canvas, як у звичайних іграх ─────────────

type Img = { complete: boolean; naturalWidth: number } & CanvasImageSource;
function srcOf(m: unknown): string {
  if (typeof m === 'string') return m;
  const o = m as { uri?: string; default?: string } | null;
  return o?.uri ?? o?.default ?? '';
}
function loadImg(m: unknown): Img | null {
  if (!WEB || typeof document === 'undefined') return null;
  const im = new (globalThis as unknown as { Image: new () => HTMLImageElement }).Image();
  im.src = srcOf(m);
  return im as unknown as Img;
}
const CTEX = WEB ? (Object.fromEntries(Object.entries(TEX).map(([k, v]) => [k, loadImg(v)])) as Record<keyof typeof TEX, Img | null>) : null;
const CCRACKS = WEB ? CRACKS.map(loadImg) : [];
const CPICKS = WEB ? PICKS.map(loadImg) : [];
const ready = (im: Img | null | undefined): im is Img => !!im && im.complete && im.naturalWidth > 0;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

function texKey(block: Block, index: number): keyof typeof TEX {
  if (block.type === 'dirt') return index < MINE_COLS ? 'grass' : 'dirt';
  if (block.type === 'stone') return index % 3 === 0 ? 'gravel' : 'stone';
  return block.type;
}

function drawMine(
  ctx: CanvasRenderingContext2D,
  o: { blocks: Block[]; size: number; skyH: number; viewH: number; camY: number; px: number; py: number; deg: number; hp: number; tier: number; parts: Particle[] },
) {
  const { blocks, size, skyH, viewH, camY } = o;
  const w = size * MINE_COLS;
  ctx.fillStyle = '#140F0B';
  ctx.fillRect(0, 0, w, viewH);
  ctx.save();
  ctx.translate(0, -Math.round(camY));
  if (camY < skyH) {
    ctx.fillStyle = '#1E2350';
    ctx.fillRect(0, 0, w, skyH);
    ctx.fillStyle = '#FFFFFF';
    for (const st of STARS) {
      ctx.globalAlpha = st[2];
      ctx.fillRect((st[0] / 100) * w, (st[1] / 100) * skyH, 3, 3);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#F4F1C9';
    ctx.fillRect(w - 40, 12, 22, 22);
  }
  const r0 = Math.max(0, Math.floor((camY - skyH) / size));
  const r1 = Math.min(MINE_ROWS - 1, Math.floor((camY + viewH - skyH) / size));
  for (let row = r0; row <= r1; row++) {
    const y = skyH + row * size;
    const shade = Math.min(0.3, row * 0.018);
    for (let col = 0; col < MINE_COLS; col++) {
      const i = row * MINE_COLS + col;
      const b = blocks[i];
      const x = col * size;
      if (b.broken) {
        const d = CTEX?.dirt;
        if (ready(d)) ctx.drawImage(d, x, y, size, size);
        ctx.fillStyle = 'rgba(12,8,4,0.72)';
        ctx.fillRect(x, y, size, size);
        continue;
      }
      const t = CTEX?.[texKey(b, i)];
      if (ready(t)) ctx.drawImage(t, x, y, size, size);
      else {
        ctx.fillStyle = BLOCKS[b.type].color;
        ctx.fillRect(x, y, size, size);
      }
      const damage = 1 - b.hp / BLOCKS[b.type].hp;
      if (damage > 0) {
        const c = CCRACKS[Math.min(2, Math.floor(damage * 3))];
        if (ready(c)) ctx.drawImage(c, x, y, size, size);
      }
      if (shade > 0) {
        ctx.fillStyle = `rgba(0,0,0,${shade})`;
        ctx.fillRect(x, y, size, size);
      }
    }
  }
  for (const p of o.parts) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillStyle = p.color;
    const s = Math.max(2, size * 0.09);
    ctx.fillRect(p.x * size - s / 2, skyH + p.y * size - s / 2, s, s);
  }
  ctx.globalAlpha = 1;
  // Кирка з HP над нею.
  const cx = o.px * size;
  const cy = skyH + o.py * size;
  const pk = CPICKS[o.tier];
  if (ready(pk)) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((o.deg * Math.PI) / 180);
    const ps = size * 0.8;
    ctx.drawImage(pk, -ps / 2, -ps / 2, ps, ps);
    ctx.restore();
  }
  ctx.font = '900 13px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000000';
  const label = `❤ ${o.hp}`;
  ctx.strokeText(label, cx, cy - size * 0.5 - 6);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, cx, cy - size * 0.5 - 6);
  ctx.restore();
}

/** Кусочки блоку, що розлітаються при ламанні. */
function burst(parts: Particle[], blocks: Block[], broken: number[]) {
  for (const i of broken) {
    const info = BLOCKS[blocks[i].type];
    const bx = (i % MINE_COLS) + 0.5;
    const by = Math.floor(i / MINE_COLS) + 0.5;
    for (let k = 0; k < 6; k++)
      parts.push({ x: bx, y: by, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5 - 1, life: 0.5 + Math.random() * 0.3, color: k % 2 ? info.color : info.dark });
  }
  if (parts.length > 120) parts.splice(0, parts.length - 120);
}

// Рулетка, яка вибирає кирку на заїзд: від дерев'яної (мало HP) до алмазної (найбільше HP).
const ROLL_ITEM = 76;
const ROLL_LEN = 36;
const ROLL_STOP = 30;

function PickRoulette({ tier, onDone }: { tier: number; onDone: () => void }) {
  const { width } = useWindowDimensions();
  const view = Math.min(width, 480) - 64;
  const x = useRef(new Animated.Value(0)).current;
  const [done, setDone] = useState(false);
  const strip = useMemo(() => Array.from({ length: ROLL_LEN }, (_, i) => (i === ROLL_STOP ? tier : rollPick())), [tier]);
  useEffect(() => {
    sfx('spin', 0.5);
    const target = -(ROLL_STOP * ROLL_ITEM - view / 2 + ROLL_ITEM / 2) + (Math.random() - 0.5) * ROLL_ITEM * 0.6;
    Animated.timing(x, { toValue: target, duration: 3000, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      setDone(true);
      sfx(tier >= 2 ? 'bigwin' : 'win', 0.7);
      haptic('win');
      setTimeout(onDone, 1100);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const t = PICK_TIERS[tier];
  return (
    <Panel style={styles.roll}>
      <Text style={styles.upTitle}>🎰 Яка кирка тобі випаде?</Text>
      <View style={[styles.rollWindow, { width: view }]}>
        <Animated.View style={[styles.rollStrip, { transform: [{ translateX: x }] }]}>
          {strip.map((k, i) => (
            <View key={i} style={[styles.rollItem, { borderColor: PICK_TIERS[k].color }]}>
              <Image source={PICKS[k]} style={{ width: 44, height: 44 }} />
              <Text style={[styles.rollHp, { color: PICK_TIERS[k].color }]}>❤ {PICK_TIERS[k].hp}</Text>
            </View>
          ))}
        </Animated.View>
        <View pointerEvents="none" style={[styles.rollPointer, { left: view / 2 - 2 }]} />
      </View>
      <Text style={[styles.infoText, { color: done ? t.color : colors.muted }]}>
        {done ? `Випала: ${t.name} · ❤ ${t.hp} HP · сила ${t.power}` : 'Крутимо…'}
      </Text>
    </Panel>
  );
}

// У дуелі ставка віртуальна, очки = знайдене × 1000.
export const DUEL_MINE_BET = 1000;

export function MineGame({
  game,
  duel,
  onProgress,
  autoStart,
}: {
  game: GameInfo;
  duel?: (points: number) => void;
  onProgress?: (points: number) => void;
  autoStart?: boolean;
}) {
  const wallet = useWallet();
  const { width, height } = useWindowDimensions();
  const [bet, setBet] = useState(100);
  const [phase, setPhase] = useState<'idle' | 'roll' | 'run'>('idle');
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [tier, setTier] = useState(0);
  const [pickHp, setPickHp] = useState(0);
  const [runValue, setRunValue] = useState(0);
  const [runBet, setRunBet] = useState(0);
  const [shakes, setShakes] = useState<Record<number, number>>({});
  const [message, setMessage] = useState({ text: 'Кирка падає сама й ламає блоки, поки в неї є HP', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const pos = useRef(new Animated.ValueXY({ x: 0, y: -100 })).current;
  const rot = useRef(new Animated.Value(0)).current;
  const play = useRef<{ raf: number; skip: boolean; alive: boolean }>({ raf: 0, skip: false, alive: true });
  // Шахта на всю ширину; камера їде за киркою вниз, тож небо зникає, а дна не видно до кінця.
  const size = Math.floor((Math.min(width, 520) - 32) / MINE_COLS);
  const skyH = size * 2;
  const contentH = skyH + size * MINE_ROWS;
  const viewH = Math.min(contentH, Math.max(320, height - 300));
  const cam = useRef(new Animated.Value(0)).current;
  const lastHitSfx = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pick = PICK_TIERS[tier];

  useEffect(
    () => () => {
      play.current.alive = false;
      cancelAnimationFrame(play.current.raf);
    },
    [],
  );

  const show = (v: number) => (duel ? `${Math.round(v)} очок` : formatCoins(v));

  const start = () => {
    if (!duel && !wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо коштів', tone: 'lose' });
      return;
    }
    const t = rollPick();
    setRunBet(duel ? DUEL_MINE_BET : bet);
    setBlocks(generateMine());
    setTier(t);
    setPickHp(PICK_TIERS[t].hp);
    setRunValue(0);
    setShakes({});
    setPhase('roll');
    setMessage({ text: duel ? 'Дуель: один заїзд, хто знайде більше' : 'Крутимо рулетку кирок…', tone: 'neutral' });
  };

  const finish = async (value: number, stake: number, bottom: boolean) => {
    const won = Math.round(value * stake);
    if (duel) {
      setPhase('idle');
      setBlocks(null);
      duel(won);
      return;
    }
    if (won > 0) {
      wallet.win(game.id, won);
      if (winTier(won, stake)) await celebrate({ kind: 'win', amount: won, bet: stake });
      else sfx('cash');
      setMessage({ text: `${bottom ? 'Пробився до дна! ' : ''}Заїзд завершено: +${formatCoins(won)}`, tone: 'win' });
    } else setMessage({ text: 'Кирка зламалась. Спробуй ще!', tone: 'lose' });
    if (!play.current.alive) return;
    setPhase('idle');
    setBlocks(null);
  };

  // Програє наперед прорахований заїзд: позиція кирки йде напряму в анімацію, блоки оновлюються лише на ударах.
  const run = () => {
    if (!blocks) return;
    const r = simulateRun(blocks, tier);
    const stake = runBet;
    setPhase('run');
    setMessage({ text: `${pick.name}: ❤ ${pick.hp} HP. Поїхали!`, tone: 'neutral' });
    let cur = blocks;
    let value = 0;
    let next = 0;
    let camY = 0;
    cam.setValue(0);
    const parts: Particle[] = [];
    let ctx: CanvasRenderingContext2D | null = null;
    let lastT = Date.now();
    let hpNow = pick.hp;
    const paint = (fx: number, fy: number, deg: number, cy: number) => {
      const cv = canvasRef.current;
      if (!cv) return;
      if (!ctx) {
        const dpr = Math.min(3, (globalThis as unknown as { devicePixelRatio?: number }).devicePixelRatio ?? 1);
        cv.width = Math.round(size * MINE_COLS * dpr);
        cv.height = Math.round(viewH * dpr);
        ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.imageSmoothingEnabled = false;
      }
      const now = Date.now();
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      for (let k = parts.length - 1; k >= 0; k--) {
        const p = parts[k];
        p.vy += 18 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        if (p.life <= 0) parts.splice(k, 1);
      }
      drawMine(ctx, { blocks: cur, size, skyH, viewH, camY: cy, px: fx, py: fy, deg, hp: hpNow, tier, parts });
    };
    const move = (x: number, y: number, deg: number, cy: number) => {
      pos.setValue({ x, y });
      rot.setValue(deg);
      cam.setValue(-cy);
    };
    const total = r.frames.length / 3;
    const t0 = Date.now();
    play.current.skip = false;
    const step = () => {
      if (!play.current.alive) return;
      const f = play.current.skip ? total - 1 : Math.min(total - 1, Math.floor(((Date.now() - t0) / 1000) * FPS));
      // Камера плавно тримає кирку у верхній чверті вікна, тож небо швидко зникає.
      const target = Math.max(0, Math.min(contentH - viewH, skyH + r.frames[f * 3 + 1] * size - viewH * 0.22));
      camY = play.current.skip ? target : camY + (target - camY) * 0.12;
      if (!WEB) move(r.frames[f * 3] * size - size / 2, r.frames[f * 3 + 1] * size - size / 2, r.frames[f * 3 + 2], camY);
      let changed = false;
      while (next < r.hits.length && r.hits[next].frame <= f) {
        const h = r.hits[next++];
        const prev = cur;
        // Незмінені блоки лишаються тими самими об'єктами, тож memo не перемальовує всю шахту на кожному ударі.
        cur = strike(cur, h.index, pick.power).blocks.map((b, k) => (b.hp === prev[k].hp && b.broken === prev[k].broken ? prev[k] : b));
        value += h.value;
        changed = true;
        hpNow = h.pickHp;
        setPickHp(h.pickHp);
        if (WEB && !play.current.skip) burst(parts, cur, h.broken);
        if (!WEB) setShakes((s) => ({ ...s, [h.index]: (s[h.index] ?? 0) + 1 }));
        if (play.current.skip) continue;
        if (h.exploded) {
          sfx('bomb');
          haptic('win');
        } else if (h.broken.length) sfx('break', 0.6);
        else if (Date.now() - lastHitSfx.current > 140) {
          // Дрібні удари йдуть дуже часто; не більше одного звуку на 140 мс.
          lastHitSfx.current = Date.now();
          sfx('hit', 0.5);
        }
        const found = h.broken.map((b) => cur[b]).filter((b) => blockValue(b) > 0);
        if (found.some((b) => b.type === 'diamond')) wallet.track('diamonds', found.filter((b) => b.type === 'diamond').length);
        if (found.length) {
          const best = found.sort((a, b) => blockValue(b) - blockValue(a))[0];
          setMessage({ text: `${BLOCKS[best.type].icon} ${BLOCKS[best.type].name}${h.exploded ? ' (вибух!)' : ''} +${show(h.value * stake)}`, tone: 'win' });
          sfx('coin', 0.6);
        }
      }
      if (WEB) paint(r.frames[f * 3], r.frames[f * 3 + 1], r.frames[f * 3 + 2], camY);
      if (changed) {
        // На вебі шахту малює Canvas, тож React-дерево блоків не чіпаємо.
        if (!WEB) setBlocks(cur);
        setRunValue(value);
        onProgress?.(Math.round(value * stake));
      }
      if (f >= total - 1) {
        if (r.bottom) onProgress?.(Math.round(r.value * stake));
        setTimeout(() => finish(r.value, stake, r.bottom), 600);
        return;
      }
      play.current.raf = requestAnimationFrame(step);
    };
    play.current.raf = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (autoStart) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.root}>
      <Panel style={styles.info}>
        {phase === 'idle' ? (
          <Text style={styles.infoText}>⛏️ Кирка падає за законами фізики й ламає блоки</Text>
        ) : (
          <>
            <Text style={styles.infoText}>
              {phase === 'roll' ? 'Рулетка кирок' : `${pick.name} · сила ${pick.power}`}
            </Text>
            {phase === 'run' && (
              <>
                <View style={styles.energy}>
                  <View style={[styles.energyFill, { width: `${(pickHp / pick.hp) * 100}%`, backgroundColor: pickHp / pick.hp < 0.3 ? colors.red : colors.green }]} />
                </View>
                <Text style={styles.infoText}>
                  ❤ HP кирки: {pickHp}/{pick.hp} · Знайдено: {show(runValue * runBet)}
                </Text>
              </>
            )}
          </>
        )}
      </Panel>
      <ResultLine text={message.text} tone={message.tone} />
      {phase === 'roll' && <PickRoulette tier={tier} onDone={run} />}
      {blocks && phase === 'run' ? (
        <View style={styles.mine}>
          <View style={[styles.window, { width: size * MINE_COLS, height: viewH }]}>
          {WEB ? (
            createElement('canvas', { ref: canvasRef, style: { width: size * MINE_COLS, height: viewH, display: 'block' } })
          ) : (
          <Animated.View style={{ transform: [{ translateY: cam }] }}>
          <View style={[styles.sky, { width: size * MINE_COLS, height: skyH }]}>
            {STARS.map((st, k) => (
              <View key={k} style={[styles.star, { left: `${st[0]}%`, top: `${st[1]}%`, opacity: st[2] }]} />
            ))}
            <View style={styles.moon} />
          </View>
          <View style={[styles.grid, { width: size * MINE_COLS }]}>
            {blocks.map((b, i) => (
              <BlockView key={i} block={b} index={i} size={size} canHit onPress={NOOP} shakeKey={shakes[i] ?? 0} />
            ))}
            <Animated.View
              pointerEvents="none"
              style={[styles.pick, { width: size, height: size }, { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}
            >
              <View style={[styles.hp, { top: -20, width: size * 1.6, left: -size * 0.3 }]}>
                <Text style={styles.hpText}>❤ {pickHp}</Text>
              </View>
              <Animated.View style={{ transform: [{ rotate: rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }}>
                <Image source={PICKS[tier]} style={{ width: size * 0.8, height: size * 0.8 }} />
              </Animated.View>
            </Animated.View>
          </View>
          </Animated.View>
          )}
          </View>
          <View style={styles.btnRow}>
            <BigButton label="⏩ ПРОПУСТИТИ" color={colors.blue} onPress={() => (play.current.skip = true)} style={styles.half} />
          </View>
        </View>
      ) : phase === 'idle' ? (
        duel ? (
          <BigButton label="ПОЧАТИ ДУЕЛЬ" onPress={start} />
        ) : (
          <>
            <BetSelector value={bet} onChange={setBet} />
            <BigButton label={`У ШАХТУ · ${formatCoins(bet)}`} onPress={start} />
            <Panel style={styles.upgrade}>
              <Text style={styles.upTitle}>Кирки (випадають у рулетці перед заїздом)</Text>
              {PICK_TIERS.map((p, i) => (
                <View key={p.name} style={styles.tierRow}>
                  <Image source={PICKS[i]} style={{ width: 26, height: 26 }} />
                  <Text style={styles.upRow}>
                    {p.name}: ❤ {p.hp} HP, сила {p.power} · шанс {Math.round((p.weight / PICK_TIERS.reduce((s, t) => s + t.weight, 0)) * 100)}%
                  </Text>
                </View>
              ))}
            </Panel>
            <Panel>
              <Text style={styles.upTitle}>Що в шахті (× ставка)</Text>
              {(['coal', 'iron', 'gold', 'diamond'] as const).map((t) => (
                <Text key={t} style={styles.upRow}>
                  {BLOCKS[t].icon} {BLOCKS[t].name}: міцність {BLOCKS[t].hp}, ×{+(BLOCKS[t].value * ORE_SCALE).toFixed(2)}
                </Text>
              ))}
              <Text style={styles.upRow}>🧰 Скриня: випадковий приз до ×{+(1.6 * ORE_SCALE).toFixed(1)}</Text>
              <Text style={styles.upRow}>🧨 Динаміт: підриває всі блоки навколо</Text>
              <Text style={styles.upRow}>Кожен удар забирає в кирки HP. Пробився до дна: бонус ×{BOTTOM_BONUS}.</Text>
            </Panel>
          </>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  info: { gap: 6, alignItems: 'center' },
  infoText: { color: colors.text, fontWeight: '800' },
  energy: { width: '100%', height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  energyFill: { height: '100%', backgroundColor: colors.green },
  mine: { gap: 0, alignItems: 'center' },
  window: { overflow: 'hidden', borderRadius: 12, alignSelf: 'center', backgroundColor: '#140F0B' },
  grass: { height: 10, alignSelf: 'stretch', backgroundColor: '#4CAF50', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  sky: { height: 70, alignSelf: 'center', backgroundColor: '#1E2350', overflow: 'hidden' },
  star: { position: 'absolute', width: 3, height: 3, backgroundColor: '#FFFFFF' },
  moon: { position: 'absolute', right: 18, top: 12, width: 22, height: 22, backgroundColor: '#F4F1C9' },
  caveShade: { backgroundColor: 'rgba(12,8,4,0.72)' },
  hp: { position: 'absolute', zIndex: 6, alignItems: 'center' },
  hpText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13, textShadowColor: '#000', textShadowRadius: 3, textShadowOffset: { width: 1, height: 1 } },
  block: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 2,
    borderTopColor: 'rgba(255,255,255,0.28)',
    borderLeftColor: 'rgba(255,255,255,0.18)',
    borderRightColor: 'rgba(0,0,0,0.35)',
    borderBottomColor: 'rgba(0,0,0,0.45)',
  },
  px: { position: 'absolute' },
  tntBand: { position: 'absolute', left: 0, right: 0, backgroundColor: '#F5F5F5' },
  pick: { position: 'absolute', left: 0, top: 0, alignItems: 'center', justifyContent: 'center', zIndex: 5 },
  btnRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 12 },
  half: { flex: 1 },
  crack: { position: 'absolute', alignSelf: 'center', top: '22%', opacity: 0.85 },
  cave: { backgroundColor: '#140F0B', borderWidth: 1, borderColor: '#0A0705' },
  upgrade: { gap: 6 },
  upTitle: { color: colors.gold, fontWeight: '900', fontSize: 15, marginBottom: 4 },
  upRow: { color: colors.text, fontSize: 13 },
  upActive: { color: colors.gold, fontWeight: '800' },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roll: { gap: 10, alignItems: 'center' },
  rollWindow: { height: 96, overflow: 'hidden', borderRadius: 14, backgroundColor: '#0B0B14', borderWidth: 2, borderColor: colors.gold },
  rollStrip: { flexDirection: 'row', position: 'absolute', left: 0, top: 8 },
  rollItem: { width: ROLL_ITEM - 6, height: 76, marginHorizontal: 3, borderRadius: 12, borderWidth: 2, backgroundColor: '#1A1530', alignItems: 'center', justifyContent: 'center' },
  rollHp: { fontSize: 11, fontWeight: '900' },
  rollPointer: { position: 'absolute', top: 0, bottom: 0, width: 4, backgroundColor: colors.gold },
});
