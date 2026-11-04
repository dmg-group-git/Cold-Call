"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  PhoneCall,
  RefreshCw,
  Trash2,
  Video,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatPhone, romeLocalToIso } from "@/lib/utils";
import { Alert, Card, EmptyState, IconTile, Modal, PageTitle, Segmented, Spinner, Toggle, btnRed, btnSecondary, cardBase, link, type Tone } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Tipi e colori                                                       */
/* ------------------------------------------------------------------ */
type Kind = "videocall" | "richiamata" | "google";
type MiniLead = { id: string; name: string; phone: string | null; city: string | null };
type Appt = {
  id: string;
  kind: Kind;
  start: string; // "YYYY-MM-DDTHH:mm" ora di Roma
  end?: string | null;
  allDay?: boolean;
  title: string;
  lead?: MiniLead | null;
  meetLink?: string | null;
  htmlLink?: string | null;
  googleId?: string | null; // id dell'evento su Google Calendar
};

const KIND: Record<Kind, { label: string; tone: Tone; icon: LucideIcon; chip: string; dot: string }> = {
  videocall: { label: "Videocall", tone: "indigo", icon: Video, chip: "bg-[#5856d6]/[0.12] text-[#3634a3]", dot: "bg-[#5856d6]" },
  richiamata: { label: "Richiamata", tone: "orange", icon: PhoneCall, chip: "bg-[#ff9500]/[0.14] text-[#a35f00]", dot: "bg-[#ff9500]" },
  google: { label: "Google Calendar", tone: "gray", icon: CalendarDays, chip: "bg-black/[0.05] text-slate-600", dot: "bg-[#8e8e93]" },
};
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

/* ------------------------------------------------------------------ */
/* Date (chiavi "YYYY-MM-DD", calcoli in UTC per non sbagliare giorno) */
/* ------------------------------------------------------------------ */
const keyOf = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const todayKey = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
const weekday = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7; // 0 = lunedì
function monthGrid(y: number, m: number): string[] {
  const first = keyOf(y, m, 1);
  const last = keyOf(y, m + 1, 0);
  const days: string[] = [];
  for (let k = addDays(first, -weekday(first)); k <= addDays(last, 6 - weekday(last)); k = addDays(k, 1)) days.push(k);
  return days;
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const monthLabel = (y: number, m: number) =>
  cap(new Date(Date.UTC(y, m, 1)).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }));
function dayLabel(key: string) {
  const t = todayKey();
  if (key === t) return "Oggi";
  if (key === addDays(t, 1)) return "Domani";
  return cap(new Date(`${key}T00:00:00Z`).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }));
}
const isoToRomeLocal = (iso: string) =>
  new Date(iso).toLocaleString("sv-SE", { timeZone: "Europe/Rome" }).replace(" ", "T").slice(0, 16);
const time = (local: string) => local.slice(11, 16);

