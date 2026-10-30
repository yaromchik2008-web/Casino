import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BigButton, Panel } from '../components/ui';
import { Profile, fetchProfile, friendlyError } from '../state/friends';
import { SHOP_CATEGORIES, assetsValue, findItem, hourlyIncome, topCar } from '../state/shop';
import { colors, formatCoins } from '../theme';

/** Профіль іншого гравця: статус, рахунок і все його майно. */
export function PlayerProfile({ id, name, onClose }: { id: string; name?: string; onClose: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile(id)
      .then(setP)
      .catch((e) => setError(friendlyError(e)));
  }, [id]);

  const owned = (p?.owned ?? []).filter((o) => findItem(o));
  const assets = assetsValue(owned);
  const income = hourlyIncome(owned);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.back} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <ScrollView contentContainerStyle={styles.inner}>
            <Text style={styles.avatar}>{p?.status?.split(' ')[0] || '👤'}</Text>
            <Text style={styles.name}>{p?.name ?? name ?? '…'}</Text>
            {p && (
              <Text style={styles.muted}>
                {p.status.split(' ').slice(1).join(' ') || 'Гравець'} · ⭐ рівень {p.level} · код {p.code}
              </Text>
            )}
            {p?.plate && topCar(owned) && (
              <Text style={styles.carPlate}>
                {topCar(owned)!.emoji} {topCar(owned)!.title} · {p.plate}
              </Text>
            )}
            {error && <Text style={styles.error}>{error}</Text>}
            {p && (
              <View style={styles.stats}>
                <Stat label="Гроші" value={formatCoins(p.balance)} />
                <Stat label="Майно" value={formatCoins(assets)} />
                <Stat label="Статки" value={formatCoins(p.balance + assets)} gold />
              </View>
            )}
            {income > 0 && <Text style={styles.income}>Бізнес приносить {formatCoins(income)} за годину</Text>}
            {p && p.owned === undefined && (
              <Text style={styles.muted}>Майно стане видно, коли на сервері запустять docs/supabase-v4.sql</Text>
            )}
            {p && p.owned !== undefined && owned.length === 0 && <Text style={styles.muted}>Поки нічого не купив</Text>}
            {SHOP_CATEGORIES.map((c) => {
              const items = owned.map(findItem).filter((i) => i && i.category === c.id);
              if (!items.length) return null;
              return (
                <Panel key={c.id} style={styles.group}>
                  <Text style={styles.groupTitle}>
                    {c.icon} {c.label}
                  </Text>
                  {items.map((it) => (
                    <View key={it!.id} style={styles.row}>
                      <Text style={styles.item}>
                        {it!.emoji} {it!.title}
                      </Text>
                      <Text style={styles.price}>{formatCoins(it!.price)}</Text>
                    </View>
                  ))}
                </Panel>
              );
            })}
            <BigButton label="ЗАКРИТИ" color={colors.surfaceAlt} onPress={onClose} />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, gold && { color: colors.gold }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  carPlate: { color: colors.gold, fontWeight: '900', fontSize: 14, textAlign: 'center' },
  back: { flex: 1, backgroundColor: 'rgba(5,3,15,0.8)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 440, maxHeight: '90%', backgroundColor: colors.surface, borderRadius: 22, borderWidth: 1, borderColor: colors.border },
  inner: { padding: 16, gap: 10, alignItems: 'stretch' },
  avatar: { fontSize: 56, textAlign: 'center' },
  name: { color: colors.text, fontWeight: '900', fontSize: 22, textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  error: { color: colors.red, fontWeight: '700', textAlign: 'center' },
  stats: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, backgroundColor: colors.surfaceAlt, borderRadius: 12, padding: 8, alignItems: 'center' },
  statLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  statValue: { color: colors.text, fontWeight: '900', fontSize: 13 },
  income: { color: colors.green, fontWeight: '800', textAlign: 'center' },
  group: { gap: 4 },
  groupTitle: { color: colors.gold, fontWeight: '900', marginBottom: 2 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  item: { color: colors.text, flex: 1 },
  price: { color: colors.muted, fontWeight: '700' },
});
