"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Merge, MessageSquareQuote, Pencil, Plus, RefreshCw, Search, Sparkles, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Objection } from "@/lib/types";
import { Alert, Collapse, CollapsibleCard, Spinner, btnGhost, btnPrimary, btnRed, btnSecondary, input, usePersistentOpen } from "./ui";

const CHANGED = "objections:changed";
const NEW_DAYS = 7;

let running: Promise<{ added: number; merged: number }> | null = null;

/**
 * Aggiunge all'elenco le obiezioni delle chiamate non ancora lette (anche a più riprese).
 * Si può chiamare senza aspettare: un solo aggiornamento alla volta.
 */
export function syncObjections() {
  if (running) return running;
  running = (async () => {
    let added = 0;
    let merged = 0;
    try {
      for (let i = 0; i < 20; i++) {
        const res = await fetch("/api/objections/sync", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Errore");
        added += json.added;
        merged += json.merged;
        if (!json.remaining || !json.processed) break;
      }
      return { added, merged };
    } finally {
      running = null;
      window.dispatchEvent(new Event(CHANGED));
    }
  })();
  return running;
}

const times = (o: Objection) => o.interaction_ids.length;
const isNew = (o: Objection) => times(o) > 0 && Date.now() - new Date(o.created_at).getTime() < NEW_DAYS * 864e5;

function sortObjections(list: Objection[]) {
  return [...list].sort(
    (a, b) =>
      times(b) - times(a) ||
      (b.last_seen_at ?? b.created_at).localeCompare(a.last_seen_at ?? a.created_at) ||
      a.text.localeCompare(b.text),
  );
}

export function ObjectionsCard({ large }: { large?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = usePersistentOpen("obiezioni", false);
  const [items, setItems] = useState<Objection[] | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("objections").select("*");
    if (error) {
      setError(
        /objections/.test(error.message) && /does not exist|schema cache/.test(error.message)
          ? "Manca la tabella delle obiezioni nel database."
          : error.message,
      );
      setItems([]);
      return;
    }
    setItems(sortObjections(data as Objection[]));
  }, [supabase]);

  useEffect(() => {
    load();
    window.addEventListener(CHANGED, load);
    return () => window.removeEventListener(CHANGED, load);
  }, [load]);

  async function runSync() {
    setSyncing(true);
    setError(null);
    setNotice(null);
    try {
      const r = await syncObjections();
      setNotice(
        r.added || r.merged
          ? `Fatto: ${r.added} nuove, ${r.merged} aggiornate.`
          : "Nessuna nuova obiezione nelle chiamate.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
    setSyncing(false);
  }

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((o) => [o.text, o.answer, ...o.aliases].some((t) => t.toLowerCase().includes(q)));
  }, [items, query]);

  const top = items?.[0];
  const summary = items
    ? items.length
      ? `${items.length} obiezioni${top && times(top) ? ` · più frequente: ${top.text}` : ""}`
      : "Nessuna obiezione ancora"
    : "Carico…";

  return (
    <CollapsibleCard
      title="Obiezioni"
      icon={MessageSquareQuote}
      tone="purple"
      sub="Le più frequenti in alto. Si aggiorna da sola dopo ogni chiamata."
      summary={summary}
      open={open}
      onToggle={setOpen}
      right={
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-[#007aff] transition hover:bg-black/[0.08]"
          aria-label="Aggiungi obiezione"
          title="Aggiungi obiezione"
          onClick={() => {
            setOpen(true);
            setEditing("new");
          }}
        >
          <Plus size={16} strokeWidth={2.5} />
        </button>
      }
    >
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      {notice && <Alert tone="success" className="mb-3">{notice}</Alert>}

      {editing === "new" && (
        <ObjectionForm
          onCancel={() => setEditing(null)}
          onSave={async (text, answer) => {
            const { error } = await supabase
              .from("objections")
              .insert({ text, answer, answer_manual: !!answer.trim() });
            if (error) throw new Error(error.message);
            setEditing(null);
            await load();
          }}
        />
      )}

      {items === null ? (
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      ) : items.length === 0 ? (
        editing !== "new" && (
          <div className="py-4 text-center">
            <p className="text-[15px] text-slate-500">
              Le obiezioni arriveranno da sole dopo ogni chiamata analizzata.
            </p>
            <button className={`${btnPrimary} mt-4`} onClick={runSync} disabled={syncing}>
              {syncing ? <Spinner className="text-white" /> : <Sparkles size={16} />}
              Importa dalle chiamate passate
            </button>
          </div>
        )
      ) : (
        <>
          {items.length > 4 && (
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className={`${input} pl-9`}
                placeholder="Cerca obiezione…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}

          <div className="overflow-hidden rounded-2xl bg-[#767680]/[0.06]">
            {filtered.map((o, i) => {
              const isOpen = expanded === o.id || !!query.trim();
              return (
                <div key={o.id} className={i > 0 ? "border-t border-black/[0.06]" : ""}>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.02]"
                  >
                    <span
                      className={`flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[12px] font-semibold tabular-nums ${
                        times(o) ? "bg-[#af52de]/[0.12] text-[#8e3bb5]" : "bg-black/[0.06] text-slate-400"
                      }`}
                      title={`Sentita in ${times(o)} chiamate`}
                    >
                      ×{times(o)}
                    </span>
                    <span className={`flex-1 font-semibold text-[#1d1d1f] ${large ? "text-[18px]" : "text-[15px]"}`}>
                      {o.text}
                    </span>
                    {isNew(o) && (
                      <span className="shrink-0 rounded-full bg-[#34c759]/[0.15] px-2 py-0.5 text-[11px] font-semibold text-[#248a3d]">
                        Nuova
                      </span>
                    )}
                    <ChevronDown
                      size={16}
                      className={`shrink-0 text-slate-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <Collapse open={isOpen}>
                    <div className="px-4 pb-4 pl-[52px]">
                      {editing === o.id ? (
                        <ObjectionForm
                          initial={o}
                          onCancel={() => setEditing(null)}
                          onSave={async (text, answer) => {
                            const { error } = await supabase
                              .from("objections")
                              .update({
                                text,
                                answer,
                                answer_manual: o.answer_manual || answer !== o.answer,
                                updated_at: new Date().toISOString(),
                              })
                              .eq("id", o.id);
                            if (error) throw new Error(error.message);
                            setEditing(null);
                            await load();
                          }}
                        />
                      ) : (
                        <ObjectionDetail
                          o={o}
                          others={(items ?? []).filter((x) => x.id !== o.id)}
                          large={large}
                          onEdit={() => setEditing(o.id)}
                          onChanged={load}
                          onError={setError}
                        />
                      )}
                    </div>
                  </Collapse>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-4 py-6 text-center text-[15px] text-slate-500">Nessuna obiezione trovata.</p>
            )}
          </div>

          <div className="mt-3 flex justify-end">
            <button className={`${btnGhost} px-3 py-1.5 text-[13px]`} onClick={runSync} disabled={syncing}>
              {syncing ? <Spinner /> : <RefreshCw size={14} />}
              Aggiorna dalle chiamate
            </button>
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}

function ObjectionDetail({
  o,
  others,
  large,
  onEdit,
  onChanged,
  onError,
}: {
  o: Objection;
  others: Objection[];
  large?: boolean;
  onEdit: () => void;
  onChanged: () => Promise<void>;
  onError: (m: string) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [mode, setMode] = useState<"view" | "merge" | "delete">("view");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("objections").delete().eq("id", o.id);
    setBusy(false);
    if (error) return onError(error.message);
    await onChanged();
  }

  /** Unisce questa obiezione in quella scelta: somma le chiamate e tiene il testo dell'altra. */
  async function merge() {
    const t = others.find((x) => x.id === target);
    if (!t) return;
    setBusy(true);
    const seen = new Set([t.text.toLowerCase()]);
    const aliases = [...t.aliases, o.text, ...o.aliases].filter((a) => {
      const k = a.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const last = [t.last_seen_at, o.last_seen_at].filter(Boolean).sort().at(-1) ?? null;
    const { error } = await supabase
      .from("objections")
      .update({
        interaction_ids: [...new Set([...t.interaction_ids, ...o.interaction_ids])],
        aliases: aliases.slice(-20),
        last_seen_at: last,
        ...(t.answer.trim() ? {} : { answer: o.answer, answer_manual: o.answer_manual }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", t.id);
    if (error) {
      setBusy(false);
      return onError(error.message);
    }
    await remove();
  }

  const small = "px-3 py-1.5 text-[13px]";

  return (
    <div>
      {o.answer.trim() ? (
        <p className={`whitespace-pre-wrap text-[#1d1d1f] ${large ? "text-[20px] leading-9" : "text-[16px] leading-7"}`}>
          {o.answer}
        </p>
      ) : (
        <p className="text-[15px] text-slate-500">Nessuna risposta ancora: scrivila con Modifica.</p>
      )}
      {o.aliases.length > 0 && (
        <p className="mt-2 text-[13px] text-slate-500">
          Detta anche: {o.aliases.slice(-3).map((a) => `“${a}”`).join(", ")}
        </p>
      )}

      {mode === "view" && (
        <div className="mt-3 flex flex-wrap gap-1">
          <button className={`${btnGhost} ${small}`} onClick={onEdit}>
            <Pencil size={14} /> Modifica
          </button>
          {others.length > 0 && (
            <button className={`${btnGhost} ${small}`} onClick={() => setMode("merge")}>
              <Merge size={14} /> Unisci a…
            </button>
          )}
          <button className={`${btnGhost} ${small} text-[#ff3b30] hover:bg-[#ff3b30]/[0.08]`} onClick={() => setMode("delete")}>
            <Trash2 size={14} /> Elimina
          </button>
        </div>
      )}

      {mode === "merge" && (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] text-slate-500">Uniscila a un&apos;obiezione con lo stesso senso: i conteggi si sommano.</p>
          <select className={input} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Scegli l&apos;obiezione…</option>
            {others.map((x) => (
              <option key={x.id} value={x.id}>
                {x.text} (×{times(x)})
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button className={`${btnPrimary} ${small}`} disabled={!target || busy} onClick={merge}>
              {busy && <Spinner className="text-white" />} Unisci
            </button>
            <button className={`${btnSecondary} ${small}`} onClick={() => setMode("view")}>
              Annulla
            </button>
          </div>
        </div>
      )}

      {mode === "delete" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-slate-600">Eliminare questa obiezione?</span>
          <button className={`${btnRed} ${small}`} disabled={busy} onClick={remove}>
            {busy && <Spinner className="text-white" />} Elimina
          </button>
          <button className={`${btnSecondary} ${small}`} onClick={() => setMode("view")}>
            Annulla
          </button>
        </div>
      )}
    </div>
  );
}

function ObjectionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Objection;
  onSave: (text: string, answer: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? "");
  const [answer, setAnswer] = useState(initial?.answer ?? "");
  const [busy, setBusy] = useState<"save" | "ai" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const small = "px-3 py-1.5 text-[13px]";

  async function suggest() {
    setBusy("ai");
    setError(null);
    try {
      const res = await fetch("/api/objections/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Errore");
      setAnswer(json.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
    setBusy(null);
  }

  async function save() {
    setBusy("save");
    setError(null);
    try {
      await onSave(text.trim(), answer.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
      setBusy(null);
    }
  }

  return (
    <div className={`space-y-2 ${initial ? "" : "mb-4 rounded-2xl bg-[#767680]/[0.06] p-4"}`}>
      <input
        className={input}
        placeholder="Obiezione (es. Non ho tempo adesso)"
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
      />
      <textarea
        className={`${input} min-h-[110px]`}
        placeholder="Risposta consigliata"
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
      />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button className={`${btnPrimary} ${small}`} disabled={!text.trim() || !!busy} onClick={save}>
          {busy === "save" && <Spinner className="text-white" />} Salva
        </button>
        <button className={`${btnSecondary} ${small}`} disabled={!text.trim() || !!busy} onClick={suggest}>
          {busy === "ai" ? <Spinner /> : <Sparkles size={14} />} Scrivi risposta con Claude
        </button>
        <button className={`${btnGhost} ${small}`} onClick={onCancel}>
          Annulla
        </button>
      </div>
    </div>
  );
}
