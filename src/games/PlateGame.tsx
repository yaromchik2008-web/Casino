import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { celebrate } from '../components/Celebration';
import { BigButton, Panel, ResultLine, haptic } from '../components/ui';
import { friendsEnabled } from '../config';
import { cloudStateOn, friendlyError, myProfile, plateRelease, plateReserve, showPlate, startFriends } from '../state/friends';
import { topCar } from '../state/shop';
import { useWallet } from '../state/WalletContext';
import { telegramName } from '../telegram';
import { colors, formatCoins } from '../theme';
import { GameInfo } from './catalog';
import { FIRST, LAST, PLATE_COST, TIERS, plateTier, randomPlate } from './plateEngine';

const SPIN_MS = 1400;
const CHAR_MS = 120;
const DIGITS = '0123456789';

/** Номерний знак: синя смужка з UA і чорні символи на білому. */
export function PlateView({ text, big, glow }: { text: string; big?: boolean; glow?: boolean }) {
  return (
    <View style={[styles.plate, big && styles.plateBig, glow && styles.plateGlow]}>
      <View style={[styles.flag, big && styles.flagBig]}>
        <View style={styles.flagBlue} />
        <View style={styles.flagYellow} />
        <Text style={[styles.ua, big && styles.uaBig]}>UA</Text>
      </View>
      <Text style={[styles.plateText, big && styles.plateTextBig]} numberOfLines={1} adjustsFontSizeToFit>
        {text}
      </Text>
    </View>
  );
}

function scramble(target: string, settled: number) {
  // Перші settled символів уже зупинились, решта ще крутиться.
  return target
    .split('')
    .map((ch, i) => {
      if (i < settled || ch === ' ') return ch;
      if (/\d/.test(ch)) return DIGITS[Math.floor(Math.random() * 10)];
      const pool = (i < 3 ? FIRST : LAST).join('').replace(/[^A-ZА-ЯІ]/g, '');
      return pool[Math.floor(Math.random() * pool.length)];
    })
    .join('');
}

