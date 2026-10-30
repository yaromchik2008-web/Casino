import { StatusBar } from 'expo-status-bar';
import { hideToast, useToast } from './src/state/toast';
import { onNav, peekNav } from './src/state/nav';
import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getSettings, initSound, playMusic, resumeMusic } from './src/audio/sound';
import { CelebrationLayer } from './src/components/Celebration';
import { findGame } from './src/games/catalog';
import type { Tab } from './src/navigation';
import { BonusesScreen } from './src/screens/BonusesScreen';
import { FriendsScreen } from './src/screens/FriendsScreen';
import { GameScreen } from './src/screens/GameScreen';
import { LobbyScreen } from './src/screens/LobbyScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ShopScreen } from './src/screens/ShopScreen';
import { SportsScreen } from './src/screens/SportsScreen';
import { TournamentsScreen } from './src/screens/TournamentsScreen';
import { useKeyboardViewport } from './src/viewport';
import { useFriendSync } from './src/state/useFriendSync';
import { WalletProvider, useWallet } from './src/state/WalletContext';
import { initTelegram, setTelegramBack } from './src/telegram';
import { colors, formatCoins } from './src/theme';

// Смуги прокрутки ховаємо: у Telegram Desktop вони з'їдали ширину й ламали сітку ігор.
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const st = document.createElement('style');
  // Поля вводу 16px: інакше iPhone (і Telegram на ньому) збільшує масштаб, коли друкуєш.
  st.textContent =
    '*{scrollbar-width:none}*::-webkit-scrollbar{width:0;height:0;display:none}input,textarea,select{font-size:16px!important}';
  document.head.appendChild(st);
  // Забороняємо масштабування сторінки: гра має виглядати як застосунок.
  let vp = document.querySelector('meta[name=viewport]');
  if (!vp) {
    vp = document.createElement('meta');
    vp.setAttribute('name', 'viewport');
    document.head.appendChild(vp);
  }
  vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover');
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'lobby', label: 'Лобі', icon: '🎰' },
  { id: 'sport', label: 'Спорт', icon: '⚽' },
  { id: 'bonuses', label: 'Бонуси', icon: '🎁' },
  { id: 'shop', label: 'Магазин', icon: '🛍️' },
  { id: 'friends', label: 'Друзі', icon: '👥' },
  { id: 'profile', label: 'Профіль', icon: '🧑‍🚀' },
];

const BREAK_MS = 60 * 60 * 1000;

function Balance({ value, onPress }: { value: number; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;
  const prev = useRef(value);
  useEffect(() => {
    if (value > prev.current) {
      pulse.setValue(1.18);
      Animated.spring(pulse, { toValue: 1, friction: 3, useNativeDriver: true }).start();
    }
    prev.current = value;
  }, [value, pulse]);
  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.balance, { transform: [{ scale: pulse }] }]}>
        <View>
          <Text style={styles.balanceText}>{formatCoins(value)}</Text>
          <Text style={styles.balanceNote}>ігрові</Text>
        </View>
        <View style={styles.plus}>
          <Text style={styles.plusText}>+</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

