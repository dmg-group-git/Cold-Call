"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Script } from "@/lib/types";
import { fillTemplate, materialsText, withMaterials } from "@/lib/utils";
import { MAX_FILE_MB, uploadMaterialFile } from "@/lib/materials";
import { useAppData } from "@/components/useAppData";
import { Card, PageTitle, btnPrimary, input } from "@/components/ui";

const KIND_LABEL: Record<Script["kind"], string> = {
  call: "Script chiamata",
  wa_no_answer: "WhatsApp: non risponde",
  wa_answered: "WhatsApp: ha risposto",
};
const ORDER: Script["kind"][] = ["call", "wa_no_answer", "wa_answered"];

const EXAMPLE_LEAD = { name: "B&B Il Gelso", contact_person: "Maria", city: "Vieste" };

export default function ScriptPage() {
  const { scripts, materials, settings, loading, reload } = useAppData();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attach, setAttach] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <p className="text-slate-500">Carico…</p>;

  return (
    <>
      <PageTitle
        sub={
          <>
            Variabili disponibili: <code>{"{nome}"}</code> (referente o struttura), <code>{"{struttura}"}</code>,{" "}
            <code>{"{città}"}</code>, <code>{"{mio_nome}"}</code>, <code>{"{azienda}"}</code>, <code>{"{sito}"}</code>,{" "}
            <code>{"{riferimenti}"}</code>, <code>{"{materiali}"}</code> (solo WhatsApp). I dati azienda si impostano in Impostazioni.
          </>
        }
      >
        Script
      </PageTitle>
      {error && <p className="mb-4 rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      <div className="space-y-6">
        {ORDER.map((kind) => (
          <Card key={kind}>
            <h2 className="mb-3 font-semibold">{KIND_LABEL[kind]}</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <textarea
                className={`${input} h-64 font-mono text-[13px]`}
                value={drafts[kind] ?? ""}
                onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })}
              />
              <div className="h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <div className="mb-2 text-xs uppercase text-slate-400">Anteprima (esempio)</div>
                {preview(kind)}
              </div>
            </div>
            {kind !== "call" && (
              <div className="mt-4 rounded-lg border border-slate-200 p-3">
                <div className="mb-2 text-sm font-medium">Allegati (documenti, video, link)</div>
                {materials.length ? (
                  <div className="space-y-1">
                    {materials.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm">
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
                        {m.title} <span className="text-slate-400">({m.kind})</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">Nessun materiale ancora.</p>
                )}
                <label className="mt-3 inline-block cursor-pointer text-sm text-blue-600 underline">
                  {uploading === kind ? "Carico il file…" : "+ Carica documento o video dal computer"}
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
                <p className="mt-2 text-xs text-slate-500">
                  WhatsApp dal sito può mandare solo testo: gli allegati partono come link nel messaggio (al posto di{" "}
                  <code>{"{materiali}"}</code>, oppure in fondo). Max {MAX_FILE_MB} MB per file; per video lunghi usa un link
                  YouTube o Vimeo dalla pagina Materiali.
                </p>
              </div>
            )}
            <button className={`${btnPrimary} mt-3`} onClick={() => save(kind)}>
              {saved === kind ? "Salvato ✓" : "Salva"}
            </button>
          </Card>
        ))}
      </div>
    </>
  );
}
