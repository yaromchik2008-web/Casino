import { ComponentRef, useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AdminKind, Profile, adminAct, adminPlayers, friendlyError, myProfile, takeAdminActions } from '../state/friends';
import { SHOP_ITEMS, findItem } from '../state/shop';
import { useWallet } from '../state/WalletContext';
import { formatCoins } from '../theme';

// Термінал розробника: відкривається промокодом «hi» лише в гравця 777777.
// Усі команди йдуть через сервер, який сам перевіряє права (docs/supabase-v12.sql).

const MONO = Platform.select({ web: 'ui-monospace, Menlo, Consolas, monospace', ios: 'Menlo', default: 'monospace' });
const GREEN = '#4ADE80';

const HELP = [
  'help                 — ця довідка',
  'list [пошук]         — гравці (код або ім’я)',
  'find КОД             — інфо про гравця',
  'items                — коди майна',
  'bal КОД СУМА         — встановити баланс (₴)',
  'add КОД СУМА         — нарахувати ₴',
  'take КОД СУМА        — забрати ₴',
  'give КОД ПРЕДМЕТ     — подарувати майно',
  'rm КОД ПРЕДМЕТ       — забрати майно',
  'lvl КОД N            — встановити рівень',
  'msg КОД ТЕКСТ        — повідомлення гравцю',
  'reset КОД            — скинути прогрес гравця',
  'clear                — очистити екран',
  'КОД = me — це ти',
];