function Shell() {
  const wallet = useWallet();
  const [tab, setTab] = useState<Tab>('lobby');
  const [gameId, setGameId] = useState<string | null>(null);
  const game = gameId ? findGame(gameId) : undefined;
  const fade = useRef(new Animated.Value(1)).current;
  useFriendSync();
  const keyboard = useKeyboardViewport();

  useEffect(() => {
    initSound();
    playMusic('lobby');
    initTelegram(() => {});
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      // Браузер дозволяє звук лише після першого дотику.
      document.addEventListener('pointerdown', resumeMusic);
      return () => document.removeEventListener('pointerdown', resumeMusic);
    }
  }, []);

  // Нагадування про перерву щогодини гри.
  useEffect(() => {
    const t = setInterval(() => {
      if (getSettings().breakReminder) wallet.notify('Ти граєш уже годину. Може, час на перерву? ☕');
    }, BREAK_MS);
    return () => clearInterval(t);
  }, [wallet.notify]);

  // Легка поява нового розділу. Без повного затемнення до нуля, щоб екран не блимав.
  useEffect(() => {
    if (getSettings().lite) return;
    fade.setValue(0.75);
    Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }).start();
  }, [tab, gameId, fade]);

  // Сповіщення про повідомлення чи дуель відкриває «Друзі».
  useEffect(() => {
    const go = () => {
      setGameId(null);
      setTab('friends');
    };
    if (peekNav()) go();
    return onNav(go);
  }, []);

  const back = () => {
    if (gameId) {
      setGameId(null);
      return true;
    }
    if (tab !== 'lobby') {
      setTab(tab === 'tournaments' ? 'bonuses' : 'lobby');
      return true;
    }
    return false;
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    const off = setTelegramBack(gameId || tab !== 'lobby' ? back : null);
    return () => {
      sub.remove();
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, tab]);

  const openGame = (id: string) => {
    wallet.openGame(id);
    setGameId(id);
  };

  if (wallet.banned) {
    const forever = new Date(wallet.banned.until).getFullYear() > 9000 || !isFinite(new Date(wallet.banned.until).getTime());
    return (
      <SafeAreaView style={[styles.screen, styles.ban]}>
        <StatusBar style="light" />
        <Text style={styles.banIcon}>⛔</Text>
        <Text style={styles.banTitle}>Тебе заблоковано</Text>
        <Text style={styles.banText}>
          {forever ? 'Назавжди' : `До ${new Date(wallet.banned.until).toLocaleString('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`}
        </Text>
        {!!wallet.banned.note && <Text style={styles.banText}>Причина: {wallet.banned.note}</Text>}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.logo}>
          CASINO<Text style={styles.logoAccent}> VICTOR</Text>
        </Text>
        <View style={styles.headerRight}>
          <View style={styles.level}>
            <Text style={styles.levelText}>⭐ {wallet.state.level}</Text>
          </View>
          <Balance
            value={wallet.state.balance}
            onPress={() => {
              setGameId(null);
              setTab('bonuses');
            }}
          />
        </View>
      </View>

      <Animated.View style={[styles.body, { opacity: fade }]}>
        {game ? (
          <GameScreen game={game} onClose={() => setGameId(null)} />
        ) : tab === 'lobby' ? (
          <LobbyScreen onOpenGame={openGame} onNavigate={setTab} />
        ) : tab === 'sport' ? (
          <SportsScreen />
        ) : tab === 'bonuses' ? (
          <BonusesScreen onOpenTournaments={() => setTab('tournaments')} />
        ) : tab === 'tournaments' ? (
          <TournamentsScreen />
        ) : tab === 'shop' ? (
          <ShopScreen />
        ) : tab === 'friends' ? (
          <FriendsScreen />
        ) : (
          <ProfileScreen onOpenGame={openGame} />
        )}
      </Animated.View>

      <Toast />

      {!game && !keyboard && (
        <SafeAreaView edges={['bottom']} style={styles.tabBar}>
          {TABS.map((t) => {
            const active = tab === t.id || (t.id === 'bonuses' && tab === 'tournaments');
            return (
              <Pressable key={t.id} style={styles.tab} onPress={() => setTab(t.id)}>
                <Text style={[styles.tabIcon, !active && styles.tabInactive]}>{t.icon}</Text>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </SafeAreaView>
      )}
      <CelebrationLayer />
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
  ban: { alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  banIcon: { fontSize: 72 },
  banTitle: { color: colors.red, fontSize: 24, fontWeight: '900' },
  banText: { color: colors.muted, fontSize: 15, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  logo: { color: colors.text, fontSize: 18, fontWeight: '900', letterSpacing: 1 },
  logoAccent: { color: colors.gold },
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
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: colors.gold,
  },
  balanceText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  balanceNote: { color: colors.muted, fontSize: 9, fontWeight: '700', marginTop: -2 },
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
    zIndex: 50,
  },
  toastText: { color: '#FFFFFF', fontWeight: '800', textAlign: 'center' },
  toastHint: { color: 'rgba(255,255,255,0.75)', fontSize: 11, textAlign: 'center', marginTop: 3 },
  toastActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  toastBtn: { paddingVertical: 9, paddingHorizontal: 18, borderRadius: 12, backgroundColor: 'rgba(0,0,0,0.3)' },
  toastBtnPrimary: { backgroundColor: colors.gold },
  toastBtnText: { color: '#FFFFFF', fontWeight: '900' },
  toastBtnTextPrimary: { color: '#1A1300' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 7, gap: 2 },
  tabIcon: { fontSize: 20 },
  tabInactive: { opacity: 0.5 },
  tabLabel: { color: colors.muted, fontSize: 10, fontWeight: '700' },
  tabLabelActive: { color: colors.gold },
});

function Toast() {
  const toast = useToast();
  if (!toast) return null;
  const tappable = !!(toast.onPress || toast.actions?.length);
  return (
    <View pointerEvents={tappable ? 'box-none' : 'none'} style={styles.toast}>
      <Pressable
        disabled={!toast.onPress}
        onPress={() => {
          hideToast();
          toast.onPress?.();
        }}
      >
        <Text style={styles.toastText}>{toast.text}</Text>
        {toast.onPress && !toast.actions?.length && <Text style={styles.toastHint}>Натисни, щоб відкрити</Text>}
      </Pressable>
      {!!toast.actions?.length && (
        <View style={styles.toastActions}>
          {toast.actions.map((a) => (
            <Pressable
              key={a.label}
              style={[styles.toastBtn, a.primary && styles.toastBtnPrimary]}
              onPress={() => {
                hideToast();
                a.onPress();
              }}
            >
              <Text style={[styles.toastBtnText, a.primary && styles.toastBtnTextPrimary]}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
