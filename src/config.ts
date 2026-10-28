// Сервер друзів (Supabase). Ключ anon public призначений для клієнта, його можна тримати в коді.
// Ніколи не вставляй сюди ключ service_role.
export const SUPABASE_URL = 'https://kkujedghuxgtxmsbquqc.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtrdWplZGdodXhndHhtc2JxdXFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMxMzM3NjIsImV4cCI6MjEwODcwOTc2Mn0.HzsrtxIjwr1VfJqMqHt6BZY6yW3tq0cNaRJR3MTRgnc';

export const friendsEnabled = () => !!SUPABASE_URL && !!SUPABASE_ANON_KEY;

// Ім'я бота без @ для посилань-запрошень (t.me/<бот>?startapp=ref_КОД). Порожнє: даємо посилання на сайт.
export const BOT_USERNAME = '';
export const WEB_URL = 'https://yaromchik2008-web.github.io/Casino/';
