"use client";
import { RecallsToday } from "@/components/RecallsToday";
import { PriorityBadge } from "@/components/PriorityBadge";
import { CallCoaching } from "@/components/CallCoaching";
import { leadPriority } from "@/lib/priority";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Analysis, Lead, Outcome } from "@/lib/types";
import { OUTCOMES } from "@/lib/types";
import { fillTemplate, formatDateTime, formatDuration, formatPhone, openTel, prettyLocal, siteUrl, telLink } from "@/lib/utils";
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
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock,
  ExternalLink,
  FileText,
  Globe,
  MapPin,
  Maximize2,
  MessageCircle,
  Mic,
  Minimize2,
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
  Video,
  type LucideIcon,
} from "lucide-react";
import { ScriptSections } from "@/components/ScriptSections";
import {
  Alert,
  Avatar,
  Card,
  CardTitle,
  Collapse,
  Toggle,
  usePersistentOpen,
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

/** Esito in sospeso: resta salvato nel browser finché non premi "Salva e passa al prossimo". */
const PENDING_KEY = "chiamate:esito-in-sospeso";
type Pending = {
  phase: "analyzing" | "result";
  lead: Lead;
  interactionId: string | null;
  analysis: Analysis | null;
  analysisError: string | null;
  outcome: Outcome;
  notes: string;
  done: Record<string, boolean>;
};
function readPending(): Pending | null {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}
function writePending(p: Pending | null) {
  try {
    if (p) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {}
}

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
  const [detailsOpen, setDetailsOpen] = usePersistentOpen("lead-details", false);
  const [focus, setFocus] = useState(false);
  // modalità focus: nasconde menu e dettagli
  useEffect(() => {
    document.body.classList.toggle("focus-mode", focus);
    return () => document.body.classList.remove("focus-mode");
  }, [focus]);

  // timer chiamata (anche senza registrazione)
  useEffect(() => {
    if (phase !== "calling") return;
    const t = setInterval(() => setCallSeconds(Math.round((Date.now() - callStart.current) / 1000)), 1000);
    return () => clearInterval(t);
  }, [phase]);

  const loadNext = useCallback(async () => {
    writePending(null);
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
        .limit(1000),
      supabase.from("do_not_contact").select("phone"),
    ]);
    const blocked = new Set((dnc ?? []).map((d) => d.phone));
    const nowMs = Date.now();
    const isDue = (l: Lead) => !!l.next_action_at && new Date(l.next_action_at).getTime() <= nowMs;
    // prima le richiamate scadute (in ordine di ora), poi i lead nuovi dal più promettente
    const list = ((leads as Lead[]) ?? [])
      .filter((l) => !blocked.has(l.phone!) && !skipped.current.has(l.id))
      .sort((a, b) => {
        const da = isDue(a), db = isDue(b);
        if (da !== db) return da ? -1 : 1;
        if (da && db) return new Date(a.next_action_at!).getTime() - new Date(b.next_action_at!).getTime();
        const pa = leadPriority(a).score, pb = leadPriority(b).score;
        if (pa !== pb) return pb - pa;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
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

  // all'apertura: se c'era un esito lasciato a metà, lo ripristino invece di passare al prossimo lead
  const restored = useRef(false);
  useEffect(() => {
    const p = readPending();
    if (!p) {
      restored.current = true;
      loadNext();
      return;
    }
    setLead(p.lead);
    setInteractionId(p.interactionId);
    setAnalysis(p.analysis);
    setAnalysisError(p.analysisError);
    setOutcome(p.outcome);
    setNotes(p.notes);
    setDone(p.done);
    setPhase(p.phase);
    setLoading(false);
    restored.current = true;
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .not("phone", "is", null)
      .not("status", "in", "(cliente,perso)")
      .then(({ count }) => setQueueCount(count ?? 0));
  }, [loadNext, supabase]);

  // salvo l'esito in sospeso a ogni modifica, così resta anche cambiando pagina
  useEffect(() => {
    if (!restored.current || !lead) return;
    if (phase === "result" || phase === "analyzing")
      writePending({ phase, lead, interactionId, analysis, analysisError, outcome, notes, done });
  }, [phase, lead, interactionId, analysis, analysisError, outcome, notes, done]);

  // se ero uscito durante l'analisi: controllo nel database quando è pronta
  const analyzingHere = useRef(false);
  useEffect(() => {
    if (phase !== "analyzing" || analyzingHere.current || !interactionId) return;
    let stop = false;
    const started = Date.now();
    const check = async () => {
      const { data } = await supabase
        .from("interactions")
        .select("analysis_status, data")
        .eq("id", interactionId)
        .single();
      if (stop) return;
      const a = (data?.data as { analysis?: Analysis } | null)?.analysis;
      if (data?.analysis_status === "completata" && a) {
        setAnalysis(a);
        setOutcome(a.esito);
        setPhase("result");
      } else if (data?.analysis_status === "errore" || Date.now() - started > 120_000) {
        setAnalysisError("l'analisi non è terminata");
        setPhase("result");
      } else setTimeout(check, 3000);
    };
    check();
    return () => {
      stop = true;
    };
  }, [phase, interactionId, supabase]);

  /** Dalla lista "Richiamate di oggi": porta subito quel lead in primo piano. */
  function pickLead(l: Lead) {
    if (phase !== "ready") return;
    setLead(l);
    setError(null);
    setNotes("");
    setDone({});
  }

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
    analyzingHere.current = true;
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
    analyzingHere.current = false;
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
      if (k === "f") {
        setFocus((f) => !f);
        e.preventDefault();
        return;
      }
      if (k === "escape" && focus) {
        setFocus(false);
        return;
      }
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
        <RecallsToday canPick onPick={pickLead} />
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
      {focus && (
        <button
          onClick={() => setFocus(false)}
          className="glass animate-pop-in fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium text-[#1d1d1f] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.25)] ring-1 ring-black/5 transition hover:bg-white"
        >
          <Minimize2 size={14} /> Esci dal focus <kbd>F</kbd>
        </button>
      )}
      <div data-focus-hide>
        <PageTitle
          sub={
            <>
              {queueCount} lead in coda
              {sessionCount > 0 && <> · {sessionCount} fatti in questa sessione</>}
            </>
          }
          actions={
            <>
              <Stepper index={stepIndex} />
              <button className={`${btnSecondary} hidden px-3.5 py-1.5 text-[13px] md:inline-flex`} onClick={() => setFocus(true)}>
                <Maximize2 size={14} /> Focus <kbd>F</kbd>
              </button>
            </>
          }
        >
          Chiamate
        </PageTitle>
        <RecallsToday currentId={lead.id} canPick={phase === "ready"} onPick={pickLead} />
      </div>

      <div className={`grid gap-6 lg:grid-cols-5 ${focus ? "mx-auto max-w-5xl pt-6" : ""}`}>
        {/* SCHEDA LEAD */}
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden p-0">
            {/* intestazione stile app Contatti */}
            <div className="flex flex-col items-center px-6 pb-5 pt-7 text-center">
              <Avatar name={lead.name} size="xl" />
              <h2 className="mt-3 text-[24px] font-semibold leading-tight tracking-tight text-[#1d1d1f]">{lead.name}</h2>
              <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2 text-[13px] text-slate-500">
                <StatusBadge status={lead.status} />
                <PriorityBadge lead={lead} />
                {(lead.city || lead.province) && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} /> {[lead.city, lead.province].filter(Boolean).join(" · ")}
                  </span>
                )}
              </div>
              <a
                href={telLink(lead.phone!)}
                className="mt-4 text-[28px] font-light tracking-tight text-[#007aff] tabular-nums transition hover:opacity-70"
              >
                {formatPhone(lead.phone)}
              </a>
              {lead.website && (
                <a
                  href={siteUrl(lead.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${btnSecondary} mt-3 px-4 py-1.5 text-[13px]`}
                >
                  <Globe size={14} /> Apri sito <ExternalLink size={12} className="opacity-60" />
                </a>
              )}
            </div>

            {/* DETTAGLI A TENDINA */}
            <div data-focus-hide className="border-t border-black/[0.06]">
              <button
                type="button"
                onClick={() => setDetailsOpen(!detailsOpen)}
                className="flex w-full items-center gap-2 px-6 py-3 text-left text-[15px] transition hover:bg-black/[0.02]"
                aria-expanded={detailsOpen}
              >
                <span className="font-medium text-[#1d1d1f]">Dettagli</span>
                {!detailsOpen && (
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-400">
                    {[lead.contact_person, lead.rating != null ? `★ ${lead.rating}` : null, lead.notes ? "nota" : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
                <ChevronDown
                  size={16}
                  className={`ml-auto shrink-0 text-slate-400 transition-transform duration-300 ${detailsOpen ? "rotate-180" : ""}`}
                />
              </button>
              <Collapse open={detailsOpen}>
                <div className="px-6 pb-5">
                  <dl className="divide-y divide-black/[0.06] overflow-hidden rounded-2xl bg-[#767680]/[0.06] text-[15px]">
                    {lead.contact_person && <Info label="Referente">{lead.contact_person}</Info>}
                    {lead.website && (
                      <Info label="Sito">
                        <a className={link} href={siteUrl(lead.website)} target="_blank" rel="noopener noreferrer">
                          {lead.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 36)}
                        </a>
                      </Info>
                    )}
                    {lead.rating != null && (
                      <Info label="Google">
                        <span className="inline-flex items-center gap-1">
                          <Star size={13} className="fill-[#ff9500] text-[#ff9500]" /> {lead.rating}
                          <span className="text-slate-400">({lead.reviews_count})</span>
                        </span>
                      </Info>
                    )}
                    {lead.next_action_at && <Info label="Richiamata">{formatDateTime(lead.next_action_at)}</Info>}
                    <Info label="Scheda">
                      <Link href={`/crm/${lead.id}`} className={`${link} inline-flex items-center gap-1`} target="_blank">
                        Apri <ExternalLink size={12} />
                      </Link>
                    </Info>
                  </dl>
                  {lead.notes && (
                    <p className="mt-3 rounded-2xl bg-[#ff9500]/[0.1] p-3.5 text-[14px] text-[#8a5000]">{lead.notes}</p>
                  )}
                </div>
              </Collapse>
            </div>

            {/* CONTROLLI CHIAMATA */}
            <div className="border-t border-black/[0.06] p-6">
              {phase === "ready" && (
                <div className="space-y-4">
                  <button className={`${btnGreen} ${btnLg} w-full`} onClick={startCall}>
                    <Phone size={19} fill="currentColor" /> Chiama <kbd className="ml-1">C</kbd>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button className={`${btnSecondary} whitespace-nowrap px-3`} onClick={noAnswer}>
                      <PhoneMissed size={15} /> Non risponde <kbd>N</kbd>
                    </button>
                    <button className={btnSecondary} onClick={skip}>
                      <SkipForward size={15} /> Salta <kbd>S</kbd>
                    </button>
                  </div>
                  <div className="rounded-2xl bg-[#767680]/[0.06] px-4 py-3">
                    <Toggle
                      checked={recordEnabled}
                      onChange={setRecordEnabled}
                      icon={Mic}
                      label="Registra la chiamata"
                      hint={settings?.audio_device_label ?? "Vivavoce sul Mac, niente cuffie"}
                    />
                  </div>
                </div>
              )}

              {phase === "calling" && (
                <div className="space-y-5">
                  <div className="flex flex-col items-center py-2">
                    <div className="relative flex h-40 w-40 items-center justify-center">
                      {isRecording && (
                        <>
                          <span className="animate-ring absolute inset-0 rounded-full border-2 border-[#ff3b30]" />
                          <span className="animate-ring absolute inset-0 rounded-full border-2 border-[#ff3b30] [animation-delay:0.8s]" />
                        </>
                      )}
                      <span
                        className={`relative flex h-36 w-36 items-center justify-center rounded-full bg-white shadow-[0_10px_40px_-10px_rgba(0,0,0,0.25)] ring-[5px] ${
                          isRecording ? "ring-[#ff3b30]" : "ring-[#34c759]"
                        }`}
                      >
                        <span className="text-[38px] font-light tracking-tight tabular-nums text-[#1d1d1f]">
                          {formatDuration(callSeconds)}
                        </span>
                      </span>
                    </div>
                    {isRecording ? (
                      <span className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-[#ff3b30]">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-[#ff3b30]" /> Registrazione in corso
                      </span>
                    ) : (
                      <span className="mt-3 text-[13px] text-slate-400">Non registrata</span>
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
                    <PhoneOff size={19} /> Termina <kbd className="ml-1">T</kbd>
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button className={`${btnSecondary} whitespace-nowrap px-3`} onClick={noAnswer}>
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
                  <span className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#5856d6] to-[#af52de] text-white shadow-lg shadow-purple-500/30">
                    <Sparkles size={24} className="animate-pulse" />
                  </span>
                  <div>
                    <p className="text-[17px] font-semibold text-[#1d1d1f]">Analizzo la chiamata…</p>
                    <p className="text-[13px] text-slate-500">Trascrizione e riassunto con Claude, pochi secondi.</p>
                  </div>
                </div>
              )}

              {phase === "result" && (
                <p className="flex items-center gap-2 text-[15px] text-slate-600">
                  <CheckCircle2 size={18} className="text-[#34c759]" /> Chiamata conclusa: scegli l&apos;esito.
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
              <CardTitle icon={FileText} tone="orange">{callScript?.title ?? "Script"}</CardTitle>
              {callScript ? (
                <ScriptSections text={fillTemplate(callScript.body, lead, settings)} large={focus} />
              ) : (
                <p className="text-[15px] text-slate-500">
                  Nessuno script: crealo nella pagina <Link className={link} href="/script">Script</Link>.
                </p>
              )}
            </Card>
          ) : (
            <Card className="space-y-6">
              <CardTitle icon={ClipboardCheck} tone="indigo" sub="Controlla, conferma le azioni e passa al prossimo lead.">
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
                <div className="space-y-2 rounded-2xl bg-gradient-to-br from-[#5856d6]/[0.07] to-[#af52de]/[0.07] p-4 text-[15px] text-slate-700">
                  <div className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#5856d6]">
                    <Sparkles size={13} /> Riassunto di Claude
                  </div>
                  <p className="text-[#1d1d1f]">{analysis.riassunto}</p>
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
              {analysis && <CallCoaching consigli={analysis.consigli} />}

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
                        className={`relative flex flex-col items-center gap-2 rounded-2xl px-2 py-3.5 text-center text-[13px] font-medium transition-all duration-200 active:scale-95 ${
                          sel ? "bg-white text-[#1d1d1f] shadow-[0_4px_16px_-4px_rgba(0,0,0,0.15)] ring-2 ring-[#007aff]" : "bg-[#767680]/[0.08] text-slate-600 hover:bg-[#767680]/[0.12]"
                        }`}
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
                            sel ? `${st.on} text-white` : "bg-white text-slate-500"
                          }`}
                        >
                          <st.icon size={18} />
                        </span>
                        {o.label.replace(" (no)", "")}
                        <kbd className="absolute right-1.5 top-1.5">{i + 1}</kbd>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* AZIONI PROPOSTE: partono solo dopo conferma */}
              <div>
                <span className={label}>Azioni consigliate</span>
                <div className="overflow-hidden rounded-2xl bg-[#767680]/[0.06] [&>*+*]:border-t [&>*+*]:border-black/[0.06]">
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

              <div className="flex items-center justify-between gap-3 border-t border-black/[0.06] pt-5">
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
  non_risponde: { icon: PhoneMissed, on: "bg-[#8e8e93]" },
  da_richiamare: { icon: Clock, on: "bg-[#ff9500]" },
  interessato: { icon: ThumbsUp, on: "bg-[#34c759]" },
  non_interessato: { icon: ThumbsDown, on: "bg-[#ff3b30]" },
};

function Stepper({ index }: { index: number }) {
  const steps = ["Pronto", "In chiamata", "Esito"];
  return (
    <ol className="flex items-center gap-0.5 rounded-full bg-[#767680]/[0.12] p-0.5 text-[12px] font-medium">
      {steps.map((s, i) => (
        <li
          key={s}
          className={`flex items-center gap-1 rounded-full px-3 py-1 transition-all duration-300 ${
            i === index
              ? "bg-white text-[#1d1d1f] shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
              : i < index
                ? "text-[#34c759]"
                : "text-slate-500"
          }`}
        >
          {i < index && <Check size={12} strokeWidth={3} />}
          {s}
        </li>
      ))}
    </ol>
  );
}

function Info({ label: l, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <dt className="w-24 shrink-0 text-slate-500">{l}</dt>
      <dd className="min-w-0 flex-1 truncate text-right text-[#1d1d1f]">{children}</dd>
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
      className="group flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] text-[#1d1d1f] transition hover:bg-black/[0.03] active:bg-black/[0.05]"
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white transition-colors ${
          done ? "bg-[#34c759]" : "bg-[#007aff]"
        }`}
      >
        {done ? <Check size={15} strokeWidth={3} /> : <Icon size={15} />}
      </span>
      <span className="flex-1">{children}</span>
      <span className={`flex items-center gap-0.5 text-[13px] ${done ? "font-medium text-[#34c759]" : "text-slate-400"}`}>
        {done ? "Fatto" : <ChevronRight size={18} className="text-slate-300" />}
      </span>
    </button>
  );
}
