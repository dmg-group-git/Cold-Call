import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { transcribeAudio } from "@/lib/transcribe";

export const maxDuration = 60;

/** Pagina di prova audio: trascrive un file di test e poi lo cancella. */
export async function POST(req: Request) {
  const { supabase, error } = await requireUser();
  if (error) return error;
  const { path } = await req.json();
  if (!String(path).startsWith("test/"))
    return NextResponse.json({ error: "Percorso non valido" }, { status: 400 });
  try {
    const { data: signed } = await supabase.storage.from("recordings").createSignedUrl(path, 600);
    if (!signed) throw new Error("Impossibile leggere l'audio");
    const transcript = await transcribeAudio(signed.signedUrl);
    await supabase.storage.from("recordings").remove([path]);
    return NextResponse.json({ transcript });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status: 500 });
  }
}
