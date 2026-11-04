import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { writeAnswer } from "@/lib/objections";

export const maxDuration = 60;

/** Claude scrive una risposta consigliata per un'obiezione. */
export async function POST(req: Request) {
  const { supabase, error } = await requireUser();
  if (error) return error;
  const { text } = await req.json();
  if (!text || typeof text !== "string") return NextResponse.json({ error: "Obiezione mancante" }, { status: 400 });
  try {
    return NextResponse.json({ answer: await writeAnswer(supabase, text.slice(0, 500)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}
