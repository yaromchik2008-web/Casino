// Пакети ігрових ₴ за Telegram Stars (той самий список у supabase/functions/tg/index.ts).
// Курс 1⭐ = 100 ₴, великі пакети з бонусом.
export const STAR_PACKS = [
  { id: 's15', stars: 15, amount: 150_000 },
  { id: 's50', stars: 50, amount: 550_000 },
  { id: 's150', stars: 150, amount: 1_800_000 },
  { id: 's500', stars: 500, amount: 6_500_000 },
] as const;
