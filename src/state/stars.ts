// Пакети ігрових ₴ за Telegram Stars (той самий список у supabase/functions/tg/index.ts).
// Курс 1⭐ = 100 ₴, великі пакети з бонусом.
export const STAR_PACKS = [
  { id: 's5', stars: 5, amount: 50_000 },
  { id: 's15', stars: 15, amount: 150_000 },
  { id: 's25', stars: 25, amount: 250_000 },
  { id: 's50', stars: 50, amount: 550_000 },
  { id: 's100', stars: 100, amount: 1_150_000 },
  { id: 's250', stars: 250, amount: 3_000_000 },
  { id: 's500', stars: 500, amount: 6_500_000 },
  { id: 's1000', stars: 1000, amount: 14_000_000 },
] as const;
