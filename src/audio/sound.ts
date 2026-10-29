import AsyncStorage from '@react-native-async-storage/async-storage';
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';
import { MUSIC, MusicId, SFX, SfxId } from './assets';

export type { MusicId, SfxId };

export interface Settings {
  music: boolean;
  sfx: boolean;
  vibration: boolean;
  fastSpin: boolean;
  breakReminder: boolean;
  lite: boolean;
}

const KEY = 'freecasino:settings:v1';
const MUSIC_VOLUME = 0.35;

// На айфонах (і в Telegram на айфоні) анімації на JS гальмують, тож за замовчуванням легкий режим.
function isIOS() {
  if (Platform.OS === 'ios') return true;
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

let settings: Settings = {
  music: true,
  sfx: true,
  vibration: true,
  fastSpin: false,
  breakReminder: true,
  lite: isIOS(),
};
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
  preloadSfx();
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

// ───────────── Веб: короткі звуки через Web Audio ─────────────
// HTML <audio> на айфоні гальмує головний потік на кожному play/seek, тож на вебі звуки декодуємо один раз
// і граємо з буфера; це не блокує анімацію.
type WebCtx = AudioContext;
let webCtx: WebCtx | null = null;
const buffers: Partial<Record<SfxId, AudioBuffer | 'loading' | 'failed'>> = {};

function audioCtx(): WebCtx | null {
  if (webCtx) return webCtx;
  const g = globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const C = g.AudioContext ?? g.webkitAudioContext;
  if (!C) return null;
  webCtx = new C();
  // Браузер дозволяє звук лише після дотику, тож будимо контекст на першому ж дотику.
  const wake = () => {
    if (webCtx && webCtx.state !== 'running') webCtx.resume().catch(() => {});
  };
  if (typeof document !== 'undefined') {
    document.addEventListener('touchstart', wake, { passive: true });
    document.addEventListener('pointerdown', wake, { passive: true });
  }
  return webCtx;
}

function assetUri(m: unknown): string {
  if (typeof m === 'string') return m;
  const o = m as { uri?: string; default?: string } | null;
  return o?.uri ?? o?.default ?? '';
}

function loadBuffer(ctx: WebCtx, id: SfxId) {
  buffers[id] = 'loading';
  fetch(assetUri(SFX[id]))
    .then((r) => r.arrayBuffer())
    .then((data) => new Promise<AudioBuffer>((ok, fail) => ctx.decodeAudioData(data, ok, fail)))
    .then((b) => (buffers[id] = b))
    .catch(() => (buffers[id] = 'failed'));
}

/** Завантажує всі короткі звуки наперед, щоб перший удар не чекав на мережу. */
export function preloadSfx() {
  if (Platform.OS !== 'web') return;
  const ctx = audioCtx();
  if (!ctx) return;
  for (const id of Object.keys(SFX) as SfxId[]) if (!buffers[id]) loadBuffer(ctx, id);
}

function webSfx(id: SfxId, volume: number): boolean {
  const ctx = audioCtx();
  if (!ctx) return false;
  const b = buffers[id];
  if (b === 'failed') return false;
  if (!b) loadBuffer(ctx, id);
  if (!b || b === 'loading') return true; // ще вантажиться: краще пропустити звук, ніж гальмувати
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  const src = ctx.createBufferSource();
  src.buffer = b;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(gain).connect(ctx.destination);
  src.start();
  return true;
}

export function sfx(id: SfxId, volume = 0.8) {
  if (!settings.sfx) return;
  if (Platform.OS === 'web' && webSfx(id, volume)) return;
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
