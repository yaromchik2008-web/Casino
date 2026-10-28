import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { getSettings, sfx } from '../audio/sound';
import { celebrate, winTier } from '../components/Celebration';
import { BetSelector, BigButton, Panel, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';
import {
  BLOCKS,
  Block,
  MINE_COLS,
  PICKAXES,
  STRIKES,
  autoTarget,
  blockValue,
  generateMine,
  reachable,
  strike,
} from './mineEngine';

// Візерунок «пікселів» для кожного блока свій, але стабільний між рендерами.
function specks(seed: number) {
  let x = (seed * 9301 + 49297) % 233280;
  const next = () => (x = (x * 9301 + 49297) % 233280) / 233280;
  return Array.from({ length: 6 }, () => ({ l: next() * 0.75, t: next() * 0.75, s: 0.14 + next() * 0.12 }));
}

function BlockView({
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
  if (block.broken) return <View style={[styles.cave, { width: size, height: size }]} />;
  const damage = 1 - block.hp / info.hp;
  const ore = info.value > 0 || block.type === 'coal';
  const depth = Math.floor(index / MINE_COLS);
  return (
    <Pressable onPress={onPress} disabled={!canHit}>
      <Animated.View
        style={[
          styles.block,
          {
            width: size,
            height: size,
            backgroundColor: info.color,
            transform: [{ translateX: shake.interpolate({ inputRange: [0, 1], outputRange: [0, 5] }) }],
          },
        ]}
      >
        {specks(index * 7 + depth).map((p, k) => (
          <View
            key={k}
            style={[
              styles.px,
              {
                left: p.l * size,
                top: p.t * size,
                width: p.s * size * (ore ? 1.25 : 1),
                height: p.s * size * (ore ? 1.25 : 1),
                backgroundColor: ore || k % 2 ? info.dark : 'rgba(0,0,0,0.18)',
                borderRadius: ore ? 2 : 0,
              },
            ]}
          />
        ))}
        {block.type === 'tnt' && <View style={[styles.tntBand, { top: size * 0.38, height: size * 0.24 }]} />}
        {info.icon && (block.type === 'chest' || block.type === 'tnt' || block.type === 'diamond') ? (
          <Text style={{ fontSize: size * 0.4 }}>{info.icon}</Text>
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${Math.min(0.35, depth * 0.02) + (canHit ? 0 : 0.3)})` }]} />
        {damage > 0 && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${damage * 0.35})` }]}>
            <Text style={[styles.crack, { fontSize: size * 0.5 }]}>{damage > 0.6 ? '💢' : '⚡'}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// Кирка, що сама стрибає на блок і б'є.
function FlyingPick({ x, y, size, hitKey }: { x: number; y: number; size: number; hitKey: number }) {
  const jump = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (getSettings().lite) return;
    jump.setValue(0);
    Animated.timing(jump, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [hitKey, jump]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.pick,
        {
          width: size,
          height: size,
          transform: [
            { translateX: x + size * 0.35 },
            { translateY: jump.interpolate({ inputRange: [0, 0.5, 1], outputRange: [y - size * 0.9, y - size * 0.25, y - size * 0.45] }) },
            { rotate: jump.interpolate({ inputRange: [0, 0.6, 1], outputRange: ['-50deg', '35deg', '0deg'] }) },
          ],
        },
      ]}
    >
      <Text style={{ fontSize: size * 0.62 }}>⛏️</Text>
    </Animated.View>
  );
}

