import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { sfx } from '../audio/sound';
import { BigButton, Panel } from '../components/ui';
import { friendsEnabled } from '../config';
import { Profile, claimReferral, claimTransfers, friendlyError, inviteLink, myProfile, myReferrals, startFriends, topReferrers } from '../state/friends';
import { useWallet } from '../state/WalletContext';
import { telegramName, telegramShare } from '../telegram';
import { colors, formatCoins, formatShort } from '../theme';

// Призи запрошувачу за кількість друзів (нараховує сервер, docs/supabase-v12.sql).
export const REF_MILESTONES = [
  { n: 3, prize: 30000 },
  { n: 5, prize: 50000 },
  { n: 10, prize: 100000 },
  { n: 25, prize: 300000 },
  { n: 50, prize: 500000 },
];

/** Реферальна програма: ти і друг отримуєте по 200 ₴. */
export function InvitePanel() {
  const wallet = useWallet();
  const [me, setMe] = useState<Profile | null>(myProfile());
  const [count, setCount] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [top, setTop] = useState<{ name: string; invited: number }[]>([]);

  useEffect(() => {
    if (!friendsEnabled()) return;
    startFriends(telegramName() ?? 'Гравець')
      .then((p) => {
        setMe(p);
        return myReferrals();
      })
      .then(setCount)
      .catch(() => {});
    topReferrers().then(setTop).catch(() => {});
  }, []);

  if (!friendsEnabled()) return null;
  const link = me ? inviteLink(me.code) : '';
  const text = `🎰 Грай зі мною в Casino Victor: слоти, шахта, Потужноліт і дуелі! За цим посиланням ми обидва отримаємо по 200 ігрових ₴. Мій код: ${me?.code ?? ''}`;
  const next = REF_MILESTONES.find((m) => (count ?? 0) < m.n);

  const share = async () => {
    if (!me) return;
    if (telegramShare(link, text)) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.share) await navigator.share({ text, url: link });
      else if (Platform.OS !== 'web') await Share.share({ message: `${text}\n${link}` });
      else throw new Error('no share');
    } catch {
      await Clipboard.setStringAsync(`${text}\n${link}`).catch(() => {});
      setMsg({ text: 'Посилання скопійовано, встав його другу', ok: true });
    }
  };

  const enter = async () => {
    try {
      const name = await claimReferral(code);
      const got = await claimTransfers();
      if (got > 0) wallet.credit(got);
      sfx('cash');
      setCode('');
      setMsg({ text: `Готово! Тобі і ${name} по 200 ₴`, ok: true });
    } catch (e) {
      setMsg({ text: friendlyError(e), ok: false });
    }
  };

  return (
    <Panel style={styles.panel}>
      <Text style={styles.title}>👥 Запроси друга: +200 ₴ вам обом + призи</Text>
      <Text style={styles.sub}>Надішли посилання. Коли друг відкриє гру, ти і він отримаєте по 200 ₴, і ви одразу станете друзями.</Text>
      <View style={styles.linkBox}>
        <Text style={styles.link} numberOfLines={1}>
          {link || '…'}
        </Text>
      </View>
      <BigButton label="📤 ПОДІЛИТИСЯ" disabled={!me} onPress={share} />
      <Text style={styles.sub}>
        Твій код: <Text style={styles.code}>{me?.code ?? '…'}</Text>
        {count != null ? ` · запрошено друзів: ${count}` : ''}
      </Text>
      <View style={styles.row}>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          placeholder="Маєш код друга?"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          maxLength={6}
          style={styles.input}
        />
        <BigButton label="ОК" style={styles.btn} disabled={code.length < 6} onPress={enter} />
      </View>
      {msg && <Text style={[styles.msg, { color: msg.ok ? colors.green : colors.red }]}>{msg.text}</Text>}
      <Text style={styles.mileTitle}>🏅 Призи за друзів</Text>
      <View style={styles.miles}>
        {REF_MILESTONES.map((m) => {
          const done = (count ?? 0) >= m.n;
          return (
            <View key={m.n} style={[styles.mile, done && styles.mileDone]}>
              <Text style={styles.mileN}>{m.n} 👥</Text>
              <Text style={[styles.milePrize, done && { color: colors.green }]}>{done ? '✓' : `+${formatShort(m.prize)}`}</Text>
            </View>
          );
        })}
      </View>
      {next && (
        <>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.min(100, ((count ?? 0) / next.n) * 100)}%` }]} />
          </View>
          <Text style={styles.sub}>
            Ще {next.n - (count ?? 0)} до призу {formatCoins(next.prize)}
          </Text>
        </>
      )}
      {top.length > 0 && (
        <>
          <Text style={styles.mileTitle}>👑 Топ запрошувачів</Text>
          {top.slice(0, 5).map((t, i) => (
            <Text key={i} style={styles.topRow}>
              {['🥇', '🥈', '🥉', '4.', '5.'][i]} {t.name} · {t.invited} друзів
            </Text>
          ))}
        </>
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 8 },
  title: { color: colors.text, fontWeight: '900', fontSize: 16 },
  sub: { color: colors.muted, fontSize: 12 },
  code: { color: colors.gold, fontWeight: '900', letterSpacing: 2 },
  linkBox: { backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 },
  link: { color: colors.text, fontSize: 13 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.bg,
  },
  btn: { width: 80, paddingVertical: 10 },
  msg: { fontWeight: '700', textAlign: 'center' },
  mileTitle: { color: colors.text, fontWeight: '900', fontSize: 14, marginTop: 6 },
  miles: { flexDirection: 'row', gap: 6 },
  mile: { flex: 1, alignItems: 'center', backgroundColor: colors.bg, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 6 },
  mileDone: { borderColor: colors.green },
  mileN: { color: colors.muted, fontSize: 11, fontWeight: '800' },
  milePrize: { color: colors.gold, fontSize: 11, fontWeight: '900' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.gold },
  topRow: { color: colors.text, fontSize: 13 },
});
