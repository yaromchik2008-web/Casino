import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { GameTile } from '../components/GameTile';
import { CATEGORIES, Category, GAMES, GameInfo, findGame } from '../games/catalog';
import { useWallet } from '../state/WalletContext';
import { colors, formatCoins } from '../theme';

import type { Tab } from '../navigation';

const SECTIONS: { title: string; filter: (g: GameInfo) => boolean }[] = [
  { title: '🔥 Популярні', filter: (g) => g.categories.includes('popular') },
  { title: '💰 Джекпоти', filter: (g) => g.categories.includes('jackpot') },
  { title: '💫 Особливі слоти', filter: (g) => g.categories.includes('special') },
  { title: '⚡ Швидкі ігри', filter: (g) => g.categories.includes('fast') },
  { title: '🃏 Настільні', filter: (g) => g.categories.includes('table') },
  { title: '✨ Нові', filter: (g) => g.categories.includes('new') },
];

export function LobbyScreen({ onOpenGame, onNavigate }: { onOpenGame: (id: string) => void; onNavigate: (tab: Tab) => void }) {
  const wallet = useWallet();
  const { width } = useWindowDimensions();
  const [category, setCategory] = useState<Category | 'all' | 'favorites'>('all');
  const [query, setQuery] = useState('');
  const contentWidth = Math.min(width, 720) - 32;
  const columns = contentWidth > 500 ? 4 : 3;
  const tileWidth = (contentWidth - (columns - 1) * 10) / columns;
  const rowTile = Math.min(130, tileWidth);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GAMES.filter((g) => {
      if (q && !g.title.toLowerCase().includes(q)) return false;
      if (category === 'all') return true;
      if (category === 'favorites') return wallet.state.favorites.includes(g.id);
      return g.categories.includes(category);
    });
  }, [category, query, wallet.state.favorites]);

  const banners = [
    {
      title: 'Щоденний бонус',
      text: 'Заходь щодня і забирай до 100 ₴',
      colors: ['#F43F5E', '#7C3AED'] as const,
      emoji: '🎁',
      action: () => onNavigate('bonuses'),
    },
    {
      title: 'Тижневий турнір',
      text: 'Призовий фонд 1 225 ₴. Вигравай і піднімайся в рейтингу',
      colors: ['#0EA5E9', '#1E3A8A'] as const,
      emoji: '🏆',
      action: () => onNavigate('tournaments'),
    },
    {
      title: `Джекпот ${formatCoins(wallet.state.jackpotPool)}`,
      text: 'Росте з кожною ставкою. Спробуй «Діамантовий джекпот»',
      colors: ['#EAB308', '#9A3412'] as const,
      emoji: '💎',
      action: () => onOpenGame('diamond-jackpot'),
    },
    {
      title: 'Нове: Фруктова лавина',
      text: 'Каскади, бомби-множники до ×100 і «Купити бонус»',
      colors: ['#22C55E', '#14532D'] as const,
      emoji: '🍉',
      action: () => onOpenGame('fruit-avalanche'),
    },
    {
      title: 'Утримай і виграй',
      text: '«Скарби фараона»: монети, нові ряди і 4 джекпоти',
      colors: ['#D97706', '#451A03'] as const,
      emoji: '🏺',
      action: () => onOpenGame('pharaoh'),
    },
    {
      title: 'Ставки на спорт',
      text: 'Футбол, баскетбол, теніс, хокей. Матч за 4 хвилини',
      colors: ['#16A34A', '#0F172A'] as const,
      emoji: '⚽',
      action: () => onNavigate('sport'),
    },
    {
      title: 'Шахта',
      text: 'Розбивай блоки, шукай золото і діаманти',
      colors: ['#78716C', '#1C1917'] as const,
      emoji: '⛏️',
      action: () => onOpenGame('shakhta'),
    },
  ];

  const tile = (g: GameInfo, w: number) => (
    <GameTile
      key={g.id}
      game={g}
      width={w}
      favorite={wallet.state.favorites.includes(g.id)}
      onPress={() => onOpenGame(g.id)}
      onToggleFavorite={() => wallet.toggleFavorite(g.id)}
    />
  );

  const recent = wallet.state.recent.map(findGame).filter((g): g is GameInfo => !!g);
  const showSections = category === 'all' && !query.trim();

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ width: contentWidth }}>
        {banners.map((b) => (
          <Pressable key={b.title} onPress={b.action} style={{ width: contentWidth }}>
            <LinearGradient colors={b.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
              <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>{b.title}</Text>
                <Text style={styles.bannerSub}>{b.text}</Text>
              </View>
              <Text style={styles.bannerEmoji}>{b.emoji}</Text>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="🔍 Пошук гри"
        placeholderTextColor={colors.muted}
        style={styles.search}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fullWidth} contentContainerStyle={styles.cats}>
        {[...CATEGORIES, { id: 'favorites' as const, label: 'Улюблені', icon: '❤️' }].map((c) => (
          <Pressable
            key={c.id}
            onPress={() => setCategory(c.id)}
            style={[styles.cat, category === c.id && styles.catActive]}
          >
            <Text style={styles.catIcon}>{c.icon}</Text>
            <Text style={[styles.catText, category === c.id && styles.catTextActive]}>{c.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {showSections ? (
        <>
          {recent.length > 0 && (
            <Section title="🕑 Нещодавні">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fullWidth} contentContainerStyle={styles.row}>
                {recent.map((g) => tile(g, rowTile * 0.8))}
              </ScrollView>
            </Section>
          )}
          {SECTIONS.map((s) => (
            <Section key={s.title} title={s.title}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.fullWidth} contentContainerStyle={styles.row}>
                {GAMES.filter(s.filter).map((g) => tile(g, rowTile))}
              </ScrollView>
            </Section>
          ))}
          <Section title={`🎮 Усі ігри (${GAMES.length})`}>
            <View style={styles.grid}>{GAMES.map((g) => tile(g, tileWidth))}</View>
          </Section>
        </>
      ) : (
        <View style={styles.grid}>
          {filtered.length ? (
            filtered.map((g) => tile(g, tileWidth))
          ) : (
            <Text style={styles.empty}>
              {category === 'favorites' ? 'Натисни 🤍 на грі, щоб додати її в улюблені' : 'Нічого не знайдено'}
            </Text>
          )}
        </View>
      )}
      <Text style={styles.disclaimer}>
        18+ · Це розважальний застосунок. Усі монети віртуальні: їх не можна купити, вивести чи обміняти на гроші.
      </Text>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14, alignItems: 'center' },
  banner: { height: 130, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', marginRight: 0 },
  bannerText: { flex: 1, gap: 6 },
  bannerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '900' },
  bannerSub: { color: '#FFFFFFDD', fontSize: 13 },
  bannerEmoji: { fontSize: 64 },
  search: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
  },
  fullWidth: { width: '100%', flexGrow: 0 },
  cats: { gap: 8, paddingRight: 8 },
  cat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  catActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  catIcon: { fontSize: 16 },
  catText: { color: colors.muted, fontWeight: '700' },
  catTextActive: { color: '#FFFFFF' },
  section: { width: '100%', gap: 10 },
  sectionTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  row: { gap: 10 },
  grid: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  empty: { color: colors.muted, textAlign: 'center', width: '100%', padding: 30 },
  disclaimer: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 10 },
});
