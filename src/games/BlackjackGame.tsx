import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PlayingCard } from '../components/PlayingCard';
import { BetSelector, BigButton, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { Card, newDeck } from './cards';
import { GameInfo } from './catalog';

function cardValue(c: Card) {
  if (c.rank === 14) return 11;
  return Math.min(c.rank, 10);
}

export function handTotal(cards: Card[]): number {
  let total = cards.reduce((sum, c) => sum + cardValue(c), 0);
  let aces = cards.filter((c) => c.rank === 14).length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return total;
}

type Phase = 'bet' | 'play' | 'done';

export function BlackjackGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(50);
  const [stake, setStake] = useState(0);
  const [deck, setDeck] = useState<Card[]>(() => newDeck(6));
  const [player, setPlayer] = useState<Card[]>([]);
  const [dealer, setDealer] = useState<Card[]>([]);
  const [phase, setPhase] = useState<Phase>('bet');
  const [message, setMessage] = useState({ text: 'Зроби ставку і роздай карти', tone: 'neutral' as 'win' | 'lose' | 'neutral' });

  const draw = (d: Card[]) => {
    const source = d.length < 20 ? newDeck(6) : d;
    return { card: source[0], rest: source.slice(1) };
  };

  const finish = (p: Card[], dl: Card[], d: Card[], currentStake: number) => {
    let dealerHand = dl;
    let rest = d;
    const pt = handTotal(p);
    if (pt <= 21) {
      while (handTotal(dealerHand) < 17) {
        const r = draw(rest);
        dealerHand = [...dealerHand, r.card];
        rest = r.rest;
      }
    }
    const dt = handTotal(dealerHand);
    setDealer(dealerHand);
    setDeck(rest);
    setPhase('done');
    let payout = 0;
    let text: string;
    if (pt > 21) text = `Перебір (${pt}). Програш`;
    else if (dt > 21 || pt > dt) {
      payout = currentStake * 2;
      text = `Ти виграв ${pt} проти ${dt}!`;
    } else if (pt === dt) {
      payout = currentStake;
      text = `Нічия ${pt}:${dt}. Ставку повернуто`;
    } else text = `Дилер виграв ${dt} проти ${pt}`;
    if (payout > 0) wallet.win(game.id, payout);
    if (payout > currentStake) haptic('win');
    setMessage({ text: payout > currentStake ? `${text} +${formatCoins(payout)}` : text, tone: payout > currentStake ? 'win' : payout ? 'neutral' : 'lose' });
  };

  const deal = () => {
    if (!wallet.bet(game.id, 'table', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    let d = deck;
    const take = () => {
      const r = draw(d);
      d = r.rest;
      return r.card;
    };
    const p = [take(), take()];
    const dl = [take(), take()];
    setStake(bet);
    setPlayer(p);
    setDealer(dl);
    setDeck(d);
    if (handTotal(p) === 21) {
      setPhase('done');
      if (handTotal(dl) === 21) {
        wallet.win(game.id, bet);
        setMessage({ text: 'Обидва мають блекджек. Нічия', tone: 'neutral' });
      } else {
        wallet.win(game.id, bet * 2.5);
        haptic('win');
        setMessage({ text: `БЛЕКДЖЕК! +${formatCoins(bet * 2.5)}`, tone: 'win' });
      }
      return;
    }
    setPhase('play');
    setMessage({ text: 'Ще карту чи досить?', tone: 'neutral' });
  };

  const hit = () => {
    const r = draw(deck);
    const p = [...player, r.card];
    setPlayer(p);
    setDeck(r.rest);
    if (handTotal(p) >= 21) finish(p, dealer, r.rest, stake);
  };

  const stand = () => finish(player, dealer, deck, stake);

  const double = () => {
    if (!wallet.bet(game.id, 'table', stake)) {
      setMessage({ text: 'Недостатньо монет для подвоєння', tone: 'lose' });
      return;
    }
    const r = draw(deck);
    const p = [...player, r.card];
    setPlayer(p);
    setStake(stake * 2);
    finish(p, dealer, r.rest, stake * 2);
  };

  const hideHole = phase === 'play';

  return (
    <View style={styles.root}>
      <View style={styles.table}>
        <Text style={styles.handLabel}>
          Дилер {dealer.length ? `· ${hideHole ? handTotal([dealer[0]]) : handTotal(dealer)}` : ''}
        </Text>
        <View style={styles.hand}>
          {dealer.map((c, i) => (
            <PlayingCard key={i} card={c} hidden={hideHole && i === 1} />
          ))}
        </View>
        <Text style={styles.handLabel}>Ти {player.length ? `· ${handTotal(player)}` : ''}</Text>
        <View style={styles.hand}>
          {player.map((c, i) => (
            <PlayingCard key={i} card={c} />
          ))}
        </View>
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      {phase === 'play' ? (
        <View style={styles.actions}>
          <BigButton label="ЩЕ" onPress={hit} color={colors.blue} style={styles.action} />
          <BigButton label="ДОСИТЬ" onPress={stand} color={colors.accent} style={styles.action} />
          <BigButton label="×2" onPress={double} color="#A16207" disabled={player.length !== 2} style={styles.action} />
        </View>
      ) : (
        <>
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label="РОЗДАТИ" onPress={deal} />
        </>
      )}
      <Text style={styles.rules}>Дилер бере до 17. Блекджек платить 3:2.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  table: {
    width: '100%',
    backgroundColor: '#14532D',
    borderRadius: 24,
    padding: 16,
    gap: 8,
    borderWidth: 4,
    borderColor: '#A16207',
    minHeight: 260,
  },
  handLabel: { color: '#D1FAE5', fontWeight: '700' },
  hand: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', minHeight: 84 },
  actions: { flexDirection: 'row', gap: 8, width: '100%' },
  action: { flex: 1, width: undefined },
  rules: { color: colors.muted, fontSize: 12 },
});
