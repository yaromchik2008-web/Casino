import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';

export function DiceGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [bet, setBet] = useState(50);
  const [target, setTarget] = useState(50);
  const [over, setOver] = useState(true);
  const [roll, setRoll] = useState<number | null>(null);
  const [rolling, setRolling] = useState(false);
  const [message, setMessage] = useState({ text: 'Обери поріг і кидай', tone: 'neutral' as 'win' | 'lose' | 'neutral' });

  const chance = over ? 99 - target : target;
  const multiplier = Math.floor((94 / chance) * 100) / 100;

  const adjust = (d: number) => setTarget((t) => Math.max(2, Math.min(97, t + d)));

  const play = () => {
    if (!wallet.bet(game.id, 'fast', bet)) {
      setMessage({ text: 'Недостатньо монет', tone: 'lose' });
      return;
    }
    setRolling(true);
    let ticks = 0;
    const t = setInterval(() => {
      ticks++;
      setRoll(Math.floor(Math.random() * 100));
      if (ticks >= 12) {
        clearInterval(t);
        const result = Math.floor(Math.random() * 100);
        setRoll(result);
        setRolling(false);
        const won = over ? result > target : result < target;
        if (won) {
          const amount = Math.floor(bet * multiplier);
          wallet.win(game.id, amount);
          haptic('win');
          setMessage({ text: `Випало ${result}! +${formatCoins(amount)}`, tone: 'win' });
        } else {
          setMessage({ text: `Випало ${result}. Мимо`, tone: 'lose' });
        }
      }
    }, 50);
  };

  return (
    <View style={styles.root}>
      <View style={styles.display}>
        <Text style={styles.roll}>{roll ?? '--'}</Text>
        <View style={styles.bar}>
          <View
            style={[
              styles.zone,
              over ? { left: `${target + 1}%`, right: 0 } : { left: 0, width: `${target}%` },
            ]}
          />
          {roll !== null && <View style={[styles.marker, { left: `${roll}%` }]} />}
        </View>
        <Text style={styles.caption}>
          {over ? `Більше за ${target}` : `Менше за ${target}`} · Шанс {chance}% · ×{multiplier}
        </Text>
      </View>
      <View style={styles.row}>
        <Chip label="Більше" active={over} onPress={() => setOver(true)} disabled={rolling} />
        <Chip label="Менше" active={!over} onPress={() => setOver(false)} disabled={rolling} />
      </View>
      <View style={styles.row}>
        {[-10, -1, 1, 10].map((d) => (
          <Chip key={d} label={d > 0 ? `+${d}` : `${d}`} onPress={() => adjust(d)} disabled={rolling} />
        ))}
      </View>
      <ResultLine text={message.text} tone={message.tone} />
      <BetSelector value={bet} onChange={setBet} disabled={rolling} />
      <BigButton label={rolling ? '...' : 'КИНУТИ'} onPress={play} disabled={rolling} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  display: { width: '100%', backgroundColor: colors.surface, borderRadius: 20, padding: 18, alignItems: 'center', gap: 12 },
  roll: { color: '#FFFFFF', fontSize: 64, fontWeight: '900' },
  bar: { width: '100%', height: 14, borderRadius: 7, backgroundColor: '#7F1D1D', overflow: 'hidden' },
  zone: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.green },
  marker: { position: 'absolute', top: -2, bottom: -2, width: 4, backgroundColor: '#FFFFFF' },
  caption: { color: colors.muted, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
});
