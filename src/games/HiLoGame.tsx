import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { PlayingCard } from '../components/PlayingCard';
import { BetSelector, BigButton, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { Card, newDeck } from './cards';
import { GameInfo } from './catalog';

// Ранги 2..14 рівноймовірні; «вище або рівно» і «нижче або рівно».
function odds(rank: number) {
  const higher = (14 - rank + 1) / 13;
  const lower = (rank - 2 + 1) / 13;
  return {
    higher: Math.floor((0.94 / higher) * 100) / 100,
    lower: Math.floor((0.94 / lower) * 100) / 100,
  };
}

function randomCard(): Card {
  return newDeck()[0];
}

export function HiLoGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(100);
  const [card, setCard] = useState<Card>(randomCard);
  const [trail, setTrail] = useState<Card[]>([]);
  const [active, setActive] = useState(false);
  const [multiplier, setMultiplier] = useState(1);
  const [message, setMessage] = useState({ text: 'Вгадай наступну карту', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const o = odds(card.rank);

  const start = () => {
    if (!wallet.bet(game.id, 'table', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    setActive(true);
    setMultiplier(1);
    setTrail([]);
    setCard(randomCard());
    setMessage({ text: 'Вище чи нижче?', tone: 'neutral' });
  };

  const guess = (dir: 'higher' | 'lower') => {
    const next = randomCard();
    const ok = dir === 'higher' ? next.rank >= card.rank : next.rank <= card.rank;
    setTrail((t) => [card, ...t].slice(0, 6));
    setCard(next);
    if (ok) {
      haptic();
      const m = Math.floor(multiplier * o[dir] * 100) / 100;
      setMultiplier(m);
      setMessage({ text: `Так! Множник ×${m}`, tone: 'win' });
    } else {
      haptic('lose');
      setActive(false);
      setMultiplier(1);
      setMessage({ text: 'Не вгадав. Ставка згоріла', tone: 'lose' });
    }
  };

  const cashOut = () => {
    const won = Math.floor(bet * multiplier);
    wallet.win(game.id, won);
    haptic('win');
    setActive(false);
    setMessage({ text: `Забрав +${formatCoins(won)}`, tone: 'win' });
    setMultiplier(1);
  };

  return (
    <View style={styles.root}>
      <View style={styles.table}>
        <View style={styles.big}>
          <PlayingCard card={card} />
        </View>
        <View style={styles.trail}>
          {trail.map((c, i) => (
            <PlayingCard key={i} card={c} small />
          ))}
        </View>
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      {active ? (
        <>
          <View style={styles.row}>
            <BigButton label={`▲ ×${o.higher}`} onPress={() => guess('higher')} color={colors.green} style={styles.half} />
            <BigButton label={`▼ ×${o.lower}`} onPress={() => guess('lower')} color={colors.red} style={styles.half} />
          </View>
          <BigButton
            label={`ЗАБРАТИ ${formatCoins(bet * multiplier)}`}
            onPress={cashOut}
            disabled={multiplier <= 1}
            color="#F59E0B"
          />
        </>
      ) : (
        <>
          <BetSelector value={bet} onChange={setBet} />
          <BigButton label="ГРАТИ" onPress={start} />
        </>
      )}
      <Text style={styles.rules}>Рівна карта теж рахується як вгадана.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  table: { width: '100%', backgroundColor: '#0E3B4A', borderRadius: 20, padding: 16, alignItems: 'center', gap: 12 },
  big: { transform: [{ scale: 1.4 }], marginVertical: 18 },
  trail: { flexDirection: 'row', gap: 4, minHeight: 72, opacity: 0.7 },
  row: { flexDirection: 'row', gap: 10, width: '100%' },
  half: { flex: 1, width: undefined },
  rules: { color: colors.muted, fontSize: 12 },
});
