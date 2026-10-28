import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { Platform, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { sfx } from '../audio/sound';
import { BigButton, Panel } from '../components/ui';
import { friendsEnabled } from '../config';
import { Profile, claimReferral, claimTransfers, friendlyError, inviteLink, myProfile, myReferrals, startFriends } from '../state/friends';
import { useWallet } from '../state/WalletContext';
import { telegramName, telegramShare } from '../telegram';
import { colors } from '../theme';

/** Реферальна програма: ти і друг отримуєте по 200 ₴. */
export function InvitePanel() {
  const wallet = useWallet();
  const [me, setMe] = useState<Profile | null>(myProfile());
  const [count, setCount] = useState<number | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    if (!friendsEnabled()) return;
    startFriends(telegramName() ?? 'Гравець')
      .then((p) => {
        setMe(p);
        return myReferrals();
      })
      .then(setCount)
      .catch(() => {});
  }, []);

  if (!friendsEnabled()) return null;
  const link = me ? inviteLink(me.code) : '';
  const text = `Грай зі мною в Casino Victor! За цим посиланням ми обидва отримаємо по 200 ₴. Мій код: ${me?.code ?? ''}`;

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
      <Text style={styles.title}>👥 Запроси друга: +200 ₴ вам обом</Text>
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
});
