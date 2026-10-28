import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { playMusic, sfx, useSettings } from '../audio/sound';
import { celebrate, winTier } from '../components/Celebration';
import { DropCell } from '../components/DropCell';
import { BetSelector, BigButton, Chip, ResultLine, haptic } from '../components/ui';
import { WinCounter } from '../components/WinCounter';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';
import { COLS, Cell, ROWS, TGrid, playTumble, randomTGrid } from './tumbleEngine';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function TumbleGame({ game }: { game: GameInfo }) {
  const config = game.tumble!;
  const wallet = useWallet();
  const settings = useSettings();
  const { width } = useWindowDimensions();
  const [bet, setBet] = useState(100);
  const [grid, setGrid] = useState<TGrid>(() => randomTGrid(config));
  const [remove, setRemove] = useState<boolean[][] | null>(null);
  const [busy, setBusy] = useState(false);
  const [freeSpins, setFreeSpins] = useState(0);
  const [bonusWin, setBonusWin] = useState(0);
  const [inBonus, setInBonus] = useState(false);
  const [auto, setAuto] = useState(0);
  const [mult, setMult] = useState<number | null>(null);
  const [lastWin, setLastWin] = useState({ amount: 0, key: 0 });
  const [message, setMessage] = useState({ text: 'Збери 8+ однакових!', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const alive = useRef(true);
  const bonusRef = useRef({ win: 0 });

  useEffect(() => () => void (alive.current = false), []);

  const size = Math.floor(Math.min(56, (Math.min(width, 480) - 48 - (COLS - 1) * 4) / COLS));
  const speed = freeSpins > 0 ? 1.15 : settings.fastSpin ? 0.5 : settings.lite ? 0.75 : 1;

  const symbolOf = (id: string) => config.symbols.find((s) => s.id === id)!;
  const emojiOf = (c: Cell) => (c.kind === 'sym' ? symbolOf(c.id).emoji : c.kind === 'scatter' ? config.scatter.emoji : config.bomb.emoji);

  const finishBonus = async () => {
    const total = bonusRef.current.win;
    setInBonus(false);
    playMusic(game.music);
    await celebrate({ kind: 'total', title: 'ВИГРАШ БОНУСУ', amount: total, emoji: config.scatter.emoji });
    setMessage({ text: `Бонус приніс ${formatCoins(total)}`, tone: total > 0 ? 'win' : 'lose' });
  };

  const startBonus = async (spins: number) => {
    bonusRef.current.win = 0;
    wallet.track('bonuses');
    setBonusWin(0);
    setInBonus(true);
    setAuto(0);
    playMusic('bonus');
    await celebrate({
      kind: 'intro',
      emoji: config.scatter.emoji,
      title: 'БОНУСНА ГРА!',
      subtitle: `${spins} фриспінів, ${config.bomb.emoji} множать виграш`,
      color: game.colors[0],
    });
    setAuto(0);
    setFreeSpins(spins);
  };

  const spin = async () => {
    if (busy) return;
    const free = freeSpins > 0;
    if (!free && !wallet.bet(game.id, 'slot', bet)) {
      setMessage({ text: 'Недостатньо коштів. Забери бонус!', tone: 'lose' });
      setAuto(0);
      return;
    }
    setBusy(true);
    setMult(null);
    if (free) setFreeSpins((n) => n - 1);
    setMessage({ text: free ? `Фриспін! Залишилось ${freeSpins - 1}` : 'Крутимо...', tone: 'neutral' });
    sfx('spin', 0.5);
    const result = playTumble(config, bet, free);
    let running = 0;
    for (const stage of result.stages) {
      if (!alive.current) return;
      setRemove(null);
      setGrid(stage.grid);
      await sleep(520 * speed);
      if (!stage.wins.length) break;
      setRemove(stage.remove);
      running += stage.win;
      setMessage({ text: `Каскад +${formatCoins(running)}`, tone: 'win' });
      sfx('pop');
      haptic('tap');
      await sleep(620 * speed);
    }
    if (!alive.current) return;
    setRemove(null);
    const total = result.totalWin;
    if (result.bombs.length) {
      const m = result.bombs.reduce((s, b) => s + b, 0);
      setMult(m);
      sfx('bomb');
      haptic('win');
      setMessage({ text: `${config.bomb.emoji} ×${m}!`, tone: 'win' });
      await sleep(900 * speed);
    }
    if (total > 0) {
      wallet.win(game.id, total);
      setLastWin((w) => ({ amount: total, key: w.key + 1 }));
      if (free) {
        bonusRef.current.win += total;
        setBonusWin(bonusRef.current.win);
      }
      setMessage({ text: `+${formatCoins(total)}`, tone: 'win' });
      if (winTier(total, bet)) {
        setAuto(0);
        await celebrate({ kind: 'win', amount: total, bet });
      } else sfx('win');
    } else if (!free) setMessage({ text: 'Ще раз?', tone: 'lose' });
    setBusy(false);
    if (result.freeSpinsWon > 0) {
      if (free) {
        setFreeSpins((n) => n + result.freeSpinsWon);
        sfx('bonus');
        setMessage({ text: `+${result.freeSpinsWon} фриспінів!`, tone: 'win' });
      } else await startBonus(result.freeSpinsWon);
    } else if (free && freeSpins - 1 <= 0) {
      await finishBonus();
    }
  };

  const buyBonus = async () => {
    if (busy || freeSpins > 0) return;
    const cost = bet * config.buyCost;
    if (!wallet.bet(game.id, 'slot', cost)) {
      setMessage({ text: `Потрібно ${formatCoins(cost)}`, tone: 'lose' });
      return;
    }
    await startBonus(config.freeSpins);
  };

  useEffect(() => {
    if (busy) return;
    // Фриспіни гравець крутить сам кнопкою, автогра лише для звичайних обертів.
    if (freeSpins === 0 && auto > 0) {
      const t = setTimeout(() => {
        setAuto((n) => n - 1);
        spin();
      }, 700 * speed);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, freeSpins, auto]);

  return (
    <View style={styles.root}>
      {inBonus && (
        <View style={[styles.bonusBar, { borderColor: game.colors[0] }]}>
          <Text style={styles.bonusText}>ФРИСПІНИ: {freeSpins}</Text>
          <Text style={styles.bonusText}>БОНУС: {formatCoins(bonusWin)}</Text>
        </View>
      )}
      <View style={[styles.machine, { borderColor: game.colors[0], backgroundColor: game.colors[1] }]}>
        <View style={styles.cols}>
          {grid.map((col, ci) => (
            <View key={ci} style={[styles.col, { height: ROWS * size + (ROWS - 1) * 4 }]}>
              {col.map((cell, ri) => (
                <DropCell
                  key={cell.key}
                  row={ri}
                  step={size + 4}
                  size={size}
                  popping={!!remove?.[ci][ri]}
                  pulse={!busy && cell.kind === 'scatter'}
                  style={styles.cell}
                >
                  <Text style={{ fontSize: size * 0.62 }}>{emojiOf(cell)}</Text>
                  {cell.kind === 'bomb' && (
                    <View style={styles.multTag}>
                      <Text style={styles.multText}>×{cell.mult}</Text>
                    </View>
                  )}
                </DropCell>
              ))}
            </View>
          ))}
        </View>
        {mult !== null && (
          <View style={styles.multOverlay} pointerEvents="none">
            <Text style={styles.multBig}>×{mult}</Text>
          </View>
        )}
      </View>
      <WinCounter amount={lastWin.amount} countKey={lastWin.key} />
      <ResultLine text={message.text} tone={message.tone} />
      <BetSelector value={bet} onChange={setBet} disabled={busy || freeSpins > 0} />
      <BigButton label={busy ? '...' : freeSpins > 0 ? 'ФРИСПІН' : 'КРУТИТИ'} onPress={spin} disabled={busy || auto > 0} />
      <View style={styles.row}>
        <Chip label={auto > 0 ? `Стоп (${auto})` : 'Авто ×10'} active={auto > 0} onPress={() => setAuto(auto > 0 ? 0 : 10)} disabled={freeSpins > 0} />
        <Chip label={`Купити бонус · ${formatCoins(bet * config.buyCost)}`} onPress={buyBonus} disabled={busy || freeSpins > 0} />
      </View>
      <View style={styles.paytable}>
        <Text style={styles.payTitle}>Виплати (× ставка) за 8–9 / 10–11 / 12+ символів будь-де</Text>
        {[...config.symbols].reverse().map((s) => (
          <View key={s.id} style={styles.payRow}>
            <Text style={styles.payEmoji}>{s.emoji}</Text>
            <Text style={styles.payText}>{s.pays.map((p) => `×${p}`).join(' / ')}</Text>
          </View>
        ))}
        <Text style={styles.payText}>
          {config.scatter.emoji} 4+ будь-де: {config.freeSpins} фриспінів (і ×3/×5/×100 ставки за 4/5/6). У бонусі 3+ {config.scatter.emoji} дають ще {config.retrigger}.
        </Text>
        <Text style={styles.payText}>
          {config.bomb.emoji} бомба з множником ×2…×100: усі множники на полі складаються і множать виграш оберту.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center' },
  bonusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#3B0764',
    borderRadius: 14,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bonusText: { color: colors.gold, fontWeight: '900' },
  machine: { padding: 8, borderRadius: 20, borderWidth: 4, overflow: 'hidden' },
  cols: { flexDirection: 'row', gap: 4 },
  col: { gap: 4, overflow: 'visible' },
  cell: { borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.92)' },
  multTag: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 4,
  },
  multText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11 },
  multOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  multBig: { color: colors.gold, fontSize: 64, fontWeight: '900', textShadowColor: '#000', textShadowRadius: 8 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  paytable: { width: '100%', backgroundColor: colors.surface, borderRadius: 16, padding: 12, gap: 4 },
  payTitle: { color: colors.muted, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  payRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  payEmoji: { fontSize: 22, width: 32, textAlign: 'center' },
  payText: { color: colors.text, fontSize: 13, flex: 1 },
});
