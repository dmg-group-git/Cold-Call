"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Analysis, Lead, Outcome } from "@/lib/types";
import { OUTCOMES } from "@/lib/types";
import { fillTemplate, formatDateTime, formatDuration, openTel, prettyLocal, telLink } from "@/lib/utils";
import { useAppData } from "@/components/useAppData";
import { useRecorder } from "@/components/useRecorder";
import { LevelMeter } from "@/components/LevelMeter";
import { WhatsAppDialog } from "@/components/WhatsAppDialog";
import { EventDialog } from "@/components/EventDialog";
import {
  Card,
  Modal,
  PageTitle,
  StatusBadge,
  btnGreen,
  btnPrimary,
  btnRed,
  btnSecondary,
  input,
  label,
} from "@/components/ui";

type Phase = "ready" | "calling" | "analyzing" | "result";

export default function ChiamatePage() {
  const supabase = useMemo(() => createClient(), []);
  const { settings, scripts, materials, loading: loadingData } = useAppData();
  const rec = useRecorder();

  const [lead, setLead] = useState<Lead | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const skipped = useRef<Set<string>>(new Set());

  const [phase, setPhase] = useState<Phase>("ready");
  const [recordEnabled, setRecordEnabled] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const callStart = useRef<number>(0);
  const [interactionId, setInteractionId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // stato schermata esito
  const [outcome, setOutcome] = useState<Outcome>("non_risponde");
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState<Record<string, boolean>>({});
  const [waOpen, setWaOpen] = useState<null | "wa_no_answer" | "wa_answered">(null);
  const [evOpen, setEvOpen] = useState<null | "videocall" | "richiamata">(null);
  const [dncOpen, setDncOpen] = useState(false);

  // timer chiamata (anche senza registrazione)
  useEffect(() => {
    if (phase !== "calling") return;
    const t = setInterval(() => setCallSeconds(Math.round((Date.now() - callStart.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const loadNext = useCallback(async () => {
    setLoading(true);
    const now = new Date().toISOString();
    const [{ data: leads }, { data: dnc }] = await Promise.all([
      supabase
        .from("leads")
        .select("*")
        .not("phone", "is", null)
        .not("status", "in", "(cliente,perso)")
        .or(`and(status.eq.nuovo,next_action_at.is.null),next_action_at.lte.${now}`)
        .order("next_action_at", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true })
        .limit(200),
      supabase.from("do_not_contact").select("phone"),
    ]);
    const blocked = new Set((dnc ?? []).map((d) => d.phone));
    const list = ((leads as Lead[]) ?? []).filter((l) => !blocked.has(l.phone!) && !skipped.current.has(l.id));
    setQueueCount(list.length);
    setLead(list[0] ?? null);
    setPhase("ready");
    setAnalysis(null);
    setAnalysisError(null);
    setInteractionId(null);
    setNotes("");
    setDone({});
    setError(null);
    setRecordEnabled(true);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  async function startCall() {
    if (!lead?.phone) return;
    setError(null);
    if (recordEnabled) {
      try {
        await rec.start(settings?.audio_device_id);
        setIsRecording(true);
      } catch {
        setError(
          "Non riesco ad accedere al microfono. Controlla i permessi del browser o il dispositivo scelto in Impostazioni.",
        );
        return;
      }
    } else {
      setIsRecording(false);
    }
    callStart.current = Date.now();
    setCallSeconds(0);
    setPhase("calling");
    // apre FaceTime sul Mac, che passa la chiamata all'iPhone
    openTel(lead.phone);
  }

  function stopRecordingOnly() {
    rec.cancel();
    setIsRecording(false);
  }

  async function endCall() {
    if (!lead) return;
    const duration = Math.round((Date.now() - callStart.current) / 1000);
    const result = isRecording ? await rec.stop() : null;
    setIsRecording(false);

    const { data: it, error: insErr } = await supabase
      .from("interactions")
      .insert({
        lead_id: lead.id,
        type: "call",
        duration_sec: duration,
        analysis_status: result ? "in_corso" : null,
      })
      .select()
      .single();
    if (insErr || !it) {
      setError("Errore nel salvataggio della chiamata: " + insErr?.message);
      setPhase("result");
      return;
    }
    setInteractionId(it.id);

    if (!result || result.blob.size < 1000) {
      // nessuna registrazione: esito scelto a mano
      setOutcome("da_richiamare");
      setPhase("result");
      return;
    }

    setPhase("analyzing");
    const path = `${lead.id}/${it.id}.${result.ext}`;
    const { error: upErr } = await supabase.storage
      .from("recordings")
      .upload(path, result.blob, { contentType: result.blob.type });
    if (upErr) {
      setAnalysisError("Caricamento audio non riuscito: " + upErr.message);
      setPhase("result");
      return;
    }
    await supabase.from("interactions").update({ recording_path: path }).eq("id", it.id);
    await runAnalysis(it.id);
  }

  async function runAnalysis(id: string) {
    setPhase("analyzing");
    setAnalysisError(null);
    try {
      const res = await fetch("/api/calls/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interactionId: id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Errore");
      const a = json.analysis as Analysis;
      setAnalysis(a);
      setOutcome(a.esito);
      // aggiorna il lead in memoria (nome referente / email trovati)
      if (lead && (a.nome_referente || a.email_lead))
        setLead({ ...lead, contact_person: a.nome_referente || lead.contact_person, email: a.email_lead || lead.email });
    } catch (e) {
      setAnalysisError(e instanceof Error ? e.message : "Errore");
    }
    setPhase("result");
  }

  async function noAnswer() {
    if (!lead) return;
    if (isRecording) rec.cancel();
    setIsRecording(false);
    const duration = phase === "calling" ? Math.round((Date.now() - callStart.current) / 1000) : 0;
    const { data: it } = await supabase
      .from("interactions")
      .insert({ lead_id: lead.id, type: "call", outcome: "non_risponde", summary: "Non risponde", duration_sec: duration })
      .select()
      .single();
    setInteractionId(it?.id ?? null);
    setAnalysis(null);
    setOutcome("non_risponde");
    setPhase("result");
  }

  async function addToDnc() {
    if (!lead?.phone) return;
    await supabase.from("do_not_contact").upsert({ phone: lead.phone, name: lead.name, reason: "Non interessato" });
    await supabase.from("interactions").insert({ lead_id: lead.id, type: "note", summary: "Aggiunto a \"non contattare\"" });
    setDone((d) => ({ ...d, dnc: true }));
    setDncOpen(false);
  }

  async function saveAndNext() {
    if (!lead) return;
    if (interactionId) {
      await supabase
        .from("interactions")
        .update({
          outcome,
          ...(notes.trim() ? { next_step: [analysis?.prossimo_passo, `Note: ${notes.trim()}`].filter(Boolean).join(" — ") } : {}),
          ...(!analysis ? { summary: OUTCOMES.find((o) => o.value === outcome)?.label } : {}),
        })
        .eq("id", interactionId);
    }
    const { data: fresh } = await supabase.from("leads").select("status, next_action_at").eq("id", lead.id).single();
    const upd: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (outcome === "non_risponde") {
      upd.status = fresh?.status === "nuovo" ? "contattato" : fresh?.status;
      if (!done.recall) upd.next_action_at = null;
    } else if (outcome === "da_richiamare") {
      if (["nuovo", "contattato"].includes(fresh?.status ?? "")) upd.status = "ha_risposto";
      if (!done.recall) upd.next_action_at = null;
    } else if (outcome === "interessato") {
      if (["nuovo", "contattato"].includes(fresh?.status ?? "")) upd.status = "ha_risposto";
      if (!done.recall) upd.next_action_at = null;
    } else if (outcome === "non_interessato") {
      upd.status = "perso";
      upd.next_action_at = null;
    }
    await supabase.from("leads").update(upd).eq("id", lead.id);
    await loadNext();
  }

  function skip() {
    if (lead) skipped.current.add(lead.id);
    loadNext();
  }

  if (loading || loadingData) return <p className="text-slate-500">Carico…</p>;

  if (!lead)
    return (
      <>
        <PageTitle>Chiamate</PageTitle>
        <Card>
          <p className="text-slate-700">Nessun lead da chiamare in coda. 🎉</p>
          <p className="mt-2 text-sm text-slate-500">
            Aggiungi nuovi lead da <Link className="text-blue-600 underline" href="/ricerca">Ricerca lead</Link>.
          </p>
        </Card>
      </>
    );

  const callScript = scripts.find((s) => s.kind === "call");
  const appointment = analysis?.data_appuntamento ?? null;
  const prettyDate = appointment ? prettyLocal(appointment) : "";

  return (
    <>
      <PageTitle sub={`${queueCount} lead in coda`}>Chiamate</PageTitle>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* SCHEDA LEAD */}
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">{lead.name}</h2>
              <p className="text-sm text-slate-500">
                {[lead.city, lead.province].filter(Boolean).join(" · ")}
              </p>
            </div>
            <StatusBadge status={lead.status} />
          </div>
          <dl className="mt-4 space-y-1 text-sm">
            <div><dt className="inline text-slate-500">Telefono: </dt><dd className="inline font-medium">{lead.phone}</dd></div>
            {lead.contact_person && <div><dt className="inline text-slate-500">Referente: </dt><dd className="inline">{lead.contact_person}</dd></div>}
            {lead.website && <div><dt className="inline text-slate-500">Sito: </dt><dd className="inline"><a className="text-blue-600 underline" href={lead.website} target="_blank">{lead.website.replace(/^https?:\/\//, "").slice(0, 40)}</a></dd></div>}
            {lead.rating != null && <div><dt className="inline text-slate-500">Google: </dt><dd className="inline">★ {lead.rating} ({lead.reviews_count} recensioni)</dd></div>}
            {lead.next_action_at && <div><dt className="inline text-slate-500">Richiamata prevista: </dt><dd className="inline">{formatDateTime(lead.next_action_at)}</dd></div>}
            {lead.notes && <div className="pt-2 text-slate-600">{lead.notes}</div>}
          </dl>
          <Link href={`/crm/${lead.id}`} className="mt-3 inline-block text-sm text-blue-600 underline" target="_blank">
            Apri scheda completa
          </Link>

          {/* CONTROLLI CHIAMATA */}
          <div className="mt-6 border-t border-slate-100 pt-4">
            {phase === "ready" && (
              <div className="space-y-3">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={recordEnabled} onChange={(e) => setRecordEnabled(e.target.checked)} />
                  Registra la chiamata {settings?.audio_device_label ? `(${settings.audio_device_label})` : ""}
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className={btnGreen} onClick={startCall}>📞 Chiama</button>
                  <button className={btnSecondary} onClick={noAnswer}>Non risponde</button>
                  <button className={btnSecondary} onClick={skip}>Salta</button>
                </div>
                <p className="text-xs text-slate-500">
                  Vivavoce: tieni l&apos;audio della chiamata sugli altoparlanti del Mac (niente cuffie) così il microfono sente anche il cliente.
                </p>
              </div>
            )}

            {phase === "calling" && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-3xl font-semibold tabular-nums">{formatDuration(callSeconds)}</span>
                  {isRecording ? (
                    <span className="flex items-center gap-1 text-sm text-red-600"><span className="h-2 w-2 animate-pulse rounded-full bg-red-600" /> registrazione</span>
                  ) : (
                    <span className="text-sm text-slate-500">non registrata</span>
                  )}
                </div>
                {isRecording && (
                  <>
                    <LevelMeter level={rec.level} />
                    <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                      Ricorda di dire: <i>&quot;La chiamata è registrata per finalità di servizio, va bene?&quot;</i>
                      <button className="mt-2 block text-xs font-medium underline" onClick={stopRecordingOnly}>
                        Il cliente non vuole: interrompi e cancella la registrazione
                      </button>
                    </div>
                  </>
                )}
                <div className="flex flex-wrap gap-2">
                  <button className={btnRed} onClick={endCall}>⏹ Termina</button>
                  <button className={btnSecondary} onClick={noAnswer}>Non risponde</button>
                  <a className={btnSecondary} href={telLink(lead.phone!)}>Richiama</a>
                </div>
              </div>
            )}

            {phase === "analyzing" && (
              <div className="flex items-center gap-3 text-sm text-slate-600">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900" />
                Trascrivo e analizzo la chiamata con Claude…
              </div>
            )}
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </div>
        </Card>

        {/* SCRIPT oppure ESITO */}
        <div className="lg:col-span-3">
          {phase !== "result" ? (
            <Card>
              <h3 className="mb-2 font-semibold">{callScript?.title ?? "Script"}</h3>
              <div className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">
                {callScript ? fillTemplate(callScript.body, lead, settings) : "Nessuno script: crealo nella pagina Script."}
              </div>
            </Card>
          ) : (
            <Card className="space-y-5">
              <h3 className="font-semibold">Esito della chiamata</h3>

              {analysisError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
                  Analisi non riuscita: {analysisError}
                  {interactionId && (
                    <button className="ml-2 underline" onClick={() => runAnalysis(interactionId)}>Riprova</button>
                  )}
                </div>
              )}

              {analysis && (
                <div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">
                  <p>{analysis.riassunto}</p>
                  {analysis.obiezioni.length > 0 && <p><b>Obiezioni:</b> {analysis.obiezioni.join("; ")}</p>}
                  <p><b>Prossimo passo:</b> {analysis.prossimo_passo}</p>
                  {appointment && <p><b>Data concordata:</b> {prettyDate}</p>}
                </div>
              )}

              <div>
                <span className={label}>Esito {analysis ? "(proposto da Claude, puoi cambiarlo)" : ""}</span>
                <div className="flex flex-wrap gap-2">
                  {OUTCOMES.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setOutcome(o.value)}
                      className={`rounded-lg border px-3 py-1.5 text-sm ${
                        outcome === o.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white"
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* AZIONI PROPOSTE: partono solo dopo conferma */}
              <div className="space-y-2">
                <span className={label}>Azioni proposte</span>
                {outcome === "non_risponde" && (
                  <ActionButton done={done.wa} onClick={() => setWaOpen("wa_no_answer")}>Inviamo il WhatsApp &quot;non risponde&quot;?</ActionButton>
                )}
                {outcome === "da_richiamare" && (
                  <ActionButton done={done.recall} onClick={() => setEvOpen("richiamata")}>
                    Fissiamo la richiamata{appointment ? ` il ${prettyDate}` : ""}?
                  </ActionButton>
                )}
                {outcome === "interessato" && (
                  <>
                    <ActionButton done={done.wa} onClick={() => setWaOpen("wa_answered")}>Inviamo il WhatsApp con video e PDF?</ActionButton>
                    <ActionButton done={done.meet} onClick={() => setEvOpen("videocall")}>
                      Fissiamo la videocall{appointment && analysis?.tipo_appuntamento === "videocall" ? ` il ${prettyDate}` : ""}?
                    </ActionButton>
                    <ActionButton done={done.recall} onClick={() => setEvOpen("richiamata")}>Fissiamo una richiamata?</ActionButton>
                  </>
                )}
                {outcome === "non_interessato" && (
                  <ActionButton done={done.dnc} onClick={() => setDncOpen(true)}>Aggiungiamo a &quot;non contattare&quot;?</ActionButton>
                )}
              </div>

              <div>
                <span className={label}>Note (facoltative)</span>
                <textarea className={`${input} h-20`} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div className="flex justify-end">
                <button className={btnPrimary} onClick={saveAndNext}>Salva e passa al prossimo →</button>
              </div>
            </Card>
          )}
        </div>
      </div>

      {waOpen && (
        <WhatsAppDialog
          open
          onClose={() => setWaOpen(null)}
          onSent={() => setDone((d) => ({ ...d, wa: true }))}
          lead={lead}
          kind={waOpen}
          scripts={scripts}
          materials={materials}
          settings={settings}
          title={waOpen === "wa_answered" ? "Inviamo il WhatsApp con video e PDF?" : "Inviamo il WhatsApp?"}
        />
      )}
      {evOpen && (
        <EventDialog
          open
          onClose={() => setEvOpen(null)}
          onDone={() => setDone((d) => ({ ...d, [evOpen === "videocall" ? "meet" : "recall"]: true }))}
          lead={lead}
          kind={evOpen}
          initialStart={
            appointment && (analysis?.tipo_appuntamento === evOpen || analysis?.tipo_appuntamento === "nessuno" || evOpen === "richiamata" && outcome === "da_richiamare")
              ? appointment
              : null
          }
          settings={settings}
          notes={analysis?.riassunto}
        />
      )}
      <Modal open={dncOpen} onClose={() => setDncOpen(false)} title="Aggiungiamo a &quot;non contattare&quot;?">
        <p className="text-sm text-slate-600">{lead.name} ({lead.phone}) non verrà più proposto in ricerche e chiamate.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btnSecondary} onClick={() => setDncOpen(false)}>Annulla</button>
          <button className={btnRed} onClick={addToDnc}>Sì, aggiungi</button>
        </div>
      </Modal>
    </>
  );
}

function ActionButton({ done, onClick, children }: { done?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm ${
        done ? "border-green-300 bg-green-50 text-green-800" : "border-slate-300 bg-white hover:bg-slate-50"
      }`}
    >
      <span>{children}</span>
      <span>{done ? "✓ fatto" : "Conferma →"}</span>
    </button>
  );
}
