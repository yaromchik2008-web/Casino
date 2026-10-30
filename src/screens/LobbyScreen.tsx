import { LinearGradient } from 'expo-linear-gradient';
import { ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Image, ImageSourcePropType, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
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
  // Реальну ширину сітки міряємо: у Telegram Desktop і браузерах смуга прокрутки з'їдає місце, і третя плитка падала в новий ряд.
  const [gridW, setGridW] = useState(0);
  const avail = gridW || contentWidth;
  const columns = avail > 500 ? 4 : 3;
  const tileWidth = Math.floor((avail - (columns - 1) * 10) / columns - 0.5);
  const onGrid = (e: { nativeEvent: { layout: { width: number } } }) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w > 0 && Math.abs(w - gridW) > 1) setGridW(w);
  };
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

  const banners: {
    title: string;
    text: string;
    colors: readonly [string, string];
    emoji: string;
    image?: ImageSourcePropType;
    action: () => void;
  }[] = [
    {
      title: 'Запроси друга: +200 ₴ обом',
      text: 'А за 3, 5, 10, 25 і 50 друзів ще призи до 5 000 ₴',
      colors: ['#22C55E', '#0B3B1E'] as const,
      emoji: '👥',
      action: () => onNavigate('bonuses'),
    },
    {
      title: 'Нове: Золотий Карась',
      text: 'Наш фірмовий слот з друзями-персонажами і фриспінами',
      colors: ['#FFC83D', '#14102A'] as const,
      emoji: '🐟',
      image: findGame('golden-karas')?.art?.v5,
      action: () => onOpenGame('golden-karas'),
    },
    {
      title: 'Нове: Ковбасний рай',
      text: 'Від сосиски до краківської. 10 фриспінів і бонуска в бонусці',
      colors: ['#E85D2C', '#3A0A04'] as const,
      emoji: '🌭',
      image: findGame('kovbasa')?.art?.cover,
      action: () => onOpenGame('kovbasa'),
    },
    {
      title: 'Нове: Автобазар',
      text: 'Слот з машинами: від «сімки» до Ікс 3. Поліція-wild, УАЗ дає фриспіни',
      colors: ['#2456B8', '#0B1638'] as const,
      emoji: '🚗',
      image: findGame('avtobazar')?.art?.cover,
      action: () => onOpenGame('avtobazar'),
    },
    {
      title: 'Щоденний бонус',
      text: 'Заходь щодня і забирай до 100 ₴',
      colors: ['#F43F5E', '#7C3AED'] as const,
      emoji: '🎁',
      action: () => onNavigate('bonuses'),
    },
    {
      title: 'Турнір «Шість годин»',
      text: 'Вхід 200 ₴. Хто заробить найбільше, забирає всі внески',
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
      title: 'Нове: Башта',
      text: '9 сходинок, ліво чи право. 15 ₴ на вершині стають 7 296 ₴',
      colors: ['#7C3AED', '#1E1B4B'] as const,
      emoji: '🗼',
      action: () => onOpenGame('tower'),
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
      <BannerStrip banners={banners} width={contentWidth} />

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
            <View style={styles.grid} onLayout={onGrid}>{GAMES.map((g) => tile(g, tileWidth))}</View>
          </Section>
        </>
      ) : (
        <View style={styles.grid} onLayout={onGrid}>
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

// Стрічка новин сама повільно біжить по екрану. Якщо гравець торкнувся, вона чекає кілька секунд.
const MARQUEE_PX_PER_S = 28;

function BannerStrip({
  banners,
  width,
}: {
  banners: { title: string; text: string; colors: readonly [string, string]; emoji: string; image?: ImageSourcePropType; action: () => void }[];
  width: number;
}) {
  const ref = useRef<ComponentRef<typeof ScrollView>>(null);
  const x = useRef(0);
  const pausedUntil = useRef(0);
  const cardW = Math.round(width * 0.86);
  const loopW = banners.length * (cardW + 10);
  useEffect(() => {
    let last = Date.now();
    const t = setInterval(() => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      if (now < pausedUntil.current || !ref.current) return;
      x.current += (MARQUEE_PX_PER_S * dt) / 1000;
      if (x.current >= loopW) x.current -= loopW; // друга копія стрічки така сама, тож стрибок непомітний
      ref.current.scrollTo({ x: x.current, animated: false });
    }, 33);
    return () => clearInterval(t);
  }, [loopW]);
  const hold = () => (pausedUntil.current = Date.now() + 4000);
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ width }}
      scrollEventThrottle={32}
      onTouchStart={hold}
      onScrollBeginDrag={hold}
      onScroll={(e) => {
        if (Date.now() < pausedUntil.current) x.current = e.nativeEvent.contentOffset.x % loopW;
      }}
    >
      {[...banners, ...banners].map((b, i) => (
        <Pressable key={`${b.title}-${i}`} onPress={b.action} style={{ width: cardW, marginRight: 10 }}>
          <LinearGradient colors={b.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.banner}>
            <View style={styles.bannerText}>
              <Text style={styles.bannerTitle}>{b.title}</Text>
              <Text style={styles.bannerSub}>{b.text}</Text>
            </View>
            {b.image ? <Image source={b.image} style={styles.bannerImage} /> : <Text style={styles.bannerEmoji}>{b.emoji}</Text>}
          </LinearGradient>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 14, alignItems: 'center' },
  banner: { height: 130, borderRadius: 20, padding: 18, flexDirection: 'row', alignItems: 'center', marginRight: 0 },
  bannerImage: { width: 92, height: 92, borderRadius: 18, borderWidth: 3, borderColor: '#FFC83D' },
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
