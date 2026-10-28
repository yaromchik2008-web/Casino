import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PlayingCard } from '../components/PlayingCard';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { Card, newDeck } from './cards';
import { GameInfo } from './catalog';

type Side = 'player' | 'banker' | 'tie';
const PAYOUTS: Record<Side, number> = { player: 2, banker: 1.95, tie: 9 };
const LABELS: Record<Side, string> = { player: 'Гравець', banker: 'Банкір', tie: 'Нічия' };

function value(c: Card) {
  if (c.rank === 14) return 1;
  return c.rank >= 10 ? 0 : c.rank;
}

function score(cards: Card[]) {
  return cards.reduce((s, c) => s + value(c), 0) % 10;
}

export function dealBaccarat(deck: Card[]) {
  let i = 0;
  const next = () => deck[i++];
  const player = [next(), next()];
  const banker = [next(), next()];
  const ps = score(player);
  const bs = score(banker);
  if (ps < 8 && bs < 8) {
    let playerThird: Card | null = null;
    if (ps <= 5) {
      playerThird = next();
      player.push(playerThird);
    }
    const b = score(banker);
    if (playerThird === null) {
      if (b <= 5) banker.push(next());
    } else {
      const t = value(playerThird);
      const draw =
        b <= 2 ||
        (b === 3 && t !== 8) ||
        (b === 4 && t >= 2 && t <= 7) ||
        (b === 5 && t >= 4 && t <= 7) ||
        (b === 6 && (t === 6 || t === 7));
      if (draw) banker.push(next());
    }
  }
  const p = score(player);
  const bk = score(banker);
  const winner: Side = p > bk ? 'player' : bk > p ? 'banker' : 'tie';
  return { player, banker, p, b: bk, winner };
}

export function BaccaratGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(100);
  const [side, setSide] = useState<Side>('player');
  const [round, setRound] = useState<ReturnType<typeof dealBaccarat> | null>(null);
  const [message, setMessage] = useState({ text: 'На кого ставиш?', tone: 'neutral' as 'win' | 'lose' | 'neutral' });

  const play = () => {
    if (!wallet.bet(game.id, 'table', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const r = dealBaccarat(newDeck(8));
    setRound(r);
    if (r.winner === side) {
      const won = Math.floor(bet * PAYOUTS[side]);
      wallet.win(game.id, won);
      haptic('win');
      setMessage({ text: `${LABELS[r.winner]} виграє! +${formatCoins(won)}`, tone: 'win' });
    } else if (r.winner === 'tie') {
      wallet.win(game.id, bet);
      setMessage({ text: 'Нічия. Ставку повернуто', tone: 'neutral' });
    } else {
      setMessage({ text: `${LABELS[r.winner]} виграє`, tone: 'lose' });
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.table}>
        {(['player', 'banker'] as const).map((s) => (
          <View key={s} style={styles.side}>
            <Text style={styles.sideLabel}>
              {LABELS[s]} {round ? `· ${s === 'player' ? round.p : round.b}` : ''}
            </Text>
            <View style={styles.hand}>
              {(round ? round[s] : [undefined, undefined]).map((c, i) => (
                <PlayingCard key={i} card={c} small />
              ))}
            </View>
          </View>
        ))}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      <View style={styles.row}>
        {(['player', 'tie', 'banker'] as const).map((s) => (
          <Chip key={s} label={`${LABELS[s]} ×${PAYOUTS[s]}`} active={side === s} onPress={() => setSide(s)} />
        ))}
      </View>
      <BetSelector value={bet} onChange={setBet} />
      <BigButton label="РОЗДАТИ" onPress={play} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  table: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: '#3B0764',
    borderRadius: 24,
    padding: 14,
    borderWidth: 4,
    borderColor: '#A16207',
    gap: 10,
  },
  side: { flex: 1, alignItems: 'center', gap: 8 },
  sideLabel: { color: '#F5D0FE', fontWeight: '800' },
  hand: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center', minHeight: 72 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
});
