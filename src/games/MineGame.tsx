import { useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { sfx } from '../audio/sound';
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
  blockValue,
  generateMine,
  reachable,
  strike,
} from './mineEngine';

function BlockView({
  block,
  size,
  canHit,
  onPress,
  shakeKey,
}: {
  block: Block;
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
  const px = size / 4;
  return (
    <Pressable onPress={onPress} disabled={!canHit}>
      <Animated.View
        style={[
          styles.block,
          {
            width: size,
            height: size,
            backgroundColor: info.color,
            opacity: canHit ? 1 : 0.55,
            transform: [{ translateX: shake.interpolate({ inputRange: [0, 1], outputRange: [0, 5] }) }],
          },
        ]}
      >
        {/* «Пікселі» текстури: кілька темніших квадратиків */}
        <View style={[styles.px, { width: px, height: px, left: px * 0.4, top: px * 0.5, backgroundColor: info.dark }]} />
        <View style={[styles.px, { width: px, height: px, left: px * 2.4, top: px * 1.6, backgroundColor: info.dark }]} />
        <View style={[styles.px, { width: px * 0.8, height: px * 0.8, left: px * 1.2, top: px * 2.6, backgroundColor: info.dark }]} />
        {info.icon ? <Text style={{ fontSize: size * 0.42 }}>{info.icon}</Text> : null}
        {damage > 0 && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(0,0,0,${damage * 0.45})` }]}>
            <Text style={[styles.crack, { fontSize: size * 0.5 }]}>{damage > 0.6 ? '💢' : '⚡'}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

// У дуелі всі грають дерев'яною киркою і віртуальною ставкою, очки = знайдене × 1000.
export const DUEL_MINE_BET = 1000;

export function MineGame({ game, duel }: { game: GameInfo; duel?: (points: number) => void }) {
  const wallet = useWallet();
  const { width } = useWindowDimensions();
  const [bet, setBet] = useState(100);
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [strikes, setStrikes] = useState(STRIKES);
  const [runValue, setRunValue] = useState(0);
  const [runBet, setRunBet] = useState(0);
  const [shakes, setShakes] = useState<Record<number, number>>({});
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
    setMessage({ text: `${STRIKES} ударів. Тапай по блоках!`, tone: 'neutral' });
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
    const r = strike(blocks, i, pick.power);
    setShakes((s) => ({ ...s, [i]: (s[i] ?? 0) + 1 }));
    setBlocks(r.blocks);
    const left = strikes - 1;
    setStrikes(left);
    let value = runValue;
    if (r.broken.length) {
      value += r.value;
      setRunValue(value);
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
                size={size}
                canHit={strikes > 0 && reachable(blocks, i)}
                onPress={() => hit(i)}
                shakeKey={shakes[i] ?? 0}
              />
            ))}
          </View>
          <BigButton label="ЗАБРАТИ ЗНАХІДКИ" color={colors.accent} onPress={() => finish(runValue)} />
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
  block: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: 2, borderColor: 'rgba(0,0,0,0.25)' },
  px: { position: 'absolute' },
  crack: { position: 'absolute', alignSelf: 'center', top: '22%', opacity: 0.85 },
  cave: { backgroundColor: '#1A1410' },
  upgrade: { gap: 6 },
  upTitle: { color: colors.gold, fontWeight: '900', fontSize: 15, marginBottom: 4 },
  upRow: { color: colors.text, fontSize: 13 },
  upActive: { color: colors.gold, fontWeight: '800' },
});
