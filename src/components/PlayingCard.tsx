import { StyleSheet, Text, View } from 'react-native';
import { Card, isRed, rankLabel } from '../games/cards';

export function PlayingCard({ card, hidden, small }: { card?: Card; hidden?: boolean; small?: boolean }) {
  const size = small ? styles.small : styles.normal;
  if (!card || hidden) {
    return (
      <View style={[styles.card, size, styles.back]}>
        <Text style={styles.backText}>★</Text>
      </View>
    );
  }
  const color = isRed(card) ? '#DC2626' : '#111827';
  return (
    <View style={[styles.card, size]}>
      <Text style={[styles.rank, small && styles.rankSmall, { color }]}>{rankLabel(card.rank)}</Text>
      <Text style={[styles.suit, small && styles.suitSmall, { color }]}>{card.suit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  normal: { width: 58, height: 84 },
  small: { width: 50, height: 72 },
  back: { backgroundColor: '#7C3AED', borderColor: '#C4B5FD', borderWidth: 2 },
  backText: { color: '#FDE68A', fontSize: 26 },
  rank: { fontSize: 24, fontWeight: '800' },
  rankSmall: { fontSize: 20 },
  suit: { fontSize: 22 },
  suitSmall: { fontSize: 18 },
});
