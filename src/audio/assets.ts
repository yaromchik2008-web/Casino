// Згенеровано: власна музика і звуки (synth у scratchpad), без чужих семплів.
export const MUSIC = {
  bonus: require('../../assets/audio/m_bonus.mp3'),
  candy: require('../../assets/audio/m_candy.mp3'),
  classic: require('../../assets/audio/m_classic.mp3'),
  dragon: require('../../assets/audio/m_dragon.mp3'),
  egypt: require('../../assets/audio/m_egypt.mp3'),
  forest: require('../../assets/audio/m_forest.mp3'),
  fruit: require('../../assets/audio/m_fruit.mp3'),
  jackpot: require('../../assets/audio/m_jackpot.mp3'),
  lobby: require('../../assets/audio/m_lobby.mp3'),
  mine: require('../../assets/audio/m_mine.mp3'),
  ocean: require('../../assets/audio/m_ocean.mp3'),
  pirates: require('../../assets/audio/m_pirates.mp3'),
  space: require('../../assets/audio/m_space.mp3'),
  vikings: require('../../assets/audio/m_vikings.mp3'),
  western: require('../../assets/audio/m_western.mp3'),
} as const;

export const SFX = {
  bigwin: require('../../assets/audio/s_bigwin.mp3'),
  bomb: require('../../assets/audio/s_bomb.mp3'),
  bonus: require('../../assets/audio/s_bonus.mp3'),
  break: require('../../assets/audio/s_break.mp3'),
  cash: require('../../assets/audio/s_cash.mp3'),
  click: require('../../assets/audio/s_click.mp3'),
  coin: require('../../assets/audio/s_coin.mp3'),
  goal: require('../../assets/audio/s_goal.mp3'),
  hit: require('../../assets/audio/s_hit.mp3'),
  lock: require('../../assets/audio/s_lock.mp3'),
  lose: require('../../assets/audio/s_lose.mp3'),
  pop: require('../../assets/audio/s_pop.mp3'),
  spin: require('../../assets/audio/s_spin.mp3'),
  stop: require('../../assets/audio/s_stop.mp3'),
  whistle: require('../../assets/audio/s_whistle.mp3'),
  win: require('../../assets/audio/s_win.mp3'),
} as const;

export type MusicId = keyof typeof MUSIC;
export type SfxId = keyof typeof SFX;
