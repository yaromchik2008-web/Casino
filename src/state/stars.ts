// Пакети ігрових ₴ за Telegram Stars (той самий список у supabase/functions/tg/index.ts).
export const STAR_PACKS = [
  { id: 's15', stars: 15, amount: 100_000 },
  { id: 's50', stars: 50, amount: 400_000 },
  { id: 's150', stars: 150, amount: 1_500_000 },
  { id: 's500', stars: 500, amount: 6_000_000 },
] as const;
