import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BetSelector, BigButton, Chip, Label, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

const SIZE = 25;
const MINE_OPTIONS = [1, 3, 5, 10];

// Чесний множник з 3% перевагою: обернена ймовірність вижити після k відкриттів.
export function minesMultiplier(mines: number, opened: number): number {
  let p = 1;
  for (let i = 0; i < opened; i++) p *= (SIZE - mines - i) / (SIZE - i);
  return opened === 0 ? 1 : Math.floor((0.97 / p) * 100) / 100;
}

export function MinesGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(50);
  const [mines, setMines] = useState(3);
  const [board, setBoard] = useState<boolean[]>([]); // true = міна
  const [opened, setOpened] = useState<boolean[]>(Array(SIZE).fill(false));
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState({ text: 'Обери кількість мін і почни', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const openedCount = opened.filter(Boolean).length;
  const current = minesMultiplier(mines, openedCount);
  const next = minesMultiplier(mines, openedCount + 1);

  const start = () => {
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const cells = Array(SIZE).fill(false);
    let placed = 0;
    while (placed < mines) {
      const i = Math.floor(Math.random() * SIZE);
      if (!cells[i]) {
        cells[i] = true;
        placed++;
      }
    }
    setBoard(cells);
    setOpened(Array(SIZE).fill(false));
    setActive(true);
    setMessage({ text: 'Шукай діаманти 💎', tone: 'neutral' });
  };

  const reveal = (i: number) => {
    if (!active || opened[i]) return;
    const nextOpened = opened.map((o, idx) => (idx === i ? true : o));
    setOpened(nextOpened);
    if (board[i]) {
      haptic('lose');
      setActive(false);
      setOpened(Array(SIZE).fill(true));
      setMessage({ text: 'Бум! Міна 💣', tone: 'lose' });
      return;
    }
    haptic();
    const count = nextOpened.filter(Boolean).length;
    if (count === SIZE - mines) {
      cashOut(minesMultiplier(mines, count));
    }
  };

  const cashOut = (multiplier = current) => {
    const won = Math.floor(bet * multiplier);
    wallet.win(game.id, won);
    haptic('win');
    setActive(false);
    setOpened(Array(SIZE).fill(true));
    setMessage({ text: `Забрав ×${multiplier}: +${formatCoins(won)} 🪙`, tone: 'win' });
  };

  return (
    <View style={styles.root}>
      <View style={styles.grid}>
        {Array.from({ length: SIZE }, (_, i) => (
          <Pressable key={i} onPress={() => reveal(i)} style={[styles.cell, opened[i] && styles.cellOpen]}>
            <Text style={styles.cellText}>{opened[i] && board.length ? (board[i] ? '💣' : '💎') : ''}</Text>
          </Pressable>
        ))}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      {active ? (
        <>
          <Text style={styles.info}>Зараз ×{current} · Наступна ×{next}</Text>
          <BigButton
            label={`ЗАБРАТИ ${formatCoins(bet * current)}`}
            onPress={() => cashOut()}
            disabled={openedCount === 0}
            color="#F59E0B"
          />
        </>
      ) : (
        <>
          <Label>Кількість мін</Label>
          <View style={styles.row}>
            {MINE_OPTIONS.map((m) => (
              <Chip key={m} label={`${m} 💣`} active={mines === m} onPress={() => setMines(m)} />
            ))}
          </View>
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label="ГРАТИ" onPress={start} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, width: '100%', maxWidth: 360, justifyContent: 'center' },
  cell: {
    width: '18%',
    aspectRatio: 1,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellOpen: { backgroundColor: '#0F172A' },
  cellText: { fontSize: 26 },
  info: { color: colors.gold, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
});
