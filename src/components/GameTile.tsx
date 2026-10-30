import { LinearGradient } from 'expo-linear-gradient';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { GameInfo } from '../games/catalog';
import { colors } from '../theme';

const TAG_COLORS = { HOT: '#EF4444', NEW: '#22C55E', JP: '#EAB308' } as const;
const TAG_LABELS = { HOT: 'ХІТ', NEW: 'НОВА', JP: 'ДЖЕКПОТ' } as const;

export function GameTile({
  game,
  width,
  favorite,
  onPress,
  onToggleFavorite,
}: {
  game: GameInfo;
  width: number;
  favorite: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ width }, pressed && styles.pressed]}>
      <LinearGradient colors={game.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.tile, { height: width * 1.2 }]}>
        {/* Сяйво за іконкою і відблиск згори роблять плитку об'ємною. */}
        <View
          pointerEvents="none"
          style={[styles.glow, { width: width * 0.9, height: width * 0.9, borderRadius: width * 0.45, top: width * 0.08 }]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.6, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
        {game.art?.cover ?? game.art?.wild ? (
          <Image source={game.art.cover ?? game.art.wild} style={[styles.emoji, { width: width * 0.62, height: width * 0.62, borderRadius: width * 0.12 }]} />
        ) : (
          <Text style={[styles.emoji, { fontSize: width * 0.42 }]}>{game.emoji}</Text>
        )}
        {game.tag && (
          <View style={[styles.tag, { backgroundColor: TAG_COLORS[game.tag] }]}>
            <Text style={styles.tagText}>{TAG_LABELS[game.tag]}</Text>
          </View>
        )}
        <Pressable onPress={onToggleFavorite} hitSlop={10} style={styles.fav}>
          <Text style={styles.favText}>{favorite ? '❤️' : '🤍'}</Text>
        </Pressable>
        <View style={styles.footer}>
          <Text style={[styles.title, { fontSize: titleSize(game.title, width) }]} numberOfLines={2}>
            {game.title}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

// Довге слово в назві («Смертельна») не має ламатися посередині: зменшуємо шрифт під ширину плитки.
function titleSize(title: string, width: number) {
  const longest = Math.max(...title.split(/\s+/).map((w) => w.length));
  return Math.max(9, Math.min(12, Math.floor((width - 16) / (longest * 0.72))));
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  glow: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.16)' },
  emoji: { marginBottom: 18, textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 4 } },
  tag: { position: 'absolute', top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  tagText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
  fav: { position: 'absolute', top: 4, right: 6 },
  favText: { fontSize: 16 },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  title: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '900',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
    textShadowOffset: { width: 0, height: 1 },
  },
  pressed: { transform: [{ scale: 0.96 }] },
});
