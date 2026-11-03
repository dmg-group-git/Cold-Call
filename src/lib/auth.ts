import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Controlla che chi chiama l'API sia loggato. */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      supabase,
      user: null,
      error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }),
    } as const;
  }
  return { supabase, user, error: null } as const;
}
