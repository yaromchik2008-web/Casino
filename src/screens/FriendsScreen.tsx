import { ComponentRef, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { sfx } from '../audio/sound';
import { BigButton, Chip, Panel, parseMoney } from '../components/ui';
import { friendsEnabled } from '../config';
import {
  Message,
  Profile,
  addFriend,
  friendlyError,
  listFriends,
  loadMessages,
  myProfile,
  removeFriend,
  sendCoins,
  sendMessage,
  startFriends,
  syncProfile,
} from '../state/friends';
import { useWallet } from '../state/WalletContext';
import { telegramName } from '../telegram';
import { colors, formatCoins } from '../theme';

function seen(iso: string) {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 2) return 'в мережі';
  if (min < 60) return `${min} хв тому`;
  if (min < 1440) return `${Math.floor(min / 60)} год тому`;
  return `${Math.floor(min / 1440)} дн тому`;
}

function Chat({ friend, onBack }: { friend: Profile; onBack: () => void }) {
  const wallet = useWallet();
  const me = myProfile();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [amount, setAmount] = useState('');
  const [showSend, setShowSend] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);

  const refresh = useCallback(() => {
    loadMessages(friend.id)
      .then(setMessages)
      .catch((e) => setError(friendlyError(e)));
  }, [friend.id]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      await sendMessage(friend.id, body);
      sfx('click');
      refresh();
    } catch (e) {
      setError(friendlyError(e));
    }
  };

  const give = async () => {
    const v = parseMoney(amount);
    if (!v) return setError('Введи суму, наприклад 25');
    if (!wallet.spend(v)) return setError('Недостатньо коштів');
    try {
      await sendCoins(friend.id, v);
      await sendMessage(friend.id, `🎁 Надіслав тобі ${formatCoins(v)}`);
      sfx('cash');
      wallet.notify(`${friend.name} отримає ${formatCoins(v)}`);
      setAmount('');
      setShowSend(false);
      setError(null);
      refresh();
    } catch (e) {
      wallet.credit(v);
      setError(friendlyError(e));
    }
  };

  return (
    <View style={styles.flex}>
      <View style={styles.chatHead}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.back}>‹ Друзі</Text>
        </Pressable>
        <View style={styles.flex}>
          <Text style={styles.chatName}>{friend.name}</Text>
          <Text style={styles.muted}>
            {friend.status} · ⭐ {friend.level} · {formatCoins(friend.balance)} · {seen(friend.updated_at)}
          </Text>
        </View>
      </View>
      <ScrollView
        ref={scroll}
        style={styles.flex}
        contentContainerStyle={styles.messages}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 && <Text style={styles.empty}>Напиши першим 👋</Text>}
        {messages.map((m) => {
          const mine = m.sender === me?.id;
          return (
            <View key={m.id} style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
              <Text style={styles.bubbleText}>{m.body}</Text>
              <Text style={styles.time}>{new Date(m.created_at).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}</Text>
            </View>
          );
        })}
      </ScrollView>
      {error && <Text style={styles.error}>{error}</Text>}
      {showSend && (
        <View style={[styles.sendRow, styles.pad]}>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="decimal-pad"
            placeholder="Сума, ₴"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.flex]}
          />
          <BigButton label="НАДІСЛАТИ ₴" style={styles.smallBtn} onPress={give} />
        </View>
      )}
      <View style={[styles.sendRow, styles.pad]}>
        <Pressable onPress={() => setShowSend(!showSend)} style={styles.gift}>
          <Text style={styles.giftText}>🎁</Text>
        </Pressable>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder="Повідомлення"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.flex]}
          maxLength={500}
        />
        <BigButton label="➤" style={styles.sendBtn} onPress={send} />
      </View>
      <Pressable
        style={styles.remove}
        onPress={async () => {
          if (!confirmRemove) return setConfirmRemove(true);
          try {
            await removeFriend(friend.id);
            onBack();
          } catch (e) {
            setError(friendlyError(e));
          }
        }}
      >
        <Text style={styles.removeText}>{confirmRemove ? 'Точно видалити з друзів? Натисни ще раз' : 'Видалити з друзів'}</Text>
      </Pressable>
    </View>
  );
}

