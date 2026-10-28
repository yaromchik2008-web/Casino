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

  return (
    <View style={styles.root}>
      <View style={styles.tower}>
        {Array.from({ length: TOWER_FLOORS }, (_, k) => TOWER_FLOORS - 1 - k).map((f) => {
          const current = active && f === floor;
          return (
            <View key={f} style={[styles.row, current && styles.rowActive]}>
              {[0, 1].map((side) => {
                const c = cells[f][side];
                return (
                  <Pressable
                    key={side}
                    onPress={() => current && step(side)}
                    style={[
                      styles.tile,
                      current && styles.tileActive,
                      c === 'safe' && styles.safe,
                      c === 'trap' && styles.trap,
                      (c === 'safe-shown' || c === 'trap-shown') && styles.shown,
                    ]}
                  >
                    <Text style={styles.tileText}>
                      {c === 'safe' || c === 'safe-shown' ? '💎' : c === 'trap' || c === 'trap-shown' ? '💀' : current ? '?' : ''}
                    </Text>
                  </Pressable>
                );
              })}
              <Text style={[styles.prize, f < floor && styles.prizeDone]}>{formatCoins(prize(f + 1))}</Text>
            </View>
          );
        })}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      {active ? (
        <BigButton
          label={floor > 0 ? `ЗАБРАТИ ${formatCoins(prize(floor))}` : 'ОБЕРИ ПЛИТУ'}
          color="#F59E0B"
          disabled={floor === 0}
          onPress={() => cashOut()}
        />
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
  tower: { gap: 5, width: '100%', maxWidth: 380, padding: 10, borderRadius: 18, backgroundColor: '#1B1433', borderWidth: 2, borderColor: '#6D28D9' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, padding: 3 },
  rowActive: { backgroundColor: 'rgba(250,204,21,0.15)' },
  tile: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileActive: { borderColor: colors.gold, borderWidth: 2, backgroundColor: '#3B2F63' },
  safe: { backgroundColor: '#166534', borderColor: '#22C55E' },
  trap: { backgroundColor: '#7F1D1D', borderColor: colors.red },
  shown: { opacity: 0.45 },
  tileText: { fontSize: 20, color: colors.text, fontWeight: '900' },
  prize: { width: 96, textAlign: 'right', color: colors.muted, fontWeight: '800', fontSize: 12 },
  prizeDone: { color: colors.gold },
});
