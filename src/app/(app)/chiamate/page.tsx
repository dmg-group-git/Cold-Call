"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Analysis, Lead, Outcome } from "@/lib/types";
import { OUTCOMES } from "@/lib/types";
import { fillTemplate, formatDateTime, formatDuration, formatPhone, openTel, prettyLocal, telLink } from "@/lib/utils";
import { useAppData } from "@/components/useAppData";
import { useRecorder } from "@/components/useRecorder";
import { LevelMeter } from "@/components/LevelMeter";
import { WhatsAppDialog } from "@/components/WhatsAppDialog";
import { EventDialog } from "@/components/EventDialog";
import {
  ArrowRight,
  Ban,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  MapPin,
  MessageCircle,
  Mic,
  PartyPopper,
  Phone,
  PhoneMissed,
  PhoneOff,
  RotateCcw,
  Search,
  SkipForward,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  User,
  Video,
  type LucideIcon,
} from "lucide-react";
import {
  Alert,
  Avatar,
  Card,
  CardTitle,
  EmptyState,
  Loading,
  Modal,
  PageTitle,
  Spinner,
  StatusBadge,
  btnGreen,
  btnLg,
  btnPrimary,
  btnRed,
  btnSecondary,
  input,
  label,
  link,
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
  const [saving, setSaving] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);

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
    if (!lead || saving) return;
    setSaving(true);
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
    setSessionCount((n) => n + 1);
    await loadNext();
    setSaving(false);
  }

  function skip() {
    if (lead) skipped.current.add(lead.id);
    loadNext();
  }

  // scorciatoie da tastiera: C chiama, N non risponde, S salta, T termina, 1-4 esito, Invio salva
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyHandler.current = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || !lead) return;
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName) || t.isContentEditable) return;
      if (waOpen || evOpen || dncOpen) return;
      const k = e.key.toLowerCase();
      if (phase === "ready") {
        if (k === "c") startCall();
        else if (k === "n") noAnswer();
        else if (k === "s") skip();
        else return;
      } else if (phase === "calling") {
        if (k === "t") endCall();
        else if (k === "n") noAnswer();
        else return;
      } else if (phase === "result") {
        const o = OUTCOMES[Number(k) - 1];
        if (o) setOutcome(o.value);
        else if (k === "enter" && t.tagName !== "BUTTON" && t.tagName !== "A") saveAndNext();
        else return;
      } else return;
      e.preventDefault();
    };
  });
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  if (loading || loadingData) return <Loading text="Preparo la coda chiamate…" />;

  if (!lead)
    return (
      <>
        <PageTitle>Chiamate</PageTitle>
        <Card>
          <EmptyState
            icon={PartyPopper}
            title="Coda vuota, ottimo lavoro!"
            action={
              <Link className={btnPrimary} href="/ricerca">
                <Search size={16} /> Trova nuovi lead
              </Link>
            }
          >
            {sessionCount > 0
              ? `Hai lavorato ${sessionCount} lead in questa sessione. Non ci sono altri lead da chiamare adesso.`
              : "Non ci sono lead da chiamare adesso. Le richiamate programmate compariranno qui all'ora giusta."}
          </EmptyState>
        </Card>
      </>
    );

  const callScript = scripts.find((s) => s.kind === "call");
  const appointment = analysis?.data_appuntamento ?? null;
  const prettyDate = appointment ? prettyLocal(appointment) : "";
  const stepIndex = phase === "ready" ? 0 : phase === "result" ? 2 : 1;

  return (
    <>
      <PageTitle
        sub={
          <>
            <b className="text-slate-700">{queueCount}</b> lead in coda
            {sessionCount > 0 && (
              <>
                {" "}· <b className="text-slate-700">{sessionCount}</b> fatti in questa sessione
              </>
            )}
          </>
        }
        actions={<Stepper index={stepIndex} />}
      >
        Chiamate
      </PageTitle>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* SCHEDA LEAD */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden p-0">
            {/* intestazione "a eroe" */}
            <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-900 to-brand-900 p-5 text-white">
              <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-500/30 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-20 -left-10 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" />
              <div className="relative flex items-start gap-3">
                <Avatar name={lead.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="font-display truncate text-xl font-bold leading-tight">{lead.name}</h2>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-300">
                    <StatusBadge status={lead.status} />
                    {(lead.city || lead.province) && (
                      <span className="flex items-center gap-1">
                        <MapPin size={13} /> {[lead.city, lead.province].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <a
                href={telLink(lead.phone!)}
                className="relative mt-5 block font-mono text-[28px] font-semibold tracking-wide text-white tabular-nums transition hover:text-brand-200"
              >
                {formatPhone(lead.phone)}
              </a>
            </div>

            <div className="p-5">
              <dl className="grid gap-2 text-sm">
                {lead.contact_person && <Info icon={User} label="Referente">{lead.contact_person}</Info>}
                {lead.website && (
                  <Info icon={Globe} label="Sito">
                    <a className={link} href={lead.website} target="_blank">
                      {lead.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 36)}
                    </a>
                  </Info>
                )}
                {lead.rating != null && (
                  <Info icon={Star} label="Google">
                    {lead.rating} <span className="text-slate-400">({lead.reviews_count} recensioni)</span>
                  </Info>
                )}
                {lead.next_action_at && (
                  <Info icon={CalendarClock} label="Richiamata">{formatDateTime(lead.next_action_at)}</Info>
                )}
              </dl>
              {lead.notes && <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{lead.notes}</p>}
              <Link href={`/crm/${lead.id}`} className={`${link} mt-3 inline-flex items-center gap-1 text-sm`} target="_blank">
                Apri scheda completa <ExternalLink size={13} />
              </Link>
            </div>

            {/* CONTROLLI CHIAMATA */}
            <div className="border-t border-slate-100 bg-slate-50/60 p-5">
              {phase === "ready" && (
                <div className="space-y-4">
                  <button className={`${btnGreen} ${btnLg} w-full`} onClick={startCall}>
                    <Phone size={18} /> Chiama ora <kbd className="ml-1">C</kbd>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button className={btnSecondary} onClick={noAnswer}>
                      <PhoneMissed size={15} /> Non risponde <kbd>N</kbd>
                    </button>
                    <button className={btnSecondary} onClick={skip}>
                      <SkipForward size={15} /> Salta <kbd>S</kbd>
                    </button>
                  </div>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={recordEnabled} onChange={(e) => setRecordEnabled(e.target.checked)} />
                    <Mic size={14} className="text-slate-400" />
                    Registra la chiamata
                    {settings?.audio_device_label && (
                      <span className="truncate text-xs text-slate-400">({settings.audio_device_label})</span>
                    )}
                  </label>
                  <p className="text-xs leading-relaxed text-slate-500">
                    Tieni l&apos;audio sugli altoparlanti del Mac (niente cuffie), così il microfono sente anche il cliente.
                  </p>
                </div>
              )}

              {phase === "calling" && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center py-2">
                    <div className="relative flex h-36 w-36 items-center justify-center">
                      {isRecording && (
                        <>
                          <span className="animate-ring absolute inset-0 rounded-full border-2 border-rose-500" />
                          <span className="animate-ring absolute inset-0 rounded-full border-2 border-rose-500 [animation-delay:0.8s]" />
                        </>
                      )}
                      <span
                        className={`relative flex h-32 w-32 items-center justify-center rounded-full border-4 bg-white shadow-lg ${
                          isRecording ? "border-rose-500 shadow-rose-500/20" : "border-emerald-500 shadow-emerald-500/20"
                        }`}
                      >
                        <span className="font-display text-3xl font-bold tracking-tight tabular-nums text-slate-900">
                          {formatDuration(callSeconds)}
                        </span>
                      </span>
                    </div>
                    {isRecording ? (
                      <span className="mt-2 flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> REC
                      </span>
                    ) : (
                      <span className="mt-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">Non registrata</span>
                    )}
                  </div>
                  {isRecording && (
                    <>
                      <LevelMeter level={rec.level} />
                      <Alert tone="warning">
                        Ricorda di dire: <i>&quot;La chiamata è registrata per finalità di servizio, va bene?&quot;</i>
                        <button className="mt-1.5 block text-xs font-medium underline" onClick={stopRecordingOnly}>
                          Il cliente non vuole: interrompi e cancella la registrazione
                        </button>
                      </Alert>
                    </>
                  )}
                  <button className={`${btnRed} ${btnLg} w-full`} onClick={endCall}>
                    <PhoneOff size={18} /> Termina chiamata <kbd className="ml-1">T</kbd>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button className={btnSecondary} onClick={noAnswer}>
                      <PhoneMissed size={15} /> Non risponde <kbd>N</kbd>
                    </button>
                    <a className={btnSecondary} href={telLink(lead.phone!)}>
                      <RotateCcw size={15} /> Richiama
                    </a>
                  </div>
                </div>
              )}

              {phase === "analyzing" && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
                    <Sparkles size={22} className="animate-pulse" />
                  </span>
                  <div>
                    <p className="font-medium text-slate-900">Analizzo la chiamata…</p>
                    <p className="text-sm text-slate-500">Trascrizione e riassunto con Claude, pochi secondi.</p>
                  </div>
                </div>
              )}

              {phase === "result" && (
                <p className="flex items-center gap-2 text-sm text-slate-600">
                  <CheckCircle2 size={16} className="text-emerald-600" /> Chiamata conclusa: scegli l&apos;esito a destra.
                </p>
              )}
              {error && <Alert tone="error" className="mt-3">{error}</Alert>}
            </div>
          </Card>
        </div>

        {/* SCRIPT oppure ESITO */}
        <div className="lg:col-span-3">
          {phase !== "result" ? (
            <Card className="lg:sticky lg:top-6">
              <CardTitle icon={FileText}>{callScript?.title ?? "Script"}</CardTitle>
              <div className="paper whitespace-pre-wrap rounded-xl border border-slate-200 py-4 pl-7 pr-5 text-[16px] leading-8 text-slate-800 shadow-inner shadow-slate-200/40">
                {callScript ? (
                  fillTemplate(callScript.body, lead, settings)
                ) : (
                  <span className="text-slate-500">
                    Nessuno script: crealo nella pagina <Link className={link} href="/script">Script</Link>.
                  </span>
                )}
              </div>
            </Card>
          ) : (
            <Card className="space-y-6">
              <CardTitle icon={ClipboardCheck} sub="Controlla, conferma le azioni e passa al prossimo lead.">
                Esito della chiamata
              </CardTitle>

              {analysisError && (
                <Alert tone="error">
                  Analisi non riuscita: {analysisError}
                  {interactionId && (
                    <button className="ml-2 font-medium underline" onClick={() => runAnalysis(interactionId)}>
                      Riprova
                    </button>
                  )}
                </Alert>
              )}

              {analysis && (
                <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-sm text-slate-700">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                    <Sparkles size={13} /> Riassunto di Claude
                  </div>
                  <p className="text-slate-800">{analysis.riassunto}</p>
                  {analysis.obiezioni.length > 0 && (
                    <p>
                      <b>Obiezioni:</b> {analysis.obiezioni.join("; ")}
                    </p>
                  )}
                  <p>
                    <b>Prossimo passo:</b> {analysis.prossimo_passo}
                  </p>
                  {appointment && (
                    <p>
                      <b>Data concordata:</b> {prettyDate}
                    </p>
                  )}
                </div>
              )}

              <div>
                <span className={label}>
                  Esito {analysis && <span className="font-normal text-slate-400">(proposto da Claude, puoi cambiarlo)</span>}
                </span>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {OUTCOMES.map((o, i) => {
                    const st = OUTCOME_STYLE[o.value];
                    const sel = outcome === o.value;
                    return (
                      <button
                        key={o.value}
                        onClick={() => setOutcome(o.value)}
                        className={`relative flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center text-sm font-semibold transition-all duration-150 ${
                          sel ? `${st.on} scale-[1.03]` : "border-slate-200 bg-white text-slate-600 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow"
                        }`}
                      >
                        <st.icon size={20} />
                        {o.label.replace(" (no)", "")}
                        <kbd className="absolute right-1.5 top-1.5">{i + 1}</kbd>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AZIONI PROPOSTE: partono solo dopo conferma */}
              <div className="space-y-2">
                <span className={label}>Azioni consigliate</span>
                {outcome === "non_risponde" && (
                  <ActionButton icon={MessageCircle} done={done.wa} onClick={() => setWaOpen("wa_no_answer")}>
                    Inviamo il WhatsApp &quot;non risponde&quot;?
                  </ActionButton>
                )}
                {outcome === "da_richiamare" && (
                  <ActionButton icon={CalendarClock} done={done.recall} onClick={() => setEvOpen("richiamata")}>
                    Fissiamo la richiamata{appointment ? ` il ${prettyDate}` : ""}?
                  </ActionButton>
                )}
                {outcome === "interessato" && (
                  <>
                    <ActionButton icon={MessageCircle} done={done.wa} onClick={() => setWaOpen("wa_answered")}>
                      Inviamo il WhatsApp con video e PDF?
                    </ActionButton>
                    <ActionButton icon={Video} done={done.meet} onClick={() => setEvOpen("videocall")}>
                      Fissiamo la videocall
                      {appointment && analysis?.tipo_appuntamento === "videocall" ? ` il ${prettyDate}` : ""}?
                    </ActionButton>
                    <ActionButton icon={CalendarClock} done={done.recall} onClick={() => setEvOpen("richiamata")}>
                      Fissiamo una richiamata?
                    </ActionButton>
                  </>
                )}
                {outcome === "non_interessato" && (
                  <ActionButton icon={Ban} done={done.dnc} onClick={() => setDncOpen(true)}>
                    Aggiungiamo a &quot;non contattare&quot;?
                  </ActionButton>
                )}
              </div>

              <div>
                <span className={label}>Note (facoltative)</span>
                <textarea
                  className={`${input} h-20`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Qualcosa da ricordare per la prossima volta…"
                />
              </div>

              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <span className="hidden text-xs text-slate-400 sm:block">
                  Premi <kbd>Invio</kbd> per salvare
                </span>
                <button className={`${btnPrimary} ${btnLg}`} onClick={saveAndNext} disabled={saving}>
                  {saving ? <Spinner className="border-white/40 border-t-white" /> : null}
                  Salva e passa al prossimo <ArrowRight size={18} />
                </button>
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
            appointment &&
            (analysis?.tipo_appuntamento === evOpen ||
              analysis?.tipo_appuntamento === "nessuno" ||
              (evOpen === "richiamata" && outcome === "da_richiamare"))
              ? appointment
              : null
          }
          settings={settings}
          notes={analysis?.riassunto}
        />
      )}
      <Modal open={dncOpen} onClose={() => setDncOpen(false)} icon={Ban} title="Aggiungiamo a &quot;non contattare&quot;?">
        <p className="text-sm text-slate-600">
          {lead.name} ({lead.phone}) non verrà più proposto in ricerche e chiamate.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className={btnSecondary} onClick={() => setDncOpen(false)}>
            Annulla
          </button>
          <button className={btnRed} onClick={addToDnc}>
            Sì, aggiungi
          </button>
        </div>
      </Modal>
    </>
  );
}

const OUTCOME_STYLE: Record<Outcome, { icon: LucideIcon; on: string }> = {
  non_risponde: { icon: PhoneMissed, on: "border-slate-700 bg-slate-700 text-white shadow-lg shadow-slate-700/30" },
  da_richiamare: { icon: Clock, on: "border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-500/30" },
  interessato: { icon: ThumbsUp, on: "border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-600/30" },
  non_interessato: { icon: ThumbsDown, on: "border-rose-600 bg-rose-600 text-white shadow-lg shadow-rose-600/30" },
};

function Stepper({ index }: { index: number }) {
  const steps = ["Pronto", "In chiamata", "Esito"];
  return (
    <ol className="flex items-center gap-2 text-xs font-medium">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 ${
              i === index
                ? "bg-brand-600 text-white"
                : i < index
                  ? "bg-brand-50 text-brand-700"
                  : "bg-white text-slate-400 ring-1 ring-slate-200"
            }`}
          >
            {i < index ? <CheckCircle2 size={12} /> : <span>{i + 1}</span>}
            {s}
          </span>
          {i < steps.length - 1 && <span className="h-px w-3 bg-slate-300" />}
        </li>
      ))}
    </ol>
  );
}

function Info({ icon: Icon, label: l, children }: { icon: LucideIcon; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} className="shrink-0 text-slate-400" />
      <dt className="w-20 shrink-0 text-slate-500">{l}</dt>
      <dd className="min-w-0 truncate text-slate-800">{children}</dd>
    </div>
  );
}

function ActionButton({
  icon: Icon,
  done,
  onClick,
  children,
}: {
  icon: LucideIcon;
  done?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`group flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition ${
        done
          ? "border-emerald-200 bg-emerald-50 text-emerald-900"
          : "border-slate-200 bg-white text-slate-800 hover:border-brand-300 hover:bg-brand-50/40"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 group-hover:bg-brand-100 group-hover:text-brand-700"
        }`}
      >
        {done ? <Check size={16} /> : <Icon size={16} />}
      </span>
      <span className="flex-1 font-medium">{children}</span>
      <span className={`text-xs font-medium ${done ? "text-emerald-700" : "text-brand-600"}`}>
        {done ? "Fatto" : "Conferma →"}
      </span>
    </button>
  );
}
