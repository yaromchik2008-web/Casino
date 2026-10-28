import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { BetSelector, BigButton, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

export const TOWER_FLOORS = 9;

// Перша сходинка ×1.9, далі кожна подвоює: ставка 15 ₴ → 28, 57, 114 … 7 296 ₴ (RTP 95%).
export function towerMultiplier(floor: number) {
  return floor <= 0 ? 1 : 1.9 * 2 ** (floor - 1);
}

type Cell = 'hidden' | 'safe' | 'trap' | 'trap-shown' | 'safe-shown';

export function TowerGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(1500);
  const [floor, setFloor] = useState(0); // скільки сходинок пройдено
  const [active, setActive] = useState(false);
  const [safeSide, setSafeSide] = useState<number[]>([]);
  const [cells, setCells] = useState<Cell[][]>(() => Array.from({ length: TOWER_FLOORS }, () => ['hidden', 'hidden']));
  const [message, setMessage] = useState({ text: 'Обирай ліву чи праву плиту. Одна з них провалюється!', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const prize = (f: number) => Math.floor(bet * towerMultiplier(f));

  const start = () => {
    if (!wallet.bet(game.id, 'fast', bet)) return setMessage({ text: 'Недостатньо коштів', tone: 'lose' });
    setSafeSide(Array.from({ length: TOWER_FLOORS }, () => (Math.random() < 0.5 ? 0 : 1)));
    setCells(Array.from({ length: TOWER_FLOORS }, () => ['hidden', 'hidden']));
    setFloor(0);
    setActive(true);
    sfx('click');
    setMessage({ text: `Перша сходинка: ${formatCoins(prize(1))}`, tone: 'neutral' });
  };

  const reveal = (all: Cell[][], from: number) =>
    all.map((row, f) =>
      f < from ? row : (row.map((c, side) => (c !== 'hidden' ? c : side === safeSide[f] ? 'safe-shown' : 'trap-shown')) as Cell[]),
    );

  const cashOut = (f = floor, grid = cells) => {
    const won = prize(f);
    wallet.win(game.id, won);
    setActive(false);
    setCells(reveal(grid, f));
    sfx(f >= 6 ? 'bigwin' : 'cash');
    haptic('win');
    setMessage({ text: f === TOWER_FLOORS ? `Вершина! +${formatCoins(won)}` : `Забрав ×${towerMultiplier(f)}: +${formatCoins(won)}`, tone: 'win' });
  };

  const step = (side: number) => {
    if (!active) return;
    const f = floor;
    const ok = safeSide[f] === side;
    const grid = cells.map((row, i) => (i === f ? (row.map((c, s) => (s === side ? (ok ? 'safe' : 'trap') : c)) as Cell[]) : row));
    if (!ok) {
      setCells(reveal(grid, f));
      setActive(false);
      sfx('lose');
      haptic('lose');
      setMessage({ text: 'Плита провалилась 💥 Спробуй ще!', tone: 'lose' });
      return;
    }
    const next = f + 1;
    setFloor(next);
    setCells(grid);
    sfx('coin', 0.7);
    haptic();
    if (next === TOWER_FLOORS) return cashOut(next, grid);
    setMessage({ text: `Є! Зараз ${formatCoins(prize(next))}, далі ${formatCoins(prize(next + 1))}`, tone: 'win' });
  };

  const lost = !active && cells.some((row) => row.includes('trap'));
  return (
    <View style={styles.root}>
      <View style={[styles.head, lost && styles.headLost]}>
        <Text style={styles.headLabel}>{lost ? 'ПРОГРАШ' : active && floor > 0 ? 'ЗАРАЗ МОЖНА ЗАБРАТИ' : 'МАКСИМАЛЬНИЙ ВИГРАШ'}</Text>
        <Text style={[styles.headValue, lost && styles.headValueLost]}>
          {lost ? `−${formatCoins(bet)}` : formatCoins(active && floor > 0 ? prize(floor) : prize(TOWER_FLOORS))}
        </Text>
      </View>
      <View style={styles.tower}>
        {Array.from({ length: TOWER_FLOORS }, (_, k) => TOWER_FLOORS - 1 - k).map((f) => {
          const current = active && f === floor;
          return (
            <View key={f} style={styles.row}>
              <Text style={[styles.num, current && styles.numActive]}>{f + 1}</Text>
              {[0, 1].map((side) => {
                const c = cells[f][side];
                const shown = c === 'safe-shown' || c === 'trap-shown';
                return (
                  <Pressable
                    key={side}
                    onPress={() => current && step(side)}
                    style={[
                      styles.tile,
                      current && styles.tileActive,
                      (c === 'safe' || c === 'safe-shown') && styles.safe,
                      (c === 'trap' || c === 'trap-shown') && styles.trap,
                      shown && styles.shown,
                    ]}
                  >
                    {c === 'hidden' ? (
                      <Text style={[styles.amount, current && styles.amountActive]}>+{formatCoins(prize(f + 1))}</Text>
                    ) : (
                      <Text style={styles.tileIcon}>{c === 'safe' || c === 'safe-shown' ? '💎' : '💥'}</Text>
                    )}
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      {active ? (
        <BigButton
          label={floor > 0 ? `ЗАБРАТИ ${formatCoins(prize(floor))}` : 'ОБЕРИ КЛІТИНКУ'}
          color={floor > 0 ? colors.green : colors.surfaceAlt}
          disabled={floor === 0}
          onPress={() => cashOut()}
        />
      ) : (
        <>
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label={`ГРАТИ · ${formatCoins(bet)}`} color="#F59E0B" onPress={start} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  head: { width: '100%', maxWidth: 400, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: '#1F2937', borderWidth: 1, borderColor: '#374151' },
  headLost: { backgroundColor: '#3B1111', borderColor: '#7F1D1D' },
  headLabel: { color: colors.muted, fontWeight: '900', fontSize: 11, letterSpacing: 1 },
  headValue: { color: colors.gold, fontWeight: '900', fontSize: 28 },
  headValueLost: { color: colors.red },
  tower: { gap: 6, width: '100%', maxWidth: 400 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  num: { width: 18, color: colors.muted, fontWeight: '800', fontSize: 12, textAlign: 'center' },
  numActive: { color: '#22D3EE' },
  tile: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileActive: { borderColor: '#22D3EE', borderWidth: 2, backgroundColor: '#0E3A48' },
  safe: { backgroundColor: '#15803D', borderColor: '#4ADE80' },
  trap: { backgroundColor: '#9F1239', borderColor: '#F43F5E' },
  shown: { opacity: 0.4 },
  amount: { color: '#94A3B8', fontWeight: '800', fontSize: 13 },
  amountActive: { color: '#FFFFFF' },
  tileIcon: { fontSize: 20 },
});
