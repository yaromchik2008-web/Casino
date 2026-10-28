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
          <Text style={styles.title} numberOfLines={2}>
            {game.title}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: { borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  emoji: { marginBottom: 18 },
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
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  title: { color: colors.text, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  pressed: { transform: [{ scale: 0.96 }] },
});