function readPref<T extends string>(k: string, fallback: T): T {
  try {
    return (localStorage.getItem(k) as T) || fallback;
  } catch {
    return fallback;
  }
}
function writePref(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Pagina                                                              */
/* ------------------------------------------------------------------ */
export default function CalendarioPage() {
  const supabase = useMemo(() => createClient(), []);
  const today = todayKey();
  const [view, setView] = useState<"mese" | "agenda">("mese");
  const [cursor, setCursor] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
  const [selected, setSelected] = useState(today);
  const [showGoogle, setShowGoogle] = useState(true);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [googleNote, setGoogleNote] = useState<string | null>(null);
  const reqId = useRef(0);
  const [toDelete, setToDelete] = useState<Appt | null>(null);

  useEffect(() => {
    setView(readPref("cal-view", "mese"));
    setShowGoogle(readPref("cal-google", "1") === "1");
  }, []);

  const grid = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const [rangeStart, rangeEnd] = useMemo<[string, string]>(
    () => (view === "mese" ? [grid[0], addDays(grid[grid.length - 1], 1)] : [today, addDays(today, 31)]),
    [view, grid, today],
  );

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    const startIso = romeLocalToIso(`${rangeStart}T00:00`);
    const endIso = romeLocalToIso(`${rangeEnd}T00:00`);

    const [ev, rec, g] = await Promise.all([
      // appuntamenti fissati dal sito (salvati nella scheda del lead)
      supabase
        .from("interactions")
        .select("id, data, leads(id, name, phone, city)")
        .eq("type", "event")
        .gte("data->>start", `${rangeStart}T00:00`)
        .lt("data->>start", `${rangeEnd}T00:00`),
      // richiamate in programma
      supabase
        .from("leads")
        .select("id, name, phone, city, next_action_at")
        .gte("next_action_at", startIso)
        .lt("next_action_at", endIso)
        .not("status", "in", "(cliente,perso)"),
      // altri impegni del calendario Google
      showGoogle
        ? fetch(`/api/google/events?${new URLSearchParams({ timeMin: startIso, timeMax: endIso })}`, {
            signal: AbortSignal.timeout(15000),
          })
            .then(async (r) => ({ status: r.status, json: await r.json().catch(() => ({})) }))
            .catch(() => ({ status: 0, json: {} as Record<string, unknown> }))
        : Promise.resolve(null),
    ]).catch(() => [{ data: [] }, { data: [] }, null] as const);
    if (id !== reqId.current) return;

    const list: Appt[] = [];
    const ourEventIds = new Set<string>();
    type EvRow = { id: string; data: Record<string, string | null>; leads: MiniLead | MiniLead[] | null };
    for (const row of (ev.data ?? []) as unknown as EvRow[]) {
      const d = row.data ?? {};
      if (d.eventId) ourEventIds.add(d.eventId);
      if (d.kind !== "videocall" || !d.start) continue; // le richiamate arrivano dai lead (sempre aggiornate)
      const lead = Array.isArray(row.leads) ? row.leads[0] : row.leads;
      list.push({
        id: row.id,
        kind: "videocall",
        start: d.start,
        end: d.end,
        title: lead?.name ?? "Videocall",
        lead: lead ?? null,
        meetLink: d.meetLink,
        htmlLink: d.htmlLink,
        googleId: d.eventId,
      });
    }
    for (const l of (rec.data ?? []) as (MiniLead & { next_action_at: string })[]) {
      list.push({ id: `r-${l.id}`, kind: "richiamata", start: isoToRomeLocal(l.next_action_at), title: l.name, lead: l });
    }
    let note: string | null = null;
    if (g) {
      if (g.status === 200) {
        type GEv = { id: string; title: string; start: string; end: string | null; allDay: boolean; htmlLink: string | null; meetLink: string | null };
        for (const e of ((g.json as { events?: GEv[] }).events ?? []) as GEv[]) {
          if (ourEventIds.has(e.id)) continue; // già mostrato come videocall/richiamata
          list.push({ ...e, id: `g-${e.id}`, kind: "google", googleId: e.id });
        }
      } else if (g.status === 409) {
        note = "collega";
      } else {
        note = (g.json as { error?: string }).error || "Non riesco a leggere Google Calendar";
      }
    }
    list.sort((a, b) => (a.allDay === b.allDay ? a.start.localeCompare(b.start) : a.allDay ? -1 : 1));
    setAppts(list);
    setGoogleNote(note);
    setLoading(false);
  }, [supabase, rangeStart, rangeEnd, showGoogle]);

  useEffect(() => {
    load();
  }, [load]);
  // si aggiorna da solo quando torni sulla scheda del browser
  useEffect(() => {
    const f = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [load]);

  const byDay = useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of appts) {
      const k = a.start.slice(0, 10);
      m.set(k, [...(m.get(k) ?? []), a]);
    }
    return m;
  }, [appts]);

  const counts = useMemo(() => {
    const inView = view === "mese" ? appts.filter((a) => Number(a.start.slice(5, 7)) - 1 === cursor.m) : appts;
    return (["videocall", "richiamata", "google"] as Kind[]).map((k) => [k, inView.filter((a) => a.kind === k).length] as const);
  }, [appts, view, cursor]);

  function moveMonth(delta: number) {
    const d = new Date(Date.UTC(cursor.y, cursor.m + delta, 1));
    const next = { y: d.getUTCFullYear(), m: d.getUTCMonth() };
    setCursor(next);
    setSelected(today.slice(0, 7) === keyOf(next.y, next.m, 1).slice(0, 7) ? today : keyOf(next.y, next.m, 1));
  }
  function goToday() {
    setCursor({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
    setSelected(today);
  }

  const onDelete = setToDelete;

  const summary = counts
    .filter(([k, n]) => n > 0 || k !== "google")
    .map(([k, n]) => `${n} ${k === "videocall" ? "videocall" : k === "richiamata" ? (n === 1 ? "richiamata" : "richiamate") : n === 1 ? "impegno Google" : "impegni Google"}`)
    .join(" · ");

  return (
    <>
      <PageTitle
        sub={`${view === "mese" ? "Questo mese" : "Prossimi 30 giorni"}: ${summary}`}
        actions={
          <Segmented
            value={view}
            onChange={(v) => {
              setView(v);
              writePref("cal-view", v);
            }}
            options={[
              { value: "mese", label: "Mese" },
              { value: "agenda", label: "Agenda" },
            ]}
          />
        }
      >
        Calendario
      </PageTitle>

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        {(Object.keys(KIND) as Kind[]).map((k) => (
          <span key={k} className="flex items-center gap-1.5 text-[13px] text-slate-600">
            <span className={`h-2.5 w-2.5 rounded-full ${KIND[k].dot}`} /> {KIND[k].label}
          </span>
        ))}
        <div className="ml-auto flex items-center gap-3">
          {loading && <Spinner className="text-slate-400" />}
          <Toggle
            checked={showGoogle}
            onChange={(v) => {
              setShowGoogle(v);
              writePref("cal-google", v ? "1" : "0");
            }}
            label={<span className="text-[13px] text-slate-600">Altri impegni Google</span>}
          />
        </div>
      </div>
      {showGoogle && googleNote && (
        <p className="mb-5 rounded-2xl bg-black/[0.04] px-4 py-3 text-[13px] text-slate-600">
          {googleNote === "collega" ? (
            <>
              Per vedere anche gli altri impegni del tuo Google Calendar,{" "}
              <Link href="/impostazioni" className={link}>collega Google in Impostazioni</Link>.
            </>
          ) : (
            googleNote
          )}
        </p>
      )}

      {view === "mese" ? (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* GRIGLIA DEL MESE */}
          <div className={`${cardBase} overflow-hidden`}>
            <div className="flex items-center justify-between gap-3 px-5 py-4">
              <h2 className="text-[22px] font-bold tracking-tight text-[#1d1d1f]">{monthLabel(cursor.y, cursor.m)}</h2>
              <div className="flex items-center gap-1">
                <button aria-label="Mese precedente" className={`${btnSecondary} !px-2.5`} onClick={() => moveMonth(-1)}>
                  <ChevronLeft size={18} />
                </button>
                <button className={btnSecondary} onClick={goToday}>Oggi</button>
                <button aria-label="Mese successivo" className={`${btnSecondary} !px-2.5`} onClick={() => moveMonth(1)}>
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 border-t border-black/[0.06]">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className={`py-2 text-center text-[11px] font-semibold uppercase tracking-wide ${i > 4 ? "text-slate-400" : "text-slate-500"}`}>
                  {w}
                </div>
              ))}
              {grid.map((key) => {
                const items = byDay.get(key) ?? [];
                const inMonth = Number(key.slice(5, 7)) - 1 === cursor.m;
                const isToday = key === today;
                const isSel = key === selected;
                return (
                  <button
                    key={key}
                    onClick={() => setSelected(key)}
                    className={`flex min-h-[56px] flex-col border-t border-black/[0.06] p-1 text-left transition-colors md:min-h-[108px] md:p-1.5 [&:not(:nth-child(7n))]:border-r ${
                      isSel ? "bg-[#007aff]/[0.06]" : inMonth ? "hover:bg-black/[0.02]" : "bg-black/[0.02]"
                    }`}
                  >
                    <span
                      className={`mx-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[14px] tabular-nums md:mr-0 md:ml-auto ${
                        isToday
                          ? "bg-[#ff3b30] font-semibold text-white"
                          : isSel
                            ? "bg-[#1d1d1f] font-semibold text-white"
                            : inMonth
                              ? "text-[#1d1d1f]"
                              : "text-slate-300"
                      }`}
                    >
                      {Number(key.slice(8))}
                    </span>
                    {/* Mac: etichette colorate */}
                    <span className="mt-1 hidden min-w-0 flex-col gap-0.5 md:flex">
                      {items.slice(0, 3).map((a) => (
                        <span key={a.id} className={`truncate rounded-[6px] px-1.5 py-[3px] text-[11.5px] font-medium leading-tight ${KIND[a.kind].chip}`}>
                          {!a.allDay && <span className="tabular-nums opacity-70">{time(a.start)} </span>}
                          {a.title}
                        </span>
                      ))}
                      {items.length > 3 && <span className="px-1.5 text-[11px] font-medium text-slate-500">+{items.length - 3} altri</span>}
                    </span>
                    {/* iPhone: pallini */}
                    {items.length > 0 && (
                      <span className="mt-1 flex justify-center gap-[3px] md:hidden">
                        {items.slice(0, 3).map((a) => (
                          <span key={a.id} className={`h-[5px] w-[5px] rounded-full ${KIND[a.kind].dot}`} />
                        ))}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* GIORNO SELEZIONATO */}
          <Card className="lg:sticky lg:top-6">
            <h2 className="text-[17px] font-semibold text-[#1d1d1f]">{dayLabel(selected)}</h2>
            <p className="mb-2 text-[13px] text-slate-500">
              {(byDay.get(selected) ?? []).length === 0
                ? "Nessun appuntamento"
                : `${(byDay.get(selected) ?? []).length} ${(byDay.get(selected) ?? []).length === 1 ? "appuntamento" : "appuntamenti"}`}
            </p>
            <div className="divide-y divide-black/[0.06]">
              {(byDay.get(selected) ?? []).map((a) => (
                <ApptRow key={a.id} a={a} onDelete={onDelete} />
              ))}
            </div>
          </Card>
        </div>
      ) : (
        <Agenda byDay={byDay} today={today} loading={loading} onReload={load} onDelete={onDelete} />
      )}

      <DeleteDialog
        appt={toDelete}
        onClose={() => setToDelete(null)}
        onDone={(a) => {
          setAppts((list) => list.filter((x) => x.id !== a.id));
          setToDelete(null);
          load();
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Agenda: elenco dei prossimi 30 giorni                               */
/* ------------------------------------------------------------------ */
function Agenda({
  byDay,
  today,
  loading,
  onReload,
  onDelete,
}: {
  byDay: Map<string, Appt[]>;
  today: string;
  loading: boolean;
  onReload: () => void;
  onDelete: (a: Appt) => void;
}) {
  const days = [...byDay.keys()].filter((k) => k >= today).sort();
  if (!days.length && !loading)
    return (
      <Card>
        <EmptyState
          icon={CalendarX2}
          title="Nessun appuntamento"
          action={
            <button className={btnSecondary} onClick={onReload}>
              <RefreshCw size={15} /> Aggiorna
            </button>
          }
        >
          Nei prossimi 30 giorni non ci sono videocall o richiamate.
        </EmptyState>
      </Card>
    );
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {days.map((k) => (
        <section key={k}>
          <h3 className={`mb-2 px-4 text-[13px] font-semibold uppercase tracking-wide ${k === today ? "text-[#ff3b30]" : "text-slate-500"}`}>
            {dayLabel(k)}
          </h3>
          <div className={`${cardBase} divide-y divide-black/[0.06] px-5`}>
            {byDay.get(k)!.map((a) => (
              <ApptRow key={a.id} a={a} onDelete={onDelete} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Riga appuntamento                                                   */
/* ------------------------------------------------------------------ */
function ApptRow({ a, onDelete }: { a: Appt; onDelete: (a: Appt) => void }) {
  const k = KIND[a.kind];
  return (
    <div className="flex items-start gap-3 py-3.5">
      <div className="w-12 shrink-0 pt-1 text-right text-[13px] font-semibold leading-tight tabular-nums text-[#1d1d1f]">
        {a.allDay ? <span className="text-[11px] font-medium text-slate-500">Tutto il giorno</span> : time(a.start)}
        {a.end && !a.allDay && <div className="font-normal text-slate-400">{time(a.end)}</div>}
      </div>
      <IconTile icon={k.icon} tone={k.tone} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-[#1d1d1f]">{a.title}</div>
        <div className="text-[13px] text-slate-500">
          {k.label}
          {a.lead?.city ? ` · ${a.lead.city}` : ""}
          {a.lead?.phone ? ` · ${formatPhone(a.lead.phone)}` : ""}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            {a.lead && (
              <Link href={`/crm/${a.lead.id}`} className={link}>
                Apri scheda
              </Link>
            )}
            {a.meetLink && (
              <a href={a.meetLink} target="_blank" rel="noreferrer" className={link}>
                Entra in Meet
              </a>
            )}
            {a.htmlLink && (
              <a href={a.htmlLink} target="_blank" rel="noreferrer" className={link}>
                Apri in Google
              </a>
            )}
            <button onClick={() => onDelete(a)} className="inline-flex items-center gap-1 font-medium text-[#ff3b30] hover:underline">
              <Trash2 size={13} /> Elimina
            </button>
          </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Conferma eliminazione                                               */
/* ------------------------------------------------------------------ */
function DeleteDialog({ appt, onClose, onDone }: { appt: Appt | null; onClose: () => void; onDone: (a: Appt) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    setBusy(false);
  }, [appt]);
  if (!appt) return null;
  const what = appt.kind === "videocall" ? "la videocall" : appt.kind === "richiamata" ? "la richiamata" : "l'impegno";
  const when = `${dayLabel(appt.start.slice(0, 10)).toLowerCase()}${appt.allDay ? "" : ` alle ${time(appt.start)}`}`;

  async function confirm() {
    if (!appt) return;
    setBusy(true);
    setErr(null);
    const body =
      appt.kind === "videocall"
        ? { kind: "videocall", interactionId: appt.id }
        : appt.kind === "richiamata"
          ? { kind: "richiamata", leadId: appt.lead?.id, start: appt.start }
          : { kind: "google", eventId: appt.googleId };
    try {
      const r = await fetch("/api/google/event", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 409 ? "Google non è collegato: collegalo in Impostazioni." : j.error || "Errore");
      onDone(appt);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Errore");
      setBusy(false);
    }
  }

  return (
    <Modal open icon={Trash2} onClose={onClose} title={`Eliminare ${what}?`}>
      <div className="space-y-4">
        <p className="text-[15px] text-slate-600">
          <b className="text-[#1d1d1f]">{appt.title}</b>, {when}.
          <br />
          {appt.kind === "richiamata"
            ? "La richiamata viene tolta dal lead e, se c'è, anche da Google Calendar."
            : "L'evento viene cancellato anche da Google Calendar."}
          {appt.kind === "videocall" && " Se avevi invitato il cliente, Google lo avvisa dell'annullamento."}
        </p>
        {err && <Alert tone="error">{err}</Alert>}
        <div className="flex justify-end gap-2">
          <button className={btnSecondary} onClick={onClose} disabled={busy}>
            Annulla
          </button>
          <button className={btnRed} onClick={confirm} disabled={busy}>
            {busy ? <Spinner /> : <Trash2 size={15} />} Elimina
          </button>
        </div>
      </div>
    </Modal>
  );
}
