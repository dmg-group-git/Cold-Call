import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { transcribeAudio } from "@/lib/transcribe";
import { analyzeTranscript } from "@/lib/analyze";

export const maxDuration = 60;

/** Dopo "Termina": trascrive l'audio e lo fa analizzare a Claude. */
export async function POST(req: Request) {
  const { supabase, error } = await requireUser();
  if (error) return error;
  const { interactionId } = await req.json();

  const { data: it } = await supabase
    .from("interactions")
    .select("*, leads(name)")
    .eq("id", interactionId)
    .single();
  if (!it?.recording_path)
    return NextResponse.json({ error: "Registrazione non trovata" }, { status: 404 });

  await supabase.from("interactions").update({ analysis_status: "in_corso" }).eq("id", interactionId);

  try {
    const { data: signed, error: sErr } = await supabase.storage
      .from("recordings")
      .createSignedUrl(it.recording_path, 600);
    if (sErr || !signed) throw new Error("Impossibile leggere l'audio");

    const transcript = await transcribeAudio(signed.signedUrl);
    const analysis = await analyzeTranscript(transcript, it.leads?.name ?? "");

    await supabase
      .from("interactions")
      .update({
        transcript,
        outcome: analysis.esito,
        summary: analysis.riassunto,
        objections: analysis.obiezioni,
        next_step: analysis.prossimo_passo,
        analysis_status: "completata",
        data: { analysis },
      })
      .eq("id", interactionId);

    // dati utili ricavati dalla chiamata
    const leadUpdate: Record<string, string> = {};
    if (analysis.nome_referente) leadUpdate.contact_person = analysis.nome_referente;
    if (analysis.email_lead) leadUpdate.email = analysis.email_lead;
    if (Object.keys(leadUpdate).length)
      await supabase.from("leads").update(leadUpdate).eq("id", it.lead_id);

    return NextResponse.json({ transcript, analysis });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Errore";
    await supabase
      .from("interactions")
      .update({ analysis_status: "errore", data: { error: message } })
      .eq("id", interactionId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