// У дуелі всі грають дерев'яною киркою і віртуальною ставкою, очки = знайдене × 1000.
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
  const { width } = useWindowDimensions();
  const [bet, setBet] = useState(100);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [strikes, setStrikes] = useState(STRIKES);
  const [runValue, setRunValue] = useState(0);
  const [runBet, setRunBet] = useState(0);
  const [shakes, setShakes] = useState<Record<number, number>>({});
  const [auto, setAuto] = useState(true);
  const [target, setTarget] = useState(-1);
  const [hitKey, setHitKey] = useState(0);
  const [message, setMessage] = useState({ text: 'Копай глибше: там цінніша руда', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const pick = duel ? PICKAXES[0] : PICKAXES[wallet.state.pickaxe];
  const nextPick = PICKAXES[wallet.state.pickaxe + 1];
  const size = Math.floor((Math.min(width, 480) - 40 - (MINE_COLS - 1) * 2) / MINE_COLS);

  const show = (v: number) => (duel ? `${Math.round(v)} очок` : formatCoins(v));

  const start = () => {
    if (duel) {
      setBlocks(generateMine());
      setStrikes(STRIKES);
      setRunValue(0);
      setRunBet(DUEL_MINE_BET);
      setTarget(-1);
      setAuto(true);
      setMessage({ text: `Дуель: ${STRIKES} ударів, хто знайде більше`, tone: 'neutral' });
      return;
    }
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо коштів', tone: 'lose' });
      return;
    }
    setBlocks(generateMine());
    setStrikes(STRIKES);
    setRunValue(0);
    setRunBet(bet);
    setTarget(-1);
    setAuto(true);
    setMessage({ text: `${STRIKES} ударів. Кирка копає сама, тапни блок, щоб змінити ціль`, tone: 'neutral' });
  };

  const finish = async (value: number) => {
    const won = Math.round(value * runBet);
    if (duel) {
      setBlocks(null);
      duel(won);
      return;
    }
    if (won > 0) {
      wallet.win(game.id, won);
      if (winTier(won, runBet)) await celebrate({ kind: 'win', amount: won, bet: runBet });
      else sfx('cash');
      setMessage({ text: `Заїзд завершено: +${formatCoins(won)}`, tone: 'win' });
    } else setMessage({ text: 'Порожня шахта. Спробуй ще!', tone: 'lose' });
    setBlocks(null);
  };

  const hit = (i: number) => {
    if (!blocks || strikes <= 0 || !reachable(blocks, i)) return;
    setTarget(i);
    setHitKey((k) => k + 1);
    const r = strike(blocks, i, pick.power);
    setShakes((s) => ({ ...s, [i]: (s[i] ?? 0) + 1 }));
    setBlocks(r.blocks);
    const left = strikes - 1;
    setStrikes(left);
    let value = runValue;
    if (r.broken.length) {
      value += r.value;
      setRunValue(value);
      onProgress?.(Math.round(value * runBet));
      if (r.exploded) {
        sfx('bomb');
        haptic('win');
      } else sfx('break', 0.7);
      const found = r.broken.map((b) => r.blocks[b]).filter((b) => blockValue(b) > 0);
      if (found.some((b) => b.type === 'diamond')) wallet.track('diamonds', found.filter((b) => b.type === 'diamond').length);
      if (found.length) {
        const best = found.sort((a, b) => blockValue(b) - blockValue(a))[0];
        setMessage({
          text: `${BLOCKS[best.type].icon} ${BLOCKS[best.type].name}${r.exploded ? ' (вибух!)' : ''} +${show(r.value * runBet)}`,
          tone: 'win',
        });
        sfx('coin', 0.6);
      } else if (r.exploded) setMessage({ text: '🧨 Бабах!', tone: 'neutral' });
    } else {
      sfx('hit', 0.6);
      haptic('tap');
    }
    if (left <= 0) setTimeout(() => finish(value), 500);
  };

  useEffect(() => {
    if (autoStart) start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Автокопання: кирка сама обирає блок і б'є, поки є удари. Тап по блоку змінює ціль.
  useEffect(() => {
    if (!blocks || strikes <= 0 || !auto) return;
    const t = setTimeout(() => {
      const keep = target >= 0 && !blocks[target].broken && reachable(blocks, target);
      const next = keep ? target : autoTarget(blocks, pick.power);
      if (next >= 0) hit(next);
    }, getSettings().fastSpin ? 220 : 380);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, strikes, auto]);

  const gap = 2;
  const pickPos = target >= 0 ? { x: (target % MINE_COLS) * (size + gap), y: Math.floor(target / MINE_COLS) * (size + gap) } : null;

  return (
    <View style={styles.root}>
      <Panel style={styles.info}>
        <Text style={styles.infoText}>
          {pick.emoji} {pick.name} · сила {pick.power}
        </Text>
        {blocks && (
          <>
            <View style={styles.energy}>
              <View style={[styles.energyFill, { width: `${(strikes / STRIKES) * 100}%` }]} />
            </View>
            <Text style={styles.infoText}>
              Ударів: {strikes} · Знайдено: {show(runValue * runBet)}
            </Text>
          </>
        )}
      </Panel>
      <ResultLine text={message.text} tone={message.tone} />
      {blocks ? (
        <View style={styles.mine}>
          <View style={styles.grass} />
          <View style={[styles.grid, { width: size * MINE_COLS + 2 * (MINE_COLS - 1) }]}>
            {blocks.map((b, i) => (
              <BlockView
                key={i}
                block={b}
                index={i}
                size={size}
                canHit={strikes > 0 && reachable(blocks, i)}
                onPress={() => (auto ? setTarget(i) : hit(i))}
                shakeKey={shakes[i] ?? 0}
              />
            ))}
            {pickPos && strikes > 0 && <FlyingPick x={pickPos.x} y={pickPos.y} size={size} hitKey={hitKey} />}
          </View>
          <View style={styles.btnRow}>
            <BigButton label={auto ? '⏸ ПАУЗА' : '▶ АВТО'} color={colors.blue} onPress={() => setAuto(!auto)} style={styles.half} />
            <BigButton label="ЗАБРАТИ" color={colors.accent} onPress={() => finish(runValue)} style={styles.half} />
          </View>
        </View>
      ) : duel ? (
        <BigButton label="ПОЧАТИ ДУЕЛЬ" onPress={start} />
      ) : (
        <>
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label={`У ШАХТУ · ${formatCoins(bet)}`} onPress={start} />
          <Panel style={styles.upgrade}>
            <Text style={styles.upTitle}>Кирки</Text>
            {PICKAXES.map((p, i) => (
              <Text key={p.name} style={[styles.upRow, i === wallet.state.pickaxe && styles.upActive]}>
                {p.emoji} {p.name}: сила {p.power}
                {i === wallet.state.pickaxe ? ' · твоя' : i > wallet.state.pickaxe ? ` · ${formatCoins(p.price)}` : ' ✓'}
              </Text>
            ))}
            {nextPick && (
              <BigButton
                label={`КУПИТИ ${nextPick.name.toUpperCase()}`}
                color={colors.blue}
                disabled={wallet.state.balance < nextPick.price}
                onPress={() => {
                  if (wallet.buyPickaxe(wallet.state.pickaxe + 1)) {
                    sfx('cash');
                    wallet.notify(`Нова кирка: ${nextPick.name}!`);
                  }
                }}
              />
            )}
          </Panel>
          <Panel>
            <Text style={styles.upTitle}>Що в шахті (× ставка)</Text>
            {(['coal', 'iron', 'gold', 'diamond'] as const).map((t) => (
              <Text key={t} style={styles.upRow}>
                {BLOCKS[t].icon} {BLOCKS[t].name}: міцність {BLOCKS[t].hp}, ×{BLOCKS[t].value}
              </Text>
            ))}
            <Text style={styles.upRow}>🧰 Скриня: випадковий приз до ×1.6</Text>
            <Text style={styles.upRow}>🧨 Динаміт: підриває всі блоки навколо</Text>
            <Text style={styles.upRow}>Бити можна лише блоки біля поверхні або поруч із викопаними. Що глибше, то більше руди.</Text>
          </Panel>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  info: { gap: 6, alignItems: 'center' },
  infoText: { color: colors.text, fontWeight: '800' },
  energy: { width: '100%', height: 10, borderRadius: 5, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  energyFill: { height: '100%', backgroundColor: colors.green },
  mine: { gap: 10, alignItems: 'center' },
  grass: { height: 10, alignSelf: 'stretch', backgroundColor: '#4CAF50', borderTopLeftRadius: 6, borderTopRightRadius: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, justifyContent: 'center', marginTop: -10 },
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
  btnRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  half: { flex: 1 },
  crack: { position: 'absolute', alignSelf: 'center', top: '22%', opacity: 0.85 },
  cave: { backgroundColor: '#140F0B', borderWidth: 1, borderColor: '#0A0705' },
  upgrade: { gap: 6 },
  upTitle: { color: colors.gold, fontWeight: '900', fontSize: 15, marginBottom: 4 },
  upRow: { color: colors.text, fontSize: 13 },
  upActive: { color: colors.gold, fontWeight: '800' },
});
