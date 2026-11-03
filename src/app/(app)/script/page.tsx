"use client";
import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle, MessageCircleOff, Paperclip, Phone, Upload, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Script } from "@/lib/types";
import { fillTemplate, materialsText, withMaterials } from "@/lib/utils";
import { MAX_FILE_MB, uploadMaterialFile } from "@/lib/materials";
import { useAppData } from "@/components/useAppData";
import { Alert, Card, Loading, PageTitle, Spinner, btnPrimary, btnSecondary, input, label } from "@/components/ui";

const KIND_LABEL: Record<Script["kind"], string> = {
  call: "Script chiamata",
  wa_no_answer: "WhatsApp: non risponde",
  wa_answered: "WhatsApp: ha risposto",
};
const ORDER: Script["kind"][] = ["call", "wa_no_answer", "wa_answered"];
const KIND_ICON: Record<Script["kind"], LucideIcon> = {
  call: Phone,
  wa_no_answer: MessageCircleOff,
  wa_answered: MessageCircle,
};
const VARS = ["{nome}", "{struttura}", "{città}", "{mio_nome}", "{azienda}", "{sito}", "{riferimenti}", "{materiali}"];

const EXAMPLE_LEAD = { name: "B&B Il Gelso", contact_person: "Maria", city: "Vieste" };

export default function ScriptPage() {
  const { scripts, materials, settings, loading, reload } = useAppData();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attach, setAttach] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Script["kind"]>("call");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(scripts.map((s) => [s.kind, s.body])));
    setAttach(Object.fromEntries(scripts.map((s) => [s.kind, s.material_ids ?? []])));
  }, [scripts]);

  async function save(kind: Script["kind"], ids = attach[kind] ?? []) {
    setError(null);
    const supabase = createClient();
    const existing = scripts.find((s) => s.kind === kind);
    const fields = { body: drafts[kind] ?? "", material_ids: kind === "call" ? [] : ids };
    const { error: err } = existing
      ? await supabase.from("scripts").update({ ...fields, updated_at: new Date().toISOString() }).eq("id", existing.id)
      : await supabase.from("scripts").insert({ kind, title: KIND_LABEL[kind], ...fields });
    if (err) return setError(err.message);
    setSaved(kind);
    setTimeout(() => setSaved(null), 2000);
    reload();
  }

  async function upload(kind: Script["kind"], file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(kind);
    try {
      const m = await uploadMaterialFile(createClient(), file);
      const ids = [...(attach[kind] ?? []), m.id];
      setAttach({ ...attach, [kind]: ids });
      await save(kind, ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(null);
    }
  }

  function preview(kind: Script["kind"]) {
    const mats = materials.filter((m) => (attach[kind] ?? []).includes(m.id));
    return withMaterials(fillTemplate(drafts[kind] ?? "", EXAMPLE_LEAD, settings, { materiali: materialsText(mats) }), drafts[kind] ?? "", mats);
  }

  function insertVar(v: string) {
    const ta = taRef.current;
    const cur = drafts[tab] ?? "";
    const pos = ta ? ta.selectionStart : cur.length;
    const end = ta ? ta.selectionEnd : cur.length;
    const next = cur.slice(0, pos) + v + cur.slice(end);
    setDrafts({ ...drafts, [tab]: next });
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(pos + v.length, pos + v.length);
    });
  }

  if (loading) return <Loading />;

  const kind = tab;
  const vars = VARS.filter((v) => kind !== "call" || v !== "{materiali}");
  const dirty = (drafts[kind] ?? "") !== (scripts.find((s) => s.kind === kind)?.body ?? "");

  return (
    <>
      <PageTitle sub="Testi che usi in chiamata e su WhatsApp. I nomi tra graffe vengono sostituiti in automatico.">
        Script
      </PageTitle>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}

      <div className="mb-4 inline-flex flex-wrap gap-1 rounded-xl bg-slate-200/60 p-1">
        {ORDER.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                tab === k ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Icon size={15} /> {KIND_LABEL[k]}
            </button>
          );
        })}
      </div>

      <Card>
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <span className={label}>Testo</span>
            <textarea
              ref={taRef}
              className={`${input} h-80 font-mono text-[13px] leading-relaxed`}
              value={drafts[kind] ?? ""}
              onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })}
            />
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Inserisci:</span>
              {vars.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVar(v)}
                  className="rounded-md bg-brand-50 px-2 py-0.5 font-mono text-xs text-brand-700 transition hover:bg-brand-100"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <span className={label}>
              Anteprima <span className="font-normal text-slate-400">(con dati di esempio)</span>
            </span>
            <div
              className={`h-80 overflow-y-auto whitespace-pre-wrap rounded-xl p-4 text-sm leading-relaxed ${
                kind === "call" ? "bg-slate-50 text-slate-800" : "bg-[#e7f7e3] text-slate-800"
              }`}
            >
              {kind === "call" ? (
                preview(kind)
              ) : (
                <div className="ml-auto max-w-[90%] rounded-xl rounded-tr-sm bg-white p-3 shadow-sm">{preview(kind)}</div>
              )}
            </div>
          </div>
        </div>

        {kind !== "call" && (
          <div className="mt-5 rounded-xl border border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900">
              <Paperclip size={15} className="text-slate-400" /> Allegati (documenti, video, link)
            </div>
            {materials.length ? (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {materials.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={(attach[kind] ?? []).includes(m.id)}
                      onChange={(e) =>
                        setAttach({
                          ...attach,
                          [kind]: e.target.checked
                            ? [...(attach[kind] ?? []), m.id]
                            : (attach[kind] ?? []).filter((x) => x !== m.id),
                        })
                      }
                    />
                    {m.title} <span className="text-xs text-slate-400">({m.kind})</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Nessun materiale ancora.</p>
            )}
            <label className={`${btnSecondary} mt-4 cursor-pointer`}>
              {uploading === kind ? <Spinner /> : <Upload size={15} />}
              {uploading === kind ? "Carico il file…" : "Carica documento o video"}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,video/*,application/pdf"
                disabled={uploading !== null}
                onChange={(e) => {
                  upload(kind, e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              WhatsApp dal sito può mandare solo testo: gli allegati partono come link nel messaggio (al posto di{" "}
              <code>{"{materiali}"}</code>, oppure in fondo). Max {MAX_FILE_MB} MB per file; per video lunghi usa un link
              YouTube o Vimeo dalla pagina Materiali.
            </p>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
          <span className="text-xs text-slate-500">
            {dirty ? "Modifiche non salvate" : "I dati azienda ({azienda}, {sito}…) si cambiano in Impostazioni."}
          </span>
          <button className={btnPrimary} onClick={() => save(kind)}>
            {saved === kind ? <Check size={16} /> : null}
            {saved === kind ? "Salvato" : "Salva"}
          </button>
        </div>
      </Card>
    </>
  );
}
