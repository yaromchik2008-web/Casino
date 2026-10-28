import { ComponentType, useEffect } from 'react';
import { playMusic } from '../audio/sound';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BaccaratGame } from '../games/BaccaratGame';
import { BlackjackGame } from '../games/BlackjackGame';
import { ChickenGame } from '../games/ChickenGame';
import { ColorWheelGame } from '../games/ColorWheelGame';
import { GameInfo, GameKind } from '../games/catalog';
import { CoinGame } from '../games/CoinGame';
import { CrashGame } from '../games/CrashGame';
import { DiceGame } from '../games/DiceGame';
import { HiLoGame } from '../games/HiLoGame';
import { HoldWinGame } from '../games/HoldWinGame';
import { MineGame } from '../games/MineGame';
import { MinesGame } from '../games/MinesGame';
import { PlinkoGame } from '../games/PlinkoGame';
import { PokerGame } from '../games/PokerGame';
import { RouletteGame } from '../games/RouletteGame';
import { SlotGame } from '../games/SlotGame';
import { TowerGame } from '../games/TowerGame';
import { TumbleGame } from '../games/TumbleGame';
import { WheelGame } from '../games/WheelGame';
import { useWallet } from '../state/WalletContext';
import { colors } from '../theme';

const COMPONENTS: Record<GameKind, ComponentType<{ game: GameInfo }>> = {
  slot: SlotGame,
  roulette: RouletteGame,
  blackjack: BlackjackGame,
  baccarat: BaccaratGame,
  poker: PokerGame,
  crash: CrashGame,
  mines: MinesGame,
  plinko: PlinkoGame,
  dice: DiceGame,
  hilo: HiLoGame,
  wheel: WheelGame,
  coin: CoinGame,
  tumble: TumbleGame,
  holdwin: HoldWinGame,
  dig: MineGame,
  tower: TowerGame,
  colorwheel: ColorWheelGame,
  chicken: ChickenGame,
};

export function GameScreen({ game, onClose }: { game: GameInfo; onClose: () => void }) {
  const wallet = useWallet();
  const Game = COMPONENTS[game.kind];
  const favorite = wallet.state.favorites.includes(game.id);
  useEffect(() => {
    playMusic(game.music);
    return () => playMusic('lobby');
  }, [game.music]);
  return (
    <View style={styles.root}>
      <View style={styles.bar}>
        <Pressable onPress={onClose} hitSlop={10} style={styles.back}>
          <Text style={styles.backText}>‹ Лобі</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {game.emoji} {game.title}
        </Text>
        <Pressable onPress={() => wallet.toggleFavorite(game.id)} hitSlop={10}>
          <Text style={styles.fav}>{favorite ? '❤️' : '🤍'}</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.desc}>{game.description}</Text>
        <Game game={game} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { paddingVertical: 4, paddingRight: 6 },
  backText: { color: colors.gold, fontSize: 16, fontWeight: '800' },
  title: { flex: 1, color: colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  fav: { fontSize: 20 },
  content: { padding: 16, paddingBottom: 40, gap: 12, width: '100%', maxWidth: 520, alignSelf: 'center' },
  desc: { color: colors.muted, fontSize: 12, textAlign: 'center' },
});
