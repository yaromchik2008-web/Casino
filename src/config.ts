// Сервер друзів (Supabase). Ключ anon public призначений для клієнта, його можна тримати в коді.
// Ніколи не вставляй сюди ключ service_role.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';

export const friendsEnabled = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;
