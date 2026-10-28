import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { playMusic, sfx, useSettings } from '../audio/sound';
import { celebrate, winTier } from '../components/Celebration';
import { Reel } from '../components/Reel';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { WinCounter } from '../components/WinCounter';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins, formatShort } from '../theme';
import { GameInfo } from './catalog';
import {
  BASE_COIN_CHANCE,
  BASE_ROWS,
  Bonus,
  COIN_LABEL,
  HCoin,
  HW_COLS,
  HW_ROWS,
  JACKPOTS,
  RESPINS,
  TRIGGER_COINS,
  UNLOCK_AT,
  baseCoin,
  bonusTotal,
  respin,
  startBonus,
} from './holdwinEngine';
import { Grid, SlotSymbol, evaluateGrid, paylines, randomSymbol, spinGrid } from './slotEngine';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const COIN_SYMBOL: SlotSymbol = { id: 'coin', emoji: '🪙', weight: 0, pays: [] };

type BaseCell = { sym: SlotSymbol; coin: HCoin | null };

const COIN_STYLE: Record<HCoin['type'], { bg: string; emoji: string }> = {
  value: { bg: '#F59E0B', emoji: '🪙' },
  mini: { bg: '#22C55E', emoji: '🟢' },
  minor: { bg: '#3B82F6', emoji: '🔵' },
  major: { bg: '#EF4444', emoji: '🔴' },
  boost: { bg: '#A855F7', emoji: '⚡' },
  x2: { bg: '#EC4899', emoji: '✖️' },
  collect: { bg: '#14B8A6', emoji: '🧲' },
};

function CoinView({ coin, bet, size, fresh }: { coin: HCoin; bet: number; size: number; fresh?: boolean }) {
  const scale = useRef(new Animated.Value(fresh ? 0 : 1)).current;
  useEffect(() => {
    if (!fresh) return;
    Animated.spring(scale, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }).start();
  }, [fresh, scale]);
  const st = COIN_STYLE[coin.type];
  const label = COIN_LABEL[coin.type];
  return (
    <Animated.View style={[styles.coin, { width: size, height: size, backgroundColor: st.bg, transform: [{ scale }] }]}>
      <Text style={{ fontSize: size * 0.34 }}>{st.emoji}</Text>
      {label ? <Text style={styles.coinLabel}>{label}</Text> : null}
      {coin.value > 0 && <Text style={styles.coinValue}>{formatShort(coin.value * bet)}</Text>}
    </Animated.View>
  );
}

