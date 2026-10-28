import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { Panel } from '../components/ui';
import { friendsEnabled } from '../config';
import { claimTransfers, createStarsInvoice } from '../state/friends';
import { STAR_PACKS } from '../state/stars';
import { useWallet } from '../state/WalletContext';
import { inTelegram, telegramPay } from '../telegram';
import { colors, formatCoins } from '../theme';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Поповнення ігрових ₴ за Telegram Stars. Працює лише всередині Telegram. */
export function StarsPanel() {
  const wallet = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  if (!friendsEnabled()) return null;
  const tg = inTelegram();

  const buy = async (pack: (typeof STAR_PACKS)[number]) => {
    if (busy) return;
    setBusy(pack.id);
    setMsg(null);
    try {
      const link = await createStarsInvoice(pack.id);
      const status = await telegramPay(link);
      if (status !== 'paid') {
        setMsg({ text: status === 'cancelled' ? 'Оплату скасовано' : 'Оплата не пройшла', ok: false });
        return;
      }
      setMsg({ text: 'Оплачено! Зараховую…', ok: true });
      // Бот зараховує ₴ за кілька секунд після оплати.
      for (let k = 0; k < 10; k++) {
        await sleep(2000);
        const got = await claimTransfers().catch(() => 0);
        if (got > 0) {
          wallet.credit(got);
          sfx('cash');
          wallet.notify(`⭐ Зараховано ${formatCoins(got)}. Дякуємо!`);
          setMsg({ text: `Зараховано ${formatCoins(got)}`, ok: true });
          return;
        }
      }
      setMsg({ text: 'Оплата пройшла, ₴ прийдуть протягом хвилини', ok: true });
    } catch (e) {
      setMsg({ text: `Не вдалося створити оплату (${e instanceof Error ? e.message : 'помилка'})`, ok: false });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel style={styles.panel}>
      <Text style={styles.title}>⭐ Поповнити ігрові ₴</Text>
      <Text style={styles.sub}>
        {tg ? 'Оплата зірками Telegram (Stars).' : 'Поповнення доступне, коли граєш через бота в Telegram.'} Ігрові ₴ не можна вивести чи обміняти на
        справжні гроші.
      </Text>
      <View style={styles.grid}>
        {STAR_PACKS.map((p) => (
          <Pressable key={p.id} disabled={!tg || !!busy} onPress={() => buy(p)} style={[styles.pack, (!tg || (busy && busy !== p.id)) && styles.off]}>
            <Text style={styles.amount}>{formatCoins(p.amount)}</Text>
            <Text style={styles.price}>{busy === p.id ? '…' : `⭐ ${p.stars}`}</Text>
          </Pressable>
        ))}
      </View>
      {msg && <Text style={[styles.sub, { color: msg.ok ? colors.green : colors.red }]}>{msg.text}</Text>}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 16 },
  sub: { color: colors.muted, fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pack: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.gold,
    backgroundColor: colors.bg,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  off: { opacity: 0.5 },
  amount: { color: colors.gold, fontWeight: '900', fontSize: 16 },
  price: { color: colors.text, fontWeight: '800', fontSize: 14 },
});
