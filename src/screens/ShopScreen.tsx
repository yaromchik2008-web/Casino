import { PlateView } from '../games/PlateGame';
import { plateRelease } from '../state/friends';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { sfx } from '../audio/sound';
import { useNow } from '../components/useNow';
import { BigButton, Chip, Panel } from '../components/ui';
import { ACHIEVEMENTS } from '../state/achievements';
import {
  ItemCategory,
  SELL_RATE,
  sellPrice,
  SHOP_CATEGORIES,
  SHOP_ITEMS,
  STATUSES,
  assetsValue,
  findItem,
  hourlyIncome,
  statusFor,
  vehicleCount,
} from '../state/shop';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';

type View3 = 'shop' | 'mine' | 'achievements';

export function ShopScreen() {
  const wallet = useWallet();
  const s = wallet.state;
  useNow(5000);
  const [view, setView] = useState<View3>('shop');
  const [cat, setCat] = useState<ItemCategory>('home');
  const [confirmSell, setConfirmSell] = useState<string | null>(null);

  const assets = assetsValue(s.owned);
  const net = s.balance + assets;
  const status = statusFor(net);
  const next = STATUSES[STATUSES.indexOf(status) + 1];
  const income = hourlyIncome(s.owned);
  const pending = wallet.pendingIncome();
  const readyAchievements = ACHIEVEMENTS.filter((a) => !s.achievements.includes(a.id) && a.done(s)).length;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Panel style={styles.hero}>
        <Text style={styles.statusEmoji}>{status.emoji}</Text>
        <Text style={styles.status}>{status.title}</Text>
        <Text style={styles.net}>Статки: {formatCoins(net)}</Text>
        <Text style={styles.sub}>
          Гроші {formatCoins(s.balance)} · Майно {formatCoins(assets)}
        </Text>
        {next && (
          <>
            <View style={styles.bar}>
              <View style={[styles.barFill, { width: `${Math.min(100, (net / next.min) * 100)}%` }]} />
            </View>
            <Text style={styles.sub}>
              До статусу «{next.title}» {next.emoji}: {formatCoins(Math.max(0, next.min - net))}
            </Text>
          </>
        )}
        {income > 0 && (
          <View style={styles.incomeRow}>
            <Text style={styles.incomeText}>
              🏢 Бізнес: {formatCoins(income)}/год · накопичено {formatCoins(pending)}
            </Text>
            <BigButton
              label="ЗІБРАТИ"
              style={styles.collect}
              disabled={pending <= 0}
              onPress={() => {
                const got = wallet.collectIncome();
                if (got > 0) {
                  sfx('cash');
                  wallet.notify(`Дохід бізнесу +${formatCoins(got)}`);
                }
              }}
            />
          </View>
        )}
      </Panel>

      <View style={styles.tabs}>
        <Chip label="🛍️ Магазин" active={view === 'shop'} onPress={() => setView('shop')} />
        <Chip label={`💼 Мої статки (${s.owned.length})`} active={view === 'mine'} onPress={() => setView('mine')} />
        <Chip
          label={`🏅 Досягнення${readyAchievements ? ` (${readyAchievements})` : ''}`}
          active={view === 'achievements'}
          onPress={() => setView('achievements')}
        />
      </View>

      {view === 'shop' && (
        <>
          <View style={styles.tabs}>
            {SHOP_CATEGORIES.map((c) => (
              <Chip key={c.id} label={`${c.icon} ${c.label}`} active={cat === c.id} onPress={() => setCat(c.id)} />
            ))}
          </View>
          {cat === 'car' && (
            <Text style={styles.empty}>
              🍀 Кожен транспорт додає +0,5 % до виграшів в іграх. Зараз: +{String(vehicleCount(s.owned) * 0.5).replace(".", ",")} %
            </Text>
          )}
          {SHOP_ITEMS.filter((i) => i.category === cat && !i.prize).map((item) => {
            const owned = s.owned.includes(item.id);
            const afford = s.balance >= item.price;
            return (
              <Panel key={item.id} style={styles.item}>
                <Text style={styles.itemEmoji}>{item.emoji}</Text>
                <View style={styles.itemBody}>
                  <Text style={styles.itemTitle}>{item.title}</Text>
                  <Text style={styles.itemPrice}>{formatCoins(item.price)}</Text>
                  {item.income ? <Text style={styles.itemIncome}>+{formatCoins(item.income)} за годину</Text> : null}
                  {item.category === 'car' ? <Text style={styles.itemIncome}>🍀 +0,5 % до виграшів</Text> : null}
                </View>
                {owned ? (
                  <Text style={styles.owned}>✓ Твоє</Text>
                ) : (
                  <BigButton
                    label="КУПИТИ"
                    style={styles.buy}
                    disabled={!afford}
                    onPress={() => {
                      if (wallet.buyItem(item.id)) {
                        sfx('cash');
                        wallet.notify(`${item.emoji} ${item.title} тепер твоє!`);
                      }
                    }}
                  />
                )}
              </Panel>
            );
          })}
        </>
      )}

      {view === 'mine' && (
        <>
          {s.owned.length === 0 && !(s.plates ?? []).length && <Text style={styles.empty}>Поки нічого немає. Загляни в магазин!</Text>}
          {!!(s.plates ?? []).length && (
            <Panel style={styles.group}>
              <Text style={styles.groupTitle}>🚘 Номери</Text>
              {[...(s.plates ?? [])]
                .sort((a, b) => b.value - a.value)
                .map((pl) => (
                  <View key={pl.id} style={styles.ownedRow}>
                    <PlateView text={pl.id} />
                    <Chip
                      label={confirmSell === pl.id ? `Продати за ${formatCoins(pl.value)}?` : formatCoins(pl.value)}
                      active={confirmSell === pl.id}
                      onPress={() => {
                        if (confirmSell === pl.id) {
                          const got = wallet.sellPlate(pl.id);
                          plateRelease(pl.id).catch(() => {});
                          wallet.notify(`Номер ${pl.id} продано за ${formatCoins(got)}`);
                          setConfirmSell(null);
                        } else setConfirmSell(pl.id);
                      }}
                    />
                  </View>
                ))}
            </Panel>
          )}
          {SHOP_CATEGORIES.map((c) => {
            const items = s.owned.map(findItem).filter((i) => i && i.category === c.id);
            if (!items.length) return null;
            return (
              <Panel key={c.id} style={styles.group}>
                <Text style={styles.groupTitle}>
                  {c.icon} {c.label}
                </Text>
                {items.map((item) => (
                  <View key={item!.id} style={styles.ownedRow}>
                    <Text style={styles.ownedName}>
                      {item!.emoji} {item!.title}
                    </Text>
                    <Chip
                      label={confirmSell === item!.id ? `Продати за ${formatCoins(sellPrice(item!))}?` : 'Продати'}
                      active={confirmSell === item!.id}
                      onPress={() => {
                        if (confirmSell === item!.id) {
                          const got = wallet.sellItem(item!.id);
                          wallet.notify(`Продано за ${formatCoins(got)}`);
                          setConfirmSell(null);
                        } else setConfirmSell(item!.id);
                      }}
                    />
                  </View>
                ))}
              </Panel>
            );
          })}
        </>
      )}

      {view === 'achievements' &&
        ACHIEVEMENTS.map((a) => {
          const claimed = s.achievements.includes(a.id);
          const done = a.done(s);
          return (
            <Panel key={a.id} style={[styles.item, !done && styles.locked]}>
              <Text style={styles.itemEmoji}>{done ? a.icon : '🔒'}</Text>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{a.title}</Text>
                <Text style={styles.itemIncome}>Нагорода {formatCoins(a.reward)}</Text>
              </View>
              {claimed ? (
                <Text style={styles.owned}>✓</Text>
              ) : (
                <BigButton
                  label="ВЗЯТИ"
                  style={styles.buy}
                  disabled={!done}
                  onPress={() => {
                    const r = wallet.claimAchievement(a.id);
                    if (r) {
                      sfx('cash');
                      wallet.notify(`${a.icon} ${a.title}: +${formatCoins(r)}`);
                    }
                  }}
                />
              )}
            </Panel>
          );
        })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 12, width: '100%', maxWidth: 560, alignSelf: 'center' },
  hero: { alignItems: 'center', gap: 4, borderColor: colors.gold },
  statusEmoji: { fontSize: 44 },
  status: { color: colors.gold, fontSize: 22, fontWeight: '900' },
  net: { color: colors.text, fontSize: 18, fontWeight: '800' },
  sub: { color: colors.muted, fontSize: 12, textAlign: 'center' },
  bar: { width: '100%', height: 8, borderRadius: 4, backgroundColor: colors.surfaceAlt, overflow: 'hidden', marginTop: 6 },
  barFill: { height: '100%', backgroundColor: colors.gold },
  incomeRow: { width: '100%', marginTop: 8, gap: 8, alignItems: 'center' },
  incomeText: { color: colors.text, fontWeight: '700', textAlign: 'center' },
  collect: { paddingVertical: 10 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  locked: { opacity: 0.6 },
  itemEmoji: { fontSize: 36, width: 46, textAlign: 'center' },
  itemBody: { flex: 1, gap: 2 },
  itemTitle: { color: colors.text, fontWeight: '800', fontSize: 15 },
  itemPrice: { color: colors.gold, fontWeight: '800' },
  itemIncome: { color: colors.green, fontSize: 12, fontWeight: '700' },
  buy: { width: 110, paddingVertical: 10 },
  owned: { color: colors.green, fontWeight: '900', fontSize: 15 },
  empty: { color: colors.muted, textAlign: 'center', marginTop: 20 },
  group: { gap: 8 },
  groupTitle: { color: colors.gold, fontWeight: '900' },
  ownedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  ownedName: { color: colors.text, flex: 1 },
});
