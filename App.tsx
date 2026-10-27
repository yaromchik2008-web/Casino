import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { findGame } from './src/games/catalog';
import { BonusesScreen } from './src/screens/BonusesScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { TournamentsScreen } from './src/screens/TournamentsScreen';
import { WalletProvider, useWallet } from './src/state/WalletContext';
import { colors, formatCoins } from './src/theme';

type Tab = 'lobby' | 'bonuses' | 'tournaments' | 'profile';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'lobby', label: 'Лобі', icon: '🎰' },
  { id: 'bonuses', label: 'Бонуси', icon: '🎁' },
  { id: 'tournaments', label: 'Турніри', icon: '🏆' },
  { id: 'profile', label: 'Профіль', icon: '🧑‍🚀' },
];

function Shell() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>('lobby');
  const [gameId, setGameId] = useState<string | null>(null);
  const game = gameId ? findGame(gameId) : undefined;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (gameId) {
        setGameId(null);
        return true;
      }
      if (tab !== 'lobby') {
        setTab('lobby');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [gameId, tab]);

  const openGame = (id: string) => {
    wallet.openGame(id);
    setGameId(id);
  };

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.logo}>
          FREE<Text style={styles.logoAccent}>CASINO</Text>
        </Text>
        <View style={styles.headerRight}>
          <View style={styles.level}>
            <Text style={styles.levelText}>⭐ {wallet.state.level}</Text>
          </View>
          <Pressable
            style={styles.balance}
            onPress={() => {
              setGameId(null);
              setTab('bonuses');
            }}
          >
            <Text style={styles.balanceText}>{formatCoins(wallet.state.balance)} 🪙</Text>
            <View style={styles.plus}>
              <Text style={styles.plusText}>+</Text>
            </View>
          </Pressable>
        </View>
      </View>

      <View style={styles.body}>
        {game ? (
          <GameScreen game={game} onClose={() => setGameId(null)} />
        ) : tab === 'lobby' ? (
          <LobbyScreen onOpenGame={openGame} onNavigate={setTab} />
        ) : tab === 'bonuses' ? (
          <BonusesScreen />
        ) : tab === 'tournaments' ? (
          <TournamentsScreen />
        ) : (
          <ProfileScreen onOpenGame={openGame} />
        )}
      </View>

      {wallet.toast && (
        <View pointerEvents="none" style={styles.toast}>
          <Text style={styles.toastText}>{wallet.toast}</Text>
        </View>
      )}

      {!game && (
        <SafeAreaView edges={['bottom']} style={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable key={t.id} style={styles.tab} onPress={() => setTab(t.id)}>
              <Text style={[styles.tabIcon, tab !== t.id && styles.tabInactive]}>{t.icon}</Text>
              <Text style={[styles.tabLabel, tab === t.id && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          ))}
        </SafeAreaView>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <WalletProvider>
        <Shell />
      </WalletProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logo: { color: colors.text, fontSize: 20, fontWeight: '900', letterSpacing: 1 },
  logoAccent: { color: colors.accent },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  level: { backgroundColor: colors.surfaceAlt, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 5 },
  levelText: { color: colors.gold, fontWeight: '800', fontSize: 12 },
  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.bg,
    borderRadius: 16,
    paddingLeft: 12,
    paddingRight: 4,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  balanceText: { color: colors.text, fontWeight: '800' },
  plus: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  plusText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16, lineHeight: 18 },
  body: { flex: 1 },
  toast: {
    position: 'absolute',
    top: 70,
    left: 16,
    right: 16,
    backgroundColor: colors.accent,
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  toastText: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 8, gap: 2 },
  tabIcon: { fontSize: 22 },
  tabInactive: { opacity: 0.5 },
  tabLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  tabLabelActive: { color: colors.gold },
});
