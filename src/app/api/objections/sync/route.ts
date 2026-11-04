import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { syncObjections } from "@/lib/objections";

export const maxDuration = 60;

/** Aggiunge all'elenco le obiezioni delle chiamate non ancora lette. */
export async function POST() {
  const { supabase, error } = await requireUser();
  if (error) return error;
  try {
    return NextResponse.json(await syncObjections(supabase));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}
