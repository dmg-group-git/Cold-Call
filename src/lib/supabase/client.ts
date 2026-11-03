import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // i valori di riserva servono solo a far completare la build prima che le chiavi siano inserite su Vercel
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder",
  );
}
