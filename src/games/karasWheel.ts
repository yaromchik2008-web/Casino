// Бонус «Золотого Карася»: 3+ символи «БОНУС» дають 5 фриспінів, а колесо множить їхній виграш.
// Середній множник ≈ 2.2, банк ≈ 3.7 ставки, бонус раз на 42 оберти: RTP слота ≈ 0.91 (див. simK2.ts).

export const SPRINTER_ID = 'prize-sprinter';
export const SPRINTER_VALUE = 90_000_000; // 900 000 ₴ у копійках

// Сектори на колесі по колу. 0 означає Mercedes Sprinter.
export const WHEEL_SEGMENTS = [2, 5, 1, 10, 3, 25, 1, 2, 0, 3, 50, 1, 5, 2, 100, 1];
// Вага кожного множника (скільки разів приблизно зі 109 він випадає).
const WEIGHTS: Record<number, number> = { 1: 60, 2: 28, 3: 12, 5: 6, 10: 2.5, 25: 0.6, 50: 0.25, 100: 0.1 };

/** Шанс Спринтера росте зі ставкою: внесок у середній виграш ≈ 1.5 ставки, але не більше 2%. */
export function sprinterChance(bet: number) {
  return Math.min(0.02, (1.5 * bet) / SPRINTER_VALUE);
}

/** Повертає індекс сектора, на якому зупиниться колесо. */
export function spinKarasWheel(bet: number, rand: () => number = Math.random): number {
  if (rand() < sprinterChance(bet)) return WHEEL_SEGMENTS.indexOf(0);
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  let mult = 1;
  for (const [m, w] of Object.entries(WEIGHTS)) {
    r -= w;
    if (r < 0) {
      mult = Number(m);
      break;
    }
  }
  const options = WHEEL_SEGMENTS.map((m, i) => (m === mult ? i : -1)).filter((i) => i >= 0);
  return options[Math.floor(rand() * options.length)];
}
