import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { PlayingCard } from '../components/PlayingCard';
import { BetSelector, BigButton, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { Card, newDeck } from './cards';
import { GameInfo } from './catalog';

const HANDS: { name: string; pay: number }[] = [
  { name: 'Роял-флеш', pay: 250 },
  { name: 'Стріт-флеш', pay: 50 },
  { name: 'Каре', pay: 25 },
  { name: 'Фул-хаус', pay: 9 },
  { name: 'Флеш', pay: 6 },
  { name: 'Стріт', pay: 4 },
  { name: 'Трійка', pay: 3 },
  { name: 'Дві пари', pay: 2 },
  { name: 'Пара валетів+', pay: 1 },
];

export function evaluatePoker(cards: Card[]): number {
  const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
  const counts = new Map<number, number>();
  ranks.forEach((r) => counts.set(r, (counts.get(r) ?? 0) + 1));
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flush = cards.every((c) => c.suit === cards[0].suit);
  const unique = counts.size === 5;
  const wheel = ranks.join() === '2,3,4,5,14';
  const straight = unique && (ranks[4] - ranks[0] === 4 || wheel);
  if (straight && flush && ranks[0] === 10) return 0;
  if (straight && flush) return 1;
  if (groups[0] === 4) return 2;
  if (groups[0] === 3 && groups[1] === 2) return 3;
  if (flush) return 4;
  if (straight) return 5;
  if (groups[0] === 3) return 6;
  if (groups[0] === 2 && groups[1] === 2) return 7;
  if (groups[0] === 2) {
    const pairRank = [...counts.entries()].find(([, n]) => n === 2)![0];
    if (pairRank >= 11) return 8;
  }
  return -1;
}

export function PokerGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(25);
  const [deck, setDeck] = useState<Card[]>([]);
  const [hand, setHand] = useState<Card[]>([]);
  const [held, setHeld] = useState<boolean[]>(Array(5).fill(false));
  const [phase, setPhase] = useState<'bet' | 'hold'>('bet');
  const [lastHand, setLastHand] = useState(-1);
  const [message, setMessage] = useState({ text: 'Роздай карти', tone: 'neutral' as 'win' | 'lose' | 'neutral' });

  const deal = () => {
    if (!wallet.bet(game.id, 'table', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    const d = newDeck();
    const h = d.slice(0, 5);
    setHand(h);
    setDeck(d.slice(5));
    setHeld(Array(5).fill(false));
    setPhase('hold');
    const current = evaluatePoker(h);
    setLastHand(current);
    setMessage({ text: current >= 0 ? `Маєш: ${HANDS[current].name}. Тримай карти` : 'Обери карти, які тримати', tone: 'neutral' });
  };

  const draw = () => {
    let i = 0;
    const next = hand.map((c, idx) => (held[idx] ? c : deck[i++]));
    setHand(next);
    setPhase('bet');
    const result = evaluatePoker(next);
    setLastHand(result);
    if (result >= 0) {
      const won = bet * HANDS[result].pay;
      wallet.win(game.id, won);
      haptic('win');
      setMessage({ text: `${HANDS[result].name}! +${formatCoins(won)}`, tone: 'win' });
    } else {
      setMessage({ text: 'Без комбінації', tone: 'lose' });
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.paytable}>
        {HANDS.map((h, i) => (
          <View key={h.name} style={[styles.payRow, lastHand === i && styles.payRowActive]}>
            <Text style={styles.payName}>{h.name}</Text>
            <Text style={styles.payValue}>{formatCoins(h.pay * bet)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.hand}>
        {(hand.length ? hand : Array(5).fill(undefined)).map((c, i) => (
          <Pressable
            key={i}
            disabled={phase !== 'hold'}
            onPress={() => {
              haptic();
              setHeld((h) => h.map((v, idx) => (idx === i ? !v : v)));
            }}
            style={styles.cardSlot}
          >
            <PlayingCard card={c} hidden={!c} small />
            <Text style={[styles.hold, !held[i] && { opacity: 0 }]}>ТРИМАЮ</Text>
          </Pressable>
        ))}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      {phase === 'hold' ? (
        <BigButton label="ЗАМІНИТИ" onPress={draw} color={colors.accent} />
      ) : (
        <>
          <BetSelector value={bet} onChange={setBet} options={[5, 10, 25, 50, 100]} />
          <BigButton label="РОЗДАТИ" onPress={deal} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  paytable: { width: '100%', backgroundColor: '#1E1B4B', borderRadius: 14, padding: 10, borderWidth: 2, borderColor: colors.gold },
  payRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6 },
  payRowActive: { backgroundColor: colors.accent },
  payName: { color: colors.gold, fontWeight: '700', fontSize: 13 },
  payValue: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  hand: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  cardSlot: { alignItems: 'center', gap: 4 },
  hold: { color: colors.gold, fontSize: 10, fontWeight: '900' },
});
