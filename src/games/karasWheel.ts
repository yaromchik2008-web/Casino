// Бонус «Золотого Карася»: 3+ символи «БОНУС» запускають колесо фортуни.
// Середній виграш колеса ≈ 6.9 ставки, як у фриспінів, тож RTP слота лишається ≈ 0.89 (див. simK.ts).

export const SPRINTER_ID = 'prize-sprinter';
export const SPRINTER_VALUE = 90_000_000; // 900 000 ₴ у копійках

// Сектори на колесі по колу. 0 означає Mercedes Sprinter.
export const WHEEL_SEGMENTS = [2, 5, 3, 10, 4, 25, 2, 8, 0, 3, 15, 4, 50, 5, 100, 2];
// Вага кожного множника (скільки разів зі 109.5 він випадає).
const WEIGHTS: Record<number, number> = { 2: 34, 3: 26, 4: 18, 5: 12, 8: 8, 10: 5, 15: 3, 25: 2, 50: 1, 100: 0.5 };

/** Шанс Спринтера росте зі ставкою: внесок у середній виграш ≈ 1.5 ставки, але не більше 2%. */
export function sprinterChance(bet: number) {
  return Math.min(0.02, (1.5 * bet) / SPRINTER_VALUE);
}

/** Повертає індекс сектора, на якому зупиниться колесо. */
export function spinKarasWheel(bet: number, rand: () => number = Math.random): number {
  if (rand() < sprinterChance(bet)) return WHEEL_SEGMENTS.indexOf(0);
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  let mult = 2;
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
