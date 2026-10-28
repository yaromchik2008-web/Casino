import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  // Уся шахта має влазити в екран, щоб кирку було видно до самого дна.
  const size = Math.max(26, Math.min(Math.floor((Math.min(width, 480) - 32) / MINE_COLS), Math.floor((height - 420) / MINE_ROWS)));
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
    const total = r.frames.length / 3;
    const t0 = Date.now();
    play.current.skip = false;
    const step = () => {
      if (!play.current.alive) return;
      const f = play.current.skip ? total - 1 : Math.min(total - 1, Math.floor(((Date.now() - t0) / 1000) * FPS));
      pos.setValue({ x: r.frames[f * 3] * size - size / 2, y: r.frames[f * 3 + 1] * size - size / 2 });
      rot.setValue(r.frames[f * 3 + 2]);
      let changed = false;
      while (next < r.hits.length && r.hits[next].frame <= f) {
        const h = r.hits[next++];
        cur = strike(cur, h.index, pick.power).blocks;
        value += h.value;
        changed = true;
        setPickHp(h.pickHp);
        setShakes((s) => ({ ...s, [h.index]: (s[h.index] ?? 0) + 1 }));
        if (play.current.skip) continue;
        if (h.exploded) {
          sfx('bomb');
          haptic('win');
        } else if (h.broken.length) sfx('break', 0.6);
        else sfx('hit', 0.5);
        const found = h.broken.map((b) => cur[b]).filter((b) => blockValue(b) > 0);
        if (found.some((b) => b.type === 'diamond')) wallet.track('diamonds', found.filter((b) => b.type === 'diamond').length);
        if (found.length) {
          const best = found.sort((a, b) => blockValue(b) - blockValue(a))[0];
          setMessage({ text: `${BLOCKS[best.type].icon} ${BLOCKS[best.type].name}${h.exploded ? ' (вибух!)' : ''} +${show(h.value * stake)}`, tone: 'win' });
          sfx('coin', 0.6);
        }
      }
      if (changed) {
        setBlocks(cur);
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
          <View style={[styles.sky, { width: size * MINE_COLS, height: size * 1.4 }]}>
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
              style={[styles.pick, { width: size, height: size, transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}
            >
              <View style={[styles.hp, { top: -20, width: size * 1.6, left: -size * 0.3 }]}>
                <Text style={styles.hpText}>❤ {pickHp}</Text>
              </View>
              <Animated.Image
                source={PICKS[tier]}
                style={{ width: size * 0.8, height: size * 0.8, transform: [{ rotate: rot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] }) }] }}
              />
            </Animated.View>
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
  grass: { height: 10, alignSelf: 'stretch', backgroundColor: '#4CAF50', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  sky: { height: 70, alignSelf: 'center', backgroundColor: '#1E2350', borderTopLeftRadius: 12, borderTopRightRadius: 12, overflow: 'hidden' },
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