export function PlateGame({ game }: { game: GameInfo }) {
  const wallet = useWallet();
  const [shown, setShown] = useState('АА 0000 АА');
  const [result, setResult] = useState<{ plate: string; value: number; title: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState({ text: 'Крути і вибивай гарний номер!', tone: 'neutral' as 'win' | 'lose' | 'neutral' });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(true);

  useEffect(
    () => () => {
      alive.current = false;
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  // Номер, який гравець не встиг ні забрати, ні продати, лишається йому.
  const pending = useRef<{ plate: string; value: number } | null>(null);
  useEffect(
    () => () => {
      if (pending.current) wallet.addPlate(pending.current.plate, pending.current.value);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const keep = (r = result) => {
    if (!r) return;
    wallet.addPlate(r.plate, r.value);
    pending.current = null;
    // Ексклюзивний номер одразу показуємо в профілі поруч з авто.
    if (r.value >= TIERS.exclusive.value) showPlate(r.plate).catch(() => {});
    setResult(null);
    setMessage({ text: `${r.plate} тепер у твоєму майні`, tone: 'win' });
    sfx('cash');
  };

  const sell = async () => {
    const r = result;
    if (!r) return;
    setResult(null);
    pending.current = null;
    wallet.addPlate(r.plate, r.value);
    wallet.sellPlate(r.plate);
    plateRelease(r.plate).catch(() => {});
    setMessage({ text: `Продано за ${formatCoins(r.value)}`, tone: 'win' });
    sfx('cash');
  };

  const spin = async () => {
    if (busy) return;
    if (result) keep(); // новий оберт забирає попередній номер у майно
    if (!friendsEnabled()) return setMessage({ text: 'Номери працюють лише з сервером', tone: 'lose' });
    if (!wallet.bet(game.id, 'fast', PLATE_COST)) return setMessage({ text: `Потрібно ${formatCoins(PLATE_COST)}`, tone: 'lose' });
    setBusy(true);
    setMessage({ text: 'Крутимо…', tone: 'neutral' });
    sfx('spin', 0.5);
    let plate = '';
    try {
      if (!myProfile()) await startFriends(telegramName() ?? 'Гравець');
      // Кожен номер унікальний: якщо такий уже в когось, сервер відмовить, і ми візьмемо інший.
      for (let k = 0; k < 12 && !plate; k++) {
        const p = randomPlate();
        if (await plateReserve(p, plateTier(p).value)) plate = p;
      }
      if (!plate) throw new Error('taken');
    } catch (e) {
      wallet.credit(PLATE_COST);
      setBusy(false);
      setMessage({ text: cloudStateOn() ? friendlyError(e) : 'На сервері ще не запущено SQL з docs/supabase-v13.sql', tone: 'lose' });
      return;
    }
    const tier = plateTier(plate);
    pending.current = { plate, value: tier.value };
    const start = Date.now();
    const total = plate.length;
    timer.current = setInterval(() => {
      const t = Date.now() - start;
      const settled = t < SPIN_MS ? 0 : Math.min(total, Math.floor((t - SPIN_MS) / CHAR_MS) + 1);
      setShown(SPECIAL_LEN(plate) ? (settled >= total ? plate : scramble('АА 0000 АА', 0)) : scramble(plate, settled));
      if (settled >= total) {
        clearInterval(timer.current!);
        timer.current = null;
        if (!alive.current) return;
        setShown(plate);
        setBusy(false);
        setResult({ plate, value: tier.value, title: tier.title });
        haptic('win');
        if (tier.value >= TIERS.elite.value) {
          celebrate({ kind: 'total', title: tier.title.toUpperCase(), amount: tier.value, emoji: '🚘' });
        } else if (tier.value > TIERS.plain.value) sfx('bigwin');
        else sfx('win');
        setMessage({ text: `${tier.title}: ${formatCoins(tier.value)}`, tone: tier.value > PLATE_COST ? 'win' : 'neutral' });
      }
    }, 50);
  };

  const plates = wallet.state.plates ?? [];
  const car = topCar(wallet.state.owned);
  const best = [...plates].sort((a, b) => b.value - a.value)[0];

  return (
    <View style={styles.root}>
      <Panel style={styles.stage}>
        <PlateView text={shown} big glow={!!result && result.value >= TIERS.pairs.value} />
        {result && <Text style={styles.tier}>{result.title} · {formatCoins(result.value)}</Text>}
      </Panel>
      <ResultLine text={message.text} tone={message.tone} />
      {result ? (
        <View style={styles.choice}>
          <BigButton label="🚘 У МАЙНО" color={colors.blue} onPress={() => keep()} style={styles.half} />
          <BigButton label="💰 ПРОДАТИ" onPress={sell} style={styles.half} />
        </View>
      ) : null}
      <BigButton label={busy ? 'КРУТИМО…' : `КРУТИТИ · ${formatCoins(PLATE_COST)}`} disabled={busy} onPress={spin} color={colors.gold} />
      {car && best && best.value >= TIERS.exclusive.value && (
        <Text style={styles.note}>
          У профілі: {car.emoji} {car.title} · {best.id}
        </Text>
      )}
      <Panel style={styles.rules}>
        <Text style={styles.rulesTitle}>Скільки коштує номер</Text>
        {[
          ['96 000 ₴', '0001, 0007, 7777 та іменні АУЕ, VIKTOR, МВС, ВОР, ВАСИЛЬ'],
          ['60 000 ₴', 'чотири однакові (1111…9999, крім 6666 і 7777), 0002–0009'],
          ['18 000 ₴', 'по порядку 0123, 1234; дві пари 1122, 9900; три в кінці 2111'],
          ['12 000 ₴', '00 і дві різні цифри (0023), 0006, 6666'],
          ['4 800 ₴', 'дзеркальні 1001, пари 2020, шістки 0666, 6677'],
          ['1 000 ₴', 'усі інші'],
        ].map(([v, t]) => (
          <Text key={v} style={styles.rule}>
            <Text style={styles.ruleValue}>{v}</Text> — {t}
          </Text>
        ))}
        <Text style={styles.rule}>Кожен номер у грі лише один. Забраний номер лежить у «Майно», його можна продати будь-коли.</Text>
      </Panel>
    </View>
  );
}

function SPECIAL_LEN(plate: string) {
  return !plate.includes(' ');
}

const styles = StyleSheet.create({
  root: { gap: 12, alignItems: 'center', width: '100%' },
  stage: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 28, gap: 12, backgroundColor: '#0F172A' },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#111827',
    overflow: 'hidden',
    height: 40,
    minWidth: 180,
  },
  plateBig: { height: 72, minWidth: 300, borderRadius: 10, borderWidth: 3 },
  plateGlow: { shadowColor: colors.gold, shadowOpacity: 0.9, shadowRadius: 18, shadowOffset: { width: 0, height: 0 }, borderColor: colors.gold },
  flag: { width: 22, alignSelf: 'stretch', backgroundColor: '#1D4ED8', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 3 },
  flagBig: { width: 36, paddingBottom: 6 },
  flagBlue: { position: 'absolute', top: 5, width: 14, height: 5, backgroundColor: '#3B82F6' },
  flagYellow: { position: 'absolute', top: 10, width: 14, height: 5, backgroundColor: '#FACC15' },
  ua: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  uaBig: { fontSize: 14 },
  plateText: { flex: 1, textAlign: 'center', color: '#111827', fontSize: 22, fontWeight: '900', letterSpacing: 1, paddingHorizontal: 8 },
  plateTextBig: { fontSize: 38, letterSpacing: 2 },
  tier: { color: colors.gold, fontWeight: '900', fontSize: 16 },
  choice: { flexDirection: 'row', gap: 8, alignSelf: 'stretch' },
  half: { flex: 1 },
  note: { color: colors.muted, fontSize: 12 },
  rules: { alignSelf: 'stretch', gap: 4 },
  rulesTitle: { color: colors.text, fontWeight: '900', fontSize: 15 },
  rule: { color: colors.muted, fontSize: 12 },
  ruleValue: { color: colors.gold, fontWeight: '900' },
});
