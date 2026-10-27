import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { MUSIC, MusicId, SFX, SfxId } from './assets';

export type { MusicId, SfxId };

export interface Settings {
  music: boolean;
  sfx: boolean;
  vibration: boolean;
  fastSpin: boolean;
  breakReminder: boolean;
}

const KEY = 'freecasino:settings:v1';
const MUSIC_VOLUME = 0.35;

let settings: Settings = { music: true, sfx: true, vibration: true, fastSpin: false, breakReminder: true };
const listeners = new Set<() => void>();

export function getSettings() {
  return settings;
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings = { ...settings, [key]: value };
  listeners.forEach((l) => l());
  AsyncStorage.setItem(KEY, JSON.stringify(settings)).catch(() => {});
  if (key === 'music') applyMusic();
}

export function useSettings() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => settings,
  );
}

export function initSound() {
  setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw) {
        settings = { ...settings, ...JSON.parse(raw) };
        listeners.forEach((l) => l());
        applyMusic();
      }
    })
    .catch(() => {});
}

let musicPlayer: AudioPlayer | null = null;
let currentMusic: MusicId | null = null;
let wantedMusic: MusicId | null = null;

function safe(fn: () => void) {
  try {
    fn();
  } catch {
    // Звук не критичний: на вебі до першого дотику браузер може блокувати відтворення.
  }
}

function applyMusic() {
  safe(() => {
    if (!settings.music || !wantedMusic) {
      musicPlayer?.pause();
      return;
    }
    if (!musicPlayer) {
      musicPlayer = createAudioPlayer(MUSIC[wantedMusic]);
      musicPlayer.loop = true;
      musicPlayer.volume = MUSIC_VOLUME;
    } else if (currentMusic !== wantedMusic) {
      musicPlayer.replace(MUSIC[wantedMusic]);
      musicPlayer.loop = true;
    }
    currentMusic = wantedMusic;
    musicPlayer.play();
  });
}

/** Вмикає фонову музику теми (або тишу для null). */
export function playMusic(id: MusicId | null) {
  if (wantedMusic === id) return;
  wantedMusic = id;
  applyMusic();
}

/** Повторно запускає музику, якщо браузер заблокував автозапуск до першого дотику. */
export function resumeMusic() {
  safe(() => {
    if (settings.music && wantedMusic && musicPlayer && !musicPlayer.playing) musicPlayer.play();
    if (settings.music && wantedMusic && !musicPlayer) applyMusic();
  });
}

const pools: Partial<Record<SfxId, { players: AudioPlayer[]; next: number }>> = {};
const POOL_SIZE = 3;

export function sfx(id: SfxId, volume = 0.8) {
  if (!settings.sfx) return;
  safe(() => {
    let pool = pools[id];
    if (!pool) {
      pool = { players: [], next: 0 };
      pools[id] = pool;
    }
    if (pool.players.length < POOL_SIZE) {
      const p = createAudioPlayer(SFX[id]);
      pool.players.push(p);
    }
    const player = pool.players[pool.next % pool.players.length];
    pool.next++;
    player.volume = volume;
    player.seekTo(0).catch(() => {});
    player.play();
  });
}
