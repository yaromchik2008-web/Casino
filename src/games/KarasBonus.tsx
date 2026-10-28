import { useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { sfx } from '../audio/sound';
import { celebrate } from '../components/Celebration';
import { RingSegment, RingWheel, RingWheelHandle } from '../components/RingWheel';
import { BigButton, haptic } from '../components/ui';
import { colors, formatCoins } from '../theme';
import { SPRINTER_VALUE, WHEEL_SEGMENTS, spinKarasWheel } from './karasWheel';

const PALETTE = ['#FFC83D', '#FF5A6E', '#7C3AED', '#22C55E', '#0EA5E9', '#F97316'];
const SEGMENTS: RingSegment[] = WHEEL_SEGMENTS.map((m, i) =>
  m === 0
    ? { color: '#111827', label: '🚐', textColor: '#FFFFFF' }
    : { color: PALETTE[i % PALETTE.length], label: `×${m}`, textColor: i % PALETTE.length === 0 ? '#14102A' : '#FFFFFF' },
);

/** Колесо фортуни «Золотого Карася». onDone отримує виграш грошима і чи випав Спринтер. */
/** bank: виграш фриспінів (не менше ставки), колесо множить його. Спринтер дається разом із банком. */
export function KarasBonus({ bet, bank, onDone }: { bet: number; bank: number; onDone: (money: number, sprinter: boolean) => void }) {
  const { width } = useWindowDimensions();
  const size = Math.min(340, width - 40);
  const wheel = useRef<RingWheelHandle>(null);
  const [state, setState] = useState<'ready' | 'spin' | 'done'>('ready');
  const [prize, setPrize] = useState<number | null>(null);

  const spin = () => {
    if (state !== 'ready') return;
    setState('spin');
    sfx('spin', 0.6);
    const idx = spinKarasWheel(bet);
    wheel.current?.spin(
      idx,
      async () => {
        const m = WHEEL_SEGMENTS[idx];
        setPrize(m);
        setState('done');
        haptic('win');
        if (m === 0) {
          sfx('bigwin');
          await celebrate({ kind: 'total', title: 'МЕГАПРИЗ!', amount: SPRINTER_VALUE, emoji: '🚐' });
        } else {
          sfx(m >= 25 ? 'bigwin' : 'win');
          await celebrate({ kind: 'win', amount: m * bank, bet });
        }
      },
      6000,
    );
  };

  return (
    <Modal transparent animationType="fade">
      <View style={styles.back}>
        <View style={styles.card}>
          <Text style={styles.title}>🐟 КОЛЕСО ФОРТУНИ</Text>
          <Text style={styles.bank}>Банк фриспінів: {formatCoins(bank)}</Text>
          <Text style={styles.sub}>Колесо помножить банк. Мегаприз: Mercedes Sprinter 3.0 вартістю {formatCoins(SPRINTER_VALUE)}</Text>
          <RingWheel ref={wheel} segments={SEGMENTS} size={size} thickness={size * 0.2} labelSize={size * 0.045}>
            {prize == null ? (
              <Text style={styles.center}>{state === 'spin' ? '…' : 'КРУТИ!'}</Text>
            ) : prize === 0 ? (
              <>
                <Text style={styles.big}>🚐</Text>
                <Text style={styles.centerSmall}>Sprinter твій!</Text>
              </>
            ) : (
              <>
                <Text style={styles.center}>×{prize}</Text>
                <Text style={styles.centerSmall}>{formatCoins(prize * bank)}</Text>
              </>
            )}
          </RingWheel>
          {state === 'done' ? (
            <BigButton
              label={prize === 0 ? `ЗАБРАТИ SPRINTER + ${formatCoins(bank)}` : `ЗАБРАТИ ${formatCoins((prize ?? 0) * bank)}`}
              onPress={() => onDone(prize === 0 ? bank : (prize ?? 0) * bank, prize === 0)}
            />
          ) : (
            <BigButton label={state === 'spin' ? 'КРУТИТЬСЯ…' : 'КРУТИТИ КОЛЕСО'} disabled={state !== 'ready'} onPress={spin} />
          )}
          <Text style={styles.note}>Спринтер з'явиться в «Магазин → Мої статки». Продати можна за повну ціну.</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, backgroundColor: 'rgba(5,3,15,0.86)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 420, backgroundColor: '#14102A', borderRadius: 24, borderWidth: 3, borderColor: '#FFC83D', padding: 16, gap: 12, alignItems: 'center' },
  title: { color: '#FFC83D', fontWeight: '900', fontSize: 22, letterSpacing: 1 },
  sub: { color: colors.text, fontSize: 13, textAlign: 'center' },
  bank: { color: colors.gold, fontSize: 18, fontWeight: '900' },
  center: { color: '#FFFFFF', fontWeight: '900', fontSize: 30 },
  centerSmall: { color: '#FFC83D', fontWeight: '800', fontSize: 14, textAlign: 'center' },
  big: { fontSize: 56 },
  note: { color: colors.muted, fontSize: 11, textAlign: 'center' },
});