export function HoldWinGame({ game }: { game: GameInfo }) {
  const config = game.slot!;
  const wallet = useWallet();
  const settings = useSettings();
  const { width } = useWindowDimensions();
  const [bet, setBet] = useState(100);
  const [cells, setCells] = useState<BaseCell[][]>(() =>
    spinGrid(config).map((col) => col.map((sym) => ({ sym, coin: null }))),
  );
  const [spinning, setSpinning] = useState<boolean[]>(Array(5).fill(false));
  const [highlight, setHighlight] = useState<boolean[][]>([]);
  const [bonus, setBonus] = useState<Bonus | null>(null);
  const [waitTap, setWaitTap] = useState(false);
  const tapRef = useRef<(() => void) | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const [auto, setAuto] = useState(0);
  const [lastWin, setLastWin] = useState({ amount: 0, key: 0 });
  const [message, setMessage] = useState({ text: `${TRIGGER_COINS}+ 🪙 запускають бонус`, tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const alive = useRef(true);
  const busy = spinning.some(Boolean) || !!bonus;
  const fast = settings.fastSpin;

  useEffect(() => () => void (alive.current = false), []);

  const size = Math.min(66, Math.floor((Math.min(width, 480) - 56 - 5 * 6) / 5));

  const runBonus = async (coins: (HCoin | null)[]) => {
    setAuto(0);
    wallet.track('bonuses');
    playMusic('bonus');
    await celebrate({
      kind: 'intro',
      emoji: '🏺',
      title: 'УТРИМАЙ І ВИГРАЙ',
      subtitle: `${RESPINS} оберти. Кожна нова монета повертає їх до ${RESPINS}!`,
      color: game.colors[0],
    });
    let b = startBonus(coins);
    setBonus(b);
    await sleep(800);
    for (;;) {
      if (!alive.current) return;
      // Кожен оберт бонусу гравець запускає сам.
      await new Promise<void>((r) => {
        tapRef.current = r;
        setWaitTap(true);
      });
      setWaitTap(false);
      if (!alive.current) return;
      sfx('spin', 0.3);
      await sleep(fast ? 400 : 750);
      const r = respin(b);
      b = r.bonus;
      setFresh(new Set(r.landed.map((l) => l.index)));
      setBonus(b);
      if (r.landed.length) {
        sfx('lock');
        haptic('tap');
        if (r.landed.some((l) => l.coin.type === 'x2' || l.coin.type === 'boost' || l.coin.type === 'collect')) {
          await sleep(300);
          sfx('cash');
        }
      }
      if (r.unlocked) {
        sfx('bonus', 0.6);
        setMessage({ text: 'Відкрито новий ряд!', tone: 'win' });
      }
      if (r.done) break;
    }
    await sleep(900);
    const total = Math.round(bonusTotal(b) * bet);
    wallet.win(game.id, total);
    setLastWin((w) => ({ amount: total, key: w.key + 1 }));
    await celebrate({ kind: 'total', title: b.grand ? 'ГРАНД ДЖЕКПОТ!' : 'ВИГРАШ БОНУСУ', amount: total, emoji: b.grand ? '👑' : '🏺' });
    if (!alive.current) return;
    setBonus(null);
    setFresh(new Set());
    playMusic(game.music);
    setMessage({ text: `Бонус приніс ${formatCoins(total)}`, tone: 'win' });
  };

  const spin = async () => {
    if (busy) return;
    if (!wallet.bet(game.id, 'slot', bet)) {
      setMessage({ text: 'Недостатньо коштів. Забери бонус!', tone: 'lose' });
      setAuto(0);
      return;
    }
    const grid = spinGrid(config);
    const coins: (HCoin | null)[] = [];
    const next: BaseCell[][] = grid.map((col) => col.map((sym) => ({ sym, coin: null as HCoin | null })));
    const evalGrid: Grid = grid.map((col) => [...col]);
    for (let row = 0; row < BASE_ROWS; row++)
      for (let col = 0; col < 5; col++) {
        if (Math.random() < BASE_COIN_CHANCE) {
          const c = baseCoin();
          coins.push(c);
          next[col][row].coin = c;
          evalGrid[col][row] = COIN_SYMBOL;
        } else coins.push(null);
      }
    const outcome = evaluateGrid(config, evalGrid, bet);
    setCells(next);
    setHighlight([]);
    setSpinning(Array(5).fill(true));
    sfx('spin', 0.5);
    setMessage({ text: 'Крутимо...', tone: 'neutral' });
    const base = fast ? 350 : 700;
    const step = fast ? 130 : 260;
    for (let i = 0; i < 5; i++) {
      await sleep(i === 0 ? base : step);
      if (!alive.current) return;
      setSpinning((prev) => prev.map((v, idx) => (idx === i ? false : v)));
      sfx(next[i].some((c) => c.coin) ? 'lock' : 'stop', 0.5);
    }
    const lines = paylines(config);
    const marks = Array.from({ length: 5 }, () => Array(BASE_ROWS).fill(false));
    for (const w of outcome.lineWins) for (let reel = 0; reel < w.count; reel++) marks[reel][lines[w.line][reel]] = true;
    setHighlight(marks);
    if (outcome.win > 0) {
      wallet.win(game.id, outcome.win);
      setLastWin((w) => ({ amount: outcome.win, key: w.key + 1 }));
      setMessage({ text: `+${formatCoins(outcome.win)}`, tone: 'win' });
      haptic('win');
      if (winTier(outcome.win, bet)) await celebrate({ kind: 'win', amount: outcome.win, bet });
      else sfx('win');
    } else setMessage({ text: 'Ще раз?', tone: 'lose' });
    const count = coins.filter(Boolean).length;
    if (count >= TRIGGER_COINS) await runBonus(coins);
    else if (count >= 4) setMessage({ text: `${count} 🪙 з ${TRIGGER_COINS}. Майже!`, tone: 'neutral' });
  };

  useEffect(() => {
    if (busy || auto <= 0) return;
    const t = setTimeout(() => {
      setAuto((n) => n - 1);
      spin();
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, auto]);

  const jackpotBar = (
    <View style={styles.jpRow}>
      {(['mini', 'minor', 'major', 'grand'] as const).map((k) => (
        <View key={k} style={[styles.jp, { backgroundColor: k === 'grand' ? '#7C2D12' : COIN_STYLE[k].bg }]}>
          <Text style={styles.jpName}>{k === 'grand' ? 'ГРАНД' : COIN_LABEL[k]}</Text>
          <Text style={styles.jpValue}>{formatShort(JACKPOTS[k] * bet)} ₴</Text>
        </View>
      ))}
    </View>
  );

  if (bonus) {
    const cs = Math.min(60, Math.floor((Math.min(width, 480) - 56 - 4 * 6) / 5));
    const total = bonusTotal(bonus);
    return (
      <View style={styles.root}>
        {jackpotBar}
        <View style={styles.respins}>
          {Array.from({ length: RESPINS }, (_, i) => (
            <View key={i} style={[styles.dot, i < bonus.respins && styles.dotOn]} />
          ))}
          <Text style={styles.respinText}>ОБЕРТИ: {bonus.respins}</Text>
        </View>
        <View style={[styles.machine, { borderColor: colors.gold, backgroundColor: '#1C0F05' }]}>
          {Array.from({ length: HW_ROWS }, (_, row) => {
            const locked = row < bonus.firstOpenRow;
            const need = UNLOCK_AT[HW_ROWS - BASE_ROWS - 1 - row];
            return (
              <View key={row} style={styles.bonusRow}>
                {locked ? (
                  <View style={[styles.locked, { height: cs, width: cs * HW_COLS + 6 * (HW_COLS - 1) }]}>
                    <Text style={styles.lockedText}>
                      🔒 Збери {need} нових монет ({bonus.collected}/{need})
                    </Text>
                  </View>
                ) : (
                  Array.from({ length: HW_COLS }, (_, col) => {
                    const i = row * HW_COLS + col;
                    const c = bonus.cells[i];
                    return (
                      <View key={col} style={[styles.slotCell, { width: cs, height: cs }]}>
                        {c && <CoinView coin={c} bet={bet} size={cs - 6} fresh={fresh.has(i)} />}
                      </View>
                    );
                  })
                )}
              </View>
            );
          })}
        </View>
        <Text style={styles.bonusTotal}>Разом: {formatCoins(total * bet)}</Text>
        <BigButton label={waitTap ? 'КРУТИТИ ОБЕРТ' : '...'} disabled={!waitTap} onPress={() => tapRef.current?.()} />
        <ResultLine text={message.text} tone={message.tone} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {jackpotBar}
      <View style={[styles.machine, { borderColor: game.colors[0] }]}>
        <View style={styles.reels}>
          {cells.map((column, i) => (
            <Reel
              key={i}
              items={column}
              spinning={spinning[i]}
              size={size}
              win={highlight[i]}
              speed={fast ? 160 : 240}
              randomItem={() => ({ sym: randomSymbol(config), coin: Math.random() < BASE_COIN_CHANCE ? baseCoin() : null })}
              render={(c) =>
                c.coin ? (
                  <CoinView coin={c.coin} bet={bet} size={size - 8} />
                ) : (
                  <Text style={{ fontSize: size * 0.55 }}>{c.sym.emoji}</Text>
                )
              }
            />
          ))}
        </View>
      </View>
      <WinCounter amount={lastWin.amount} countKey={lastWin.key} />
      <ResultLine text={message.text} tone={message.tone} />
      <BetSelector value={bet} onChange={setBet} disabled={busy} />
      <BigButton label={busy ? '...' : 'КРУТИТИ'} onPress={spin} disabled={busy || auto > 0} />
      <View style={styles.autoRow}>
        <Chip label={auto > 0 ? `Стоп (${auto})` : 'Авто ×10'} active={auto > 0} onPress={() => setAuto(auto > 0 ? 0 : 10)} />
        <Chip label="Авто ×50" onPress={() => setAuto(50)} disabled={auto > 0} />
      </View>
      <View style={styles.paytable}>
        <Text style={styles.payTitle}>Як грати</Text>
        <Text style={styles.payText}>
          🪙 {TRIGGER_COINS}+ монет запускають «Утримай і виграй». Монети фіксуються, дається {RESPINS} оберти, кожна нова монета повертає лічильник до {RESPINS}.
        </Text>
        <Text style={styles.payText}>🔒 Зверху 2 заблоковані ряди: відкриваються після {UNLOCK_AT[0]} і {UNLOCK_AT[1]} нових монет.</Text>
        <Text style={styles.payText}>⚡ Буст додає свій номінал усім монетам. ✖️ подвоює всі. 🧲 Збір забирає суму всіх монет собі.</Text>
        <Text style={styles.payText}>🟢 Міні ×{JACKPOTS.mini}, 🔵 Мінор ×{JACKPOTS.minor}, 🔴 Мажор ×{JACKPOTS.major}, 👑 Гранд ×{JACKPOTS.grand} за все поле.</Text>
        <Text style={[styles.payTitle, { marginTop: 6 }]}>Лінії (× ставка на лінію, ліній: {paylines(config).length})</Text>
        {[...config.symbols].reverse().map((s) => (
          <View key={s.id} style={styles.payRow}>
            <Text style={styles.payEmoji}>{s.emoji}</Text>
            <Text style={styles.payText}>
              {s.id === config.wild ? 'Wild · ' : ''}
              {s.pays.map((p) => `×${p}`).join(' / ')}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  jpRow: { flexDirection: 'row', gap: 6, width: '100%' },
  jp: { flex: 1, borderRadius: 12, paddingVertical: 6, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  jpName: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  jpValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  machine: { padding: 10, borderRadius: 20, borderWidth: 4, backgroundColor: '#12102E', alignItems: 'center', gap: 6 },
  reels: { flexDirection: 'row', gap: 6 },
  coin: { borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FDE68A' },
  coinLabel: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  coinValue: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  respins: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.surfaceAlt, borderWidth: 2, borderColor: colors.gold },
  dotOn: { backgroundColor: colors.gold },
  respinText: { color: colors.gold, fontWeight: '900', marginLeft: 4 },
  bonusRow: { flexDirection: 'row', gap: 6 },
  slotCell: { borderRadius: 12, backgroundColor: '#3A2410', alignItems: 'center', justifyContent: 'center' },
  locked: {
    borderRadius: 12,
    backgroundColor: '#0B0603',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#6B4A1F',
  },
  lockedText: { color: '#D6B27A', fontWeight: '800', fontSize: 12 },
  bonusTotal: { color: colors.gold, fontSize: 22, fontWeight: '900' },
  autoRow: { flexDirection: 'row', gap: 10 },
  paytable: { width: '100%', backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 4 },
  payTitle: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  payText: { color: colors.text, fontSize: 13, flex: 1 },
});
