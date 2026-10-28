import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { sfx, useSettings } from '../audio/sound';
import { celebrate, winTier } from '../components/Celebration';
import { Reel } from '../components/Reel';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { WinCounter } from '../components/WinCounter';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';
import { KarasBonus } from './KarasBonus';
import { SPRINTER_ID } from './karasWheel';
import { Grid, ROWS, SlotConfig, evaluateGrid, paylines, randomSymbol, spinGrid } from './slotEngine';

const REEL_BASE_MS = 700;
const REEL_STEP_MS = 260;

export function SlotGame({ game }: { game: GameInfo }) {
  const config = game.slot!;
  const wallet = useWallet();
  const { width } = useWindowDimensions();
  const [bet, setBet] = useState(25);
  const [grid, setGrid] = useState<Grid>(() => spinGrid(config));
  const [spinning, setSpinning] = useState<boolean[]>(Array(config.reels).fill(false));
  const [highlight, setHighlight] = useState<boolean[][]>([]);
  const [message, setMessage] = useState({ text: 'Удачі!', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const [freeSpins, setFreeSpins] = useState(0);
  // У «Золотому Карасі» скатери запускають колесо фортуни замість фриспінів.
  const wheelBonus = game.id === 'golden-karas';
  const [bonusBet, setBonusBet] = useState<number | null>(null);
  const [auto, setAuto] = useState(0);
  const [lastWin, setLastWin] = useState({ amount: 0, key: 0 });
  const settings = useSettings();
  const base = settings.fastSpin ? REEL_BASE_MS / 2 : REEL_BASE_MS;
  const stepMs = settings.fastSpin ? REEL_STEP_MS / 2 : REEL_STEP_MS;
  const busy = spinning.some(Boolean);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const size = Math.min(84, Math.floor((Math.min(width, 480) - 56 - config.reels * 6) / config.reels));

  const spin = () => {
    if (busy) return;
    const free = freeSpins > 0;
    if (!free && !wallet.bet(game.id, 'slot', bet)) {
      setMessage({ text: 'Недостатньо монет. Забери бонус!', tone: 'lose' });
      setAuto(0);
      return;
    }
    if (free) setFreeSpins((n) => n - 1);
    const result = spinGrid(config);
    const outcome = evaluateGrid(config, result, bet);
    setGrid(result);
    setHighlight([]);
    setSpinning(Array(config.reels).fill(true));
    sfx('spin', 0.5);
    setMessage({ text: free ? `Фриспін! Залишилось ${freeSpins - 1}` : 'Крутимо...', tone: 'neutral' });

    for (let i = 0; i < config.reels; i++) {
      timers.current.push(
        setTimeout(() => {
          setSpinning((prev) => prev.map((v, idx) => (idx === i ? false : v)));
          sfx('stop', 0.5);
        }, base + i * stepMs),
      );
    }

    timers.current.push(
      setTimeout(() => {
        const lines = paylines(config);
        const marks = Array.from({ length: config.reels }, () => Array(ROWS).fill(false));
        for (const w of outcome.lineWins) {
          for (let reel = 0; reel < w.count; reel++) marks[reel][lines[w.line][reel]] = true;
        }
        if (outcome.scatterCount >= 3) {
          result.forEach((col, reel) =>
            col.forEach((s, row) => {
              if (s.id === config.scatter) marks[reel][row] = true;
            }),
          );
        }
        if (outcome.jackpot) {
          for (let reel = 0; reel < config.reels; reel++) marks[reel][1] = true;
        }
        setHighlight(marks);

        const parts: string[] = [];
        if (outcome.jackpot) {
          const amount = wallet.winJackpot();
          parts.push(`💰 ДЖЕКПОТ ${formatCoins(amount)}!`);
          celebrate({ kind: 'total', title: 'ДЖЕКПОТ!', amount, emoji: '💰' });
        }
        if (outcome.win > 0) {
          wallet.win(game.id, outcome.win);
          parts.push(`+${formatCoins(outcome.win)}`);
          setLastWin((w) => ({ amount: outcome.win, key: w.key + 1 }));
          if (winTier(outcome.win, bet)) {
            setAuto(0);
            celebrate({ kind: 'win', amount: outcome.win, bet });
          } else sfx('win');
        }
        if (outcome.freeSpins > 0 && wheelBonus) {
          setAuto(0);
          wallet.track('bonuses');
          parts.push('Колесо фортуни!');
          celebrate({ kind: 'intro', emoji: '🎡', title: 'КОЛЕСО ФОРТУНИ!', subtitle: 'Крути і вигравай до ×100 або Mercedes Sprinter' }).then(() =>
            setBonusBet(bet),
          );
        } else if (outcome.freeSpins > 0) {
          setFreeSpins((n) => n + outcome.freeSpins);
          wallet.track('bonuses');
          parts.push(`${outcome.freeSpins} фриспінів!`);
          celebrate({ kind: 'intro', emoji: '🎁', title: 'ФРИСПІНИ!', subtitle: `${outcome.freeSpins} безкоштовних обертів` });
        }
        if (parts.length) {
          haptic('win');
          setMessage({ text: parts.join('  '), tone: 'win' });
        } else {
          setMessage({ text: 'Ще раз?', tone: 'lose' });
        }
      }, base + (config.reels - 1) * stepMs + 60),
    );
  };

  // Автогра і фриспіни запускають наступний оберт, коли барабани зупинились.
  useEffect(() => {
    if (busy || bonusBet != null) return;
    if (freeSpins > 0 || auto > 0) {
      const t = setTimeout(() => {
        if (freeSpins === 0) setAuto((n) => n - 1);
        spin();
      }, 900);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, freeSpins, auto, bonusBet]);

  const finishBonus = (money: number, sprinter: boolean) => {
    setBonusBet(null);
    if (sprinter) {
      const r = wallet.grantItem(SPRINTER_ID);
      wallet.notify(r === 'cash' ? 'Другий Sprinter: зараховано його вартість грошима!' : '🚐 Mercedes Sprinter 3.0 тепер твій!');
      setMessage({ text: '🚐 MERCEDES SPRINTER 3.0!', tone: 'win' });
    } else if (money > 0) {
      wallet.win(game.id, money);
      setLastWin((w) => ({ amount: money, key: w.key + 1 }));
      setMessage({ text: `Колесо фортуни: +${formatCoins(money)}`, tone: 'win' });
    }
  };

  return (
    <View style={styles.root}>
      {bonusBet != null && <KarasBonus bet={bonusBet} onDone={finishBonus} />}
      {config.jackpotSymbol && (
        <View style={styles.jackpot}>
          <Text style={styles.jackpotLabel}>ПРОГРЕСИВНИЙ ДЖЕКПОТ</Text>
          <Text style={styles.jackpotValue}>{formatCoins(wallet.state.jackpotPool)}</Text>
        </View>
      )}
      <View style={[styles.machine, { borderColor: game.colors[0] }]}>
        <View style={styles.reels}>
          {grid.map((column, i) => (
            <Reel
              key={i}
              items={column}
              spinning={spinning[i]}
              size={size}
              win={highlight[i]}
              randomItem={() => randomSymbol(config)}
              speed={settings.fastSpin ? 160 : 240}
              cellStyle={game.art ? styles.artCell : undefined}
              render={(s) =>
                game.art?.[s.id] ? (
                  <Image source={game.art[s.id]} style={{ width: size - 6, height: size - 6, borderRadius: 9 }} />
                ) : (
                  <Text style={{ fontSize: size * 0.55 }}>{s.emoji}</Text>
                )
              }
            />
          ))}
        </View>
        {freeSpins > 0 && <Text style={styles.free}>Фриспіни: {freeSpins}</Text>}
      </View>
      <WinCounter amount={lastWin.amount} countKey={lastWin.key} />
      <ResultLine text={message.text} tone={message.tone} />
      <BetSelector value={bet} onChange={setBet} disabled={busy || freeSpins > 0} />
      <BigButton
        label={busy ? '...' : freeSpins > 0 ? 'ФРИСПІН' : 'КРУТИТИ'}
        onPress={spin}
        disabled={busy || auto > 0 || bonusBet != null}
      />
      <View style={styles.autoRow}>
        <Chip label={auto > 0 ? `Стоп (${auto})` : 'Авто ×10'} active={auto > 0} onPress={() => setAuto(auto > 0 ? 0 : 10)} />
        <Chip label="Авто ×50" onPress={() => setAuto(50)} disabled={auto > 0} />
      </View>
      <Paytable config={config} art={game.art} wheel={wheelBonus} />
    </View>
  );
}

function Paytable({ config, art, wheel }: { config: SlotConfig; art?: GameInfo['art']; wheel?: boolean }) {
  const lines = paylines(config).length;
  return (
    <View style={styles.paytable}>
      <Text style={styles.payTitle}>Виплати (× ставка на лінію, ліній: {lines})</Text>
      {[...config.symbols].reverse().map((s) => (
        <View key={s.id} style={styles.payRow}>
          {art?.[s.id] ? <Image source={art[s.id]} style={styles.payImage} /> : <Text style={styles.payEmoji}>{s.emoji}</Text>}
          <Text style={styles.payText}>
            {s.id === config.scatter
              ? wheel
                ? '3/4/5 будь-де: ×5/×20/×100 ставки + Колесо фортуни (до ×100 або Mercedes Sprinter 3.0)'
                : '3/4/5 будь-де: ×5/×20/×100 ставки + фриспіни'
              : s.id === config.wild
                ? `Wild: замінює символи · ${s.pays.map((p) => `×${p}`).join(' / ')}`
                : s.id === config.jackpotSymbol
                  ? `×${s.pays[0]} · 3 на центр. лінії = джекпот`
                  : s.pays.map((p) => `×${p}`).join(' / ')}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 14, alignItems: 'center' },
  jackpot: {
    backgroundColor: '#3B0764',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  jackpotLabel: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  jackpotValue: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  machine: {
    padding: 10,
    borderRadius: 20,
    borderWidth: 4,
    backgroundColor: '#12102E',
    alignItems: 'center',
  },
  reels: { flexDirection: 'row', gap: 6 },
  reel: { gap: 6 },
  cell: {
    borderRadius: 12,
    backgroundColor: '#FFFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'transparent',
  },
  cellWin: { borderColor: colors.gold, backgroundColor: '#FFF3C4' },
  blur: { opacity: 0.55 },
  free: { color: colors.gold, fontWeight: '800', marginTop: 8 },
  autoRow: { flexDirection: 'row', gap: 10 },
  paytable: { width: '100%', backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 4 },
  payTitle: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payImage: { width: 32, height: 32, borderRadius: 6 },
  artCell: { backgroundColor: '#FFF6E0', borderRadius: 12, overflow: 'hidden' },
  payEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  payText: { color: colors.text, fontSize: 13, flex: 1 },
});
