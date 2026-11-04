"use client";
import { useEffect, useRef, useState } from "react";
import { Check, MessageCircle, MessageCircleOff, Paperclip, Phone, Upload, type LucideIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Script } from "@/lib/types";
import { appointmentVars, fillTemplate, materialsText, withMaterials } from "@/lib/utils";
import { MAX_FILE_MB, uploadMaterialFile } from "@/lib/materials";
import { useAppData } from "@/components/useAppData";
import { WaPreview } from "@/components/WaPreview";
import { ScriptSections } from "@/components/ScriptSections";
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
const VARS = ["{nome}", "{struttura}", "{città}", "{mio_nome}", "{azienda}", "{sito}", "{riferimenti}", "{materiali}", "{giorno}", "{ora}", "{link_videocall}"];

const EXAMPLE_LEAD = { name: "B&B Il Gelso", contact_person: "Maria", city: "Vieste" };
const EXAMPLE_APPOINTMENT = appointmentVars("2026-11-06T10:30", "https://meet.google.com/abc-defg-hij");

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
    return withMaterials(fillTemplate(drafts[kind] ?? "", EXAMPLE_LEAD, settings, { materiali: materialsText(mats), ...EXAMPLE_APPOINTMENT }), drafts[kind] ?? "", mats);
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
  const vars = VARS.filter((v) => kind !== "call" || !["{materiali}", "{giorno}", "{ora}", "{link_videocall}"].includes(v));
  const dirty = (drafts[kind] ?? "") !== (scripts.find((s) => s.kind === kind)?.body ?? "");

  return (
    <>
      <PageTitle sub="Testi che usi in chiamata e su WhatsApp. I nomi tra graffe vengono sostituiti in automatico.">
        Script
      </PageTitle>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}

      <div className="mb-5 inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-[#767680]/[0.12] p-0.5">
        {ORDER.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
                tab === k ? "bg-white text-[#1d1d1f] shadow-[0_3px_8px_rgba(0,0,0,0.12)]" : "text-slate-600 hover:text-[#1d1d1f]"
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
            {kind === "call" && (
              <p className="mt-2 text-xs text-slate-500">
                Scrivi <code className="rounded bg-black/5 px-1"># Titolo</code> su una riga per dividere lo script in sezioni
                richiudibili (es. # Apertura, # Obiezioni, # Chiusura).
              </p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-slate-500">Inserisci:</span>
              {vars.map((v) => (
                <button
                  key={v}
                  onClick={() => insertVar(v)}
                  className="rounded-full bg-[#007aff]/10 px-2.5 py-0.5 text-xs font-medium text-[#007aff] transition hover:bg-[#007aff]/15 active:scale-95"
                >
                  {v}
                </button>
              ))}
            </div>
            {kind !== "call" && (
              <p className="mt-2 text-xs text-slate-500">
                {"{giorno}"}, {"{ora}"} e {"{link_videocall}"} si riempiono da soli con la videocall fissata (puoi cambiarla
                prima di inviare).
              </p>
            )}
          </div>
          <div>
            <span className={label}>
              Anteprima <span className="font-normal text-slate-400">(con dati di esempio)</span>
            </span>
            {kind === "call" ? (
              <div className="h-80 overflow-y-auto rounded-2xl bg-[#767680]/[0.04] p-3 ring-1 ring-black/[0.04]">
                <ScriptSections text={preview(kind)} />
              </div>
            ) : (
              <WaPreview text={preview(kind)} />
            )}
          </div>
        </div>

        {kind !== "call" && (
          <div className="mt-5 rounded-2xl bg-[#767680]/[0.06] p-4">
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

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-black/[0.06] pt-5">
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

