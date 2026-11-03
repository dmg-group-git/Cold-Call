"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Script } from "@/lib/types";
import { fillTemplate } from "@/lib/utils";
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
  const { scripts, settings, loading, reload } = useAppData();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    setDrafts(Object.fromEntries(scripts.map((s) => [s.kind, s.body])));
  }, [scripts]);

  async function save(kind: Script["kind"]) {
    const supabase = createClient();
    const existing = scripts.find((s) => s.kind === kind);
    if (existing)
      await supabase.from("scripts").update({ body: drafts[kind] ?? "", updated_at: new Date().toISOString() }).eq("id", existing.id);
    else await supabase.from("scripts").insert({ kind, title: KIND_LABEL[kind], body: drafts[kind] ?? "" });
    setSaved(kind);
    setTimeout(() => setSaved(null), 2000);
    reload();
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
                {fillTemplate(drafts[kind] ?? "", EXAMPLE_LEAD, settings, { materiali: "• Video demo: https://…\n• Brochure: https://…" })}
              </div>
            </div>
            <button className={`${btnPrimary} mt-3`} onClick={() => save(kind)}>
              {saved === kind ? "Salvato ✓" : "Salva"}
            </button>
          </Card>
        ))}
      </div>
    </>
  );
}