export function FriendsScreen() {
  const wallet = useWallet();
  const [me, setMe] = useState<Profile | null>(myProfile());
  const [friends, setFriends] = useState<Profile[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [editName, setEditName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chat, setChat] = useState<Profile | null>(null);

  const refresh = useCallback(() => {
    listFriends()
      .then(setFriends)
      .catch((e) => setError(friendlyError(e)));
  }, []);

  useEffect(() => {
    if (!friendsEnabled()) return;
    startFriends(telegramName() ?? 'Гравець')
      .then((p) => {
        setMe(p);
        setName(p.name);
        refresh();
      })
      .catch((e) => setError(friendlyError(e)));
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  if (!friendsEnabled()) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <Panel style={styles.hero}>
          <Text style={styles.big}>👥</Text>
          <Text style={styles.title}>Друзі скоро будуть</Text>
          <Text style={styles.muted}>
            Тут можна буде додати друга за кодом, бачити його рахунок, переписуватись і надсилати йому ігрові гривні.
            Розділ запрацює, щойно підключимо сервер.
          </Text>
        </Panel>
      </ScrollView>
    );
  }

  if (chat) return <Chat friend={chat} onBack={() => (setChat(null), refresh())} />;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Panel style={styles.hero}>
        <Text style={styles.muted}>Твій код друга</Text>
        <Text style={styles.code}>{me?.code ?? '…'}</Text>
        <Text style={styles.muted}>Скажи його другу, щоб він тебе додав</Text>
        {editName ? (
          <View style={styles.sendRow}>
            <TextInput value={name} onChangeText={setName} maxLength={24} style={[styles.input, styles.flex]} />
            <BigButton
              label="OK"
              style={styles.smallBtn}
              onPress={async () => {
                await syncProfile({ name: name.trim() || 'Гравець' });
                setMe(myProfile());
                setEditName(false);
              }}
            />
          </View>
        ) : (
          <Chip label={`✎ Ім'я: ${me?.name ?? ''}`} onPress={() => setEditName(true)} />
        )}
      </Panel>

      <Panel style={styles.addPanel}>
        <Text style={styles.title}>Додати друга</Text>
        <View style={styles.sendRow}>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.toUpperCase())}
            placeholder="Код, напр. K7Q2MX"
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            maxLength={6}
            style={[styles.input, styles.flex]}
          />
          <BigButton
            label="ДОДАТИ"
            style={styles.smallBtn}
            disabled={code.trim().length < 6}
            onPress={async () => {
              try {
                await addFriend(code);
                setCode('');
                setError(null);
                sfx('win');
                wallet.notify('Друга додано!');
                refresh();
              } catch (e) {
                setError(friendlyError(e));
              }
            }}
          />
        </View>
        {error && <Text style={styles.error}>{error}</Text>}
      </Panel>

      <Text style={styles.title}>Друзі ({friends.length})</Text>
      {friends.length === 0 && <Text style={styles.empty}>Поки нікого. Додай друга за кодом!</Text>}
      {friends.map((f, i) => (
        <Pressable key={f.id} onPress={() => setChat(f)}>
          <Panel style={styles.friend}>
            <Text style={styles.rank}>{i + 1}</Text>
            <View style={styles.flex}>
              <Text style={styles.friendName}>{f.name}</Text>
              <Text style={styles.muted}>
                {f.status} · ⭐ {f.level} · {seen(f.updated_at)}
              </Text>
            </View>
            <View style={styles.right}>
              <Text style={styles.balance}>{formatCoins(f.balance)}</Text>
              <Text style={styles.muted}>💬 написати</Text>
            </View>
          </Panel>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { alignItems: 'center', gap: 6 },
  big: { fontSize: 48 },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  muted: { color: colors.muted, fontSize: 12, textAlign: 'left' },
  code: { color: colors.gold, fontSize: 36, fontWeight: '900', letterSpacing: 6 },
  addPanel: { gap: 8 },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 0 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.bg,
  },
  pad: { paddingHorizontal: 12, paddingBottom: 8 },
  smallBtn: { width: 'auto', paddingHorizontal: 16, paddingVertical: 10 },
  sendBtn: { width: 52, paddingVertical: 10 },
  error: { color: colors.red, fontWeight: '700', textAlign: 'center' },
  empty: { color: colors.muted, textAlign: 'center', marginVertical: 12 },
  friend: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rank: { color: colors.gold, fontWeight: '900', fontSize: 18, width: 24, textAlign: 'center' },
  friendName: { color: colors.text, fontWeight: '800', fontSize: 15 },
  right: { alignItems: 'flex-end' },
  balance: { color: colors.gold, fontWeight: '900' },
  chatHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.gold, fontSize: 16, fontWeight: '800' },
  chatName: { color: colors.text, fontSize: 16, fontWeight: '900' },
  messages: { padding: 12, gap: 6 },
  bubble: { maxWidth: '80%', borderRadius: 14, paddingVertical: 8, paddingHorizontal: 12 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accent },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surfaceAlt },
  bubbleText: { color: '#FFFFFF', fontSize: 15 },
  time: { color: 'rgba(255,255,255,0.6)', fontSize: 10, alignSelf: 'flex-end', marginTop: 2 },
  gift: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  giftText: { fontSize: 22 },
  remove: { alignItems: 'center', paddingVertical: 8 },
  removeText: { color: colors.muted, fontSize: 12 },
});