export function AdminTerminal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const wallet = useWallet();
  const [lines, setLines] = useState<string[]>(['Casino Victor dev terminal. Напиши help']);
  const [cmd, setCmd] = useState('');
  const [players, setPlayers] = useState<Profile[]>([]);
  const [target, setTarget] = useState<Profile | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const myCode = myProfile()?.code ?? '';

  const out = (...l: string[]) => setLines((prev) => [...prev, ...l].slice(-200));

  const refresh = async (q = '') => {
    try {
      const list = await adminPlayers(q);
      setPlayers(list);
      return list;
    } catch (e) {
      out(`✖ ${friendlyError(e)}`);
      return [];
    }
  };

  useEffect(() => {
    if (visible) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const resolve = (code: string) => (code.toLowerCase() === 'me' ? myCode : code.toUpperCase());

  // Команда собі застосовується одразу, іншим гравцям — коли їхня гра синхронізується (до 30 с).
  const act = async (code: string, kind: AdminKind, opts: { value?: number; item?: string; note?: string } = {}) => {
    const c = resolve(code);
    setBusy(true);
    try {
      const name = await adminAct(c, kind, opts);
      out(`✔ ${name} (${c}): ${kind}${opts.value != null ? ` ${formatCoins(opts.value)}` : ''}${opts.item ? ` ${opts.item}` : ''}`);
      if (c === myCode) for (const a of await takeAdminActions()) wallet.adminApply(a);
      else out('  гравець отримає протягом 30 с');
      const list = await refresh();
      const t = list.find((p) => p.code === c);
      if (t) setTarget(t);
    } catch (e) {
      out(`✖ ${friendlyError(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const money = (s?: string) => {
    const v = Number(String(s ?? '').replace(',', '.').replace(/\s/g, ''));
    return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) : null;
  };

  const run = async (raw: string) => {
    const line = raw.trim();
    if (!line) return;
    out(`> ${line}`);
    const [c, a1, ...rest] = line.split(/\s+/);
    const a2 = rest.join(' ');
    switch (c.toLowerCase()) {
      case 'help':
        out(...HELP);
        break;
      case 'clear':
        setLines([]);
        break;
      case 'items':
        out(...SHOP_ITEMS.map((i) => `${i.id.padEnd(16)} ${i.emoji} ${i.title}`));
        break;
      case 'list': {
        const list = await refresh(a1 ? [a1, a2].join(' ').trim() : '');
        out(...list.map((p) => `${p.code}  ${p.name.padEnd(14)} ${formatCoins(p.balance)}  рів.${p.level}`), `${list.length} гравців`);
        break;
      }
      case 'find': {
        if (!a1) return out('✖ find КОД');
        const list = await refresh(resolve(a1));
        const p = list.find((x) => x.code === resolve(a1));
        if (!p) return out('✖ не знайдено');
        setTarget(p);
        out(
          `${p.code} ${p.name} · ${formatCoins(p.balance)} · рів.${p.level} · ${p.status}`,
          `майно: ${(p.owned ?? []).map((id) => findItem(id)?.emoji ?? id).join(' ') || '—'}`,
        );
        break;
      }
      case 'bal':
      case 'add':
      case 'take': {
        const v = money(a2);
        if (!a1 || v == null) return out(`✖ ${c} КОД СУМА`);
        await act(a1, c === 'bal' ? 'balance_set' : c === 'add' ? 'balance_add' : 'balance_take', { value: v });
        break;
      }
      case 'give':
      case 'rm': {
        if (!a1 || !findItem(a2)) return out(`✖ ${c} КОД ПРЕДМЕТ (див. items)`);
        await act(a1, c === 'give' ? 'item_give' : 'item_take', { item: a2 });
        break;
      }
      case 'lvl': {
        const n = Math.round(Number(a2));
        if (!a1 || !Number.isFinite(n) || n < 1) return out('✖ lvl КОД N');
        await act(a1, 'level_set', { value: n });
        break;
      }
      case 'msg':
        if (!a1 || !a2) return out('✖ msg КОД ТЕКСТ');
        await act(a1, 'message', { note: a2.slice(0, 300) });
        break;
      case 'reset':
        if (!a1) return out('✖ reset КОД');
        await act(a1, 'reset');
        break;
      default:
        out('✖ невідома команда, напиши help');
    }
  };

  const submit = () => {
    const c = cmd;
    setCmd('');
    run(c);
  };

  const t = target;
  const v = money(amount);
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.box}>
          <View style={styles.head}>
            <Text style={styles.title}>🛠️ ТЕРМІНАЛ РОЗРОБНИКА</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <ScrollView style={styles.body} contentContainerStyle={{ gap: 10, paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
            <View style={styles.console}>
              <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} nestedScrollEnabled>
                {lines.map((l, i) => (
                  <Text key={i} style={styles.line}>
                    {l}
                  </Text>
                ))}
              </ScrollView>
            </View>
            <View style={styles.row}>
              <Text style={styles.prompt}>$</Text>
              <TextInput
                value={cmd}
                onChangeText={setCmd}
                onSubmitEditing={submit}
                placeholder="help"
                placeholderTextColor="#2F6B45"
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { flex: 1 }]}
              />
              <Pressable onPress={submit} style={styles.btn}>
                <Text style={styles.btnText}>RUN</Text>
              </Pressable>
            </View>

            <Text style={styles.section}>ГРАВЦІ</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {players.map((p) => (
                <Pressable key={p.id} onPress={() => setTarget(p)} style={[styles.chip, t?.id === p.id && styles.chipOn]}>
                  <Text style={styles.chipText}>
                    {p.code === myCode ? '⭐ ' : ''}
                    {p.name} · {p.code}
                  </Text>
                  <Text style={styles.chipSub}>{formatCoins(p.balance)}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {t && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>
                  {t.name} · {t.code} · рів.{t.level}
                </Text>
                <Text style={styles.cardSub}>
                  Баланс {formatCoins(t.balance)} · {t.status}
                </Text>
                <View style={styles.row}>
                  <TextInput
                    value={amount}
                    onChangeText={setAmount}
                    placeholder="сума ₴ / рівень"
                    placeholderTextColor="#2F6B45"
                    keyboardType="decimal-pad"
                    style={[styles.input, { flex: 1 }]}
                  />
                </View>
                <View style={styles.row}>
                  <Btn label="= БАЛАНС" disabled={busy || v == null} onPress={() => act(t.code, 'balance_set', { value: v! })} />
                  <Btn label="+ ДАТИ" disabled={busy || !v} onPress={() => act(t.code, 'balance_add', { value: v! })} />
                  <Btn label="− ЗАБРАТИ" disabled={busy || !v} onPress={() => act(t.code, 'balance_take', { value: v! })} />
                  <Btn
                    label="РІВЕНЬ"
                    disabled={busy || !Number(amount)}
                    onPress={() => act(t.code, 'level_set', { value: Math.round(Number(amount)) })}
                  />
                </View>
                <Text style={styles.section}>МАЙНО (тисни, щоб дати або забрати)</Text>
                <View style={styles.items}>
                  {SHOP_ITEMS.map((i) => {
                    const has = (t.owned ?? []).includes(i.id);
                    return (
                      <Pressable
                        key={i.id}
                        disabled={busy}
                        onPress={() => act(t.code, has ? 'item_take' : 'item_give', { item: i.id })}
                        style={[styles.item, has && styles.itemOn]}
                      >
                        <Text style={styles.itemText}>
                          {i.emoji} {i.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.row}>
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="повідомлення гравцю"
                    placeholderTextColor="#2F6B45"
                    style={[styles.input, { flex: 1 }]}
                  />
                  <Btn
                    label="НАДІСЛАТИ"
                    disabled={busy || !note.trim()}
                    onPress={() => {
                      act(t.code, 'message', { note: note.trim() });
                      setNote('');
                    }}
                  />
                </View>
                <Btn label="СКИНУТИ ПРОГРЕС" danger disabled={busy} onPress={() => run(`reset ${t.code}`)} />
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function Btn({ label, onPress, disabled, danger }: { label: string; onPress: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[styles.btn, danger && styles.btnDanger, disabled && { opacity: 0.4 }]}>
      <Text style={[styles.btnText, danger && { color: '#FCA5A5' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  box: { maxHeight: '94%', backgroundColor: '#050B07', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#14532D' },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderColor: '#14532D' },
  title: { color: GREEN, fontFamily: MONO, fontWeight: '900', fontSize: 15 },
  close: { color: GREEN, fontSize: 20, fontWeight: '900' },
  body: { padding: 12 },
  console: { height: 220, backgroundColor: '#000', borderRadius: 10, borderWidth: 1, borderColor: '#14532D', padding: 8 },
  line: { color: GREEN, fontFamily: MONO, fontSize: 12 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  prompt: { color: GREEN, fontFamily: MONO, fontSize: 18, fontWeight: '900' },
  input: {
    minWidth: 120,
    backgroundColor: '#000',
    color: GREEN,
    fontFamily: MONO,
    fontSize: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#166534',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  btn: { backgroundColor: '#052E16', borderWidth: 1, borderColor: '#16A34A', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 9 },
  btnDanger: { borderColor: '#B91C1C', backgroundColor: '#2A0A0A', alignSelf: 'flex-start' },
  btnText: { color: GREEN, fontFamily: MONO, fontWeight: '900', fontSize: 12 },
  section: { color: '#86EFAC', fontFamily: MONO, fontSize: 11, fontWeight: '800', marginTop: 4 },
  chip: { backgroundColor: '#04140A', borderWidth: 1, borderColor: '#14532D', borderRadius: 8, padding: 8 },
  chipOn: { borderColor: GREEN, backgroundColor: '#052E16' },
  chipText: { color: GREEN, fontFamily: MONO, fontSize: 12, fontWeight: '800' },
  chipSub: { color: '#86EFAC', fontFamily: MONO, fontSize: 11 },
  card: { gap: 8, borderWidth: 1, borderColor: '#14532D', borderRadius: 12, padding: 10 },
  cardTitle: { color: GREEN, fontFamily: MONO, fontWeight: '900' },
  cardSub: { color: '#86EFAC', fontFamily: MONO, fontSize: 12 },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  item: { borderWidth: 1, borderColor: '#14532D', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6 },
  itemOn: { borderColor: GREEN, backgroundColor: '#14532D' },
  itemText: { color: GREEN, fontFamily: MONO, fontSize: 11 },
});
