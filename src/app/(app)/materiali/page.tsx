"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Material } from "@/lib/types";
import { useAppData } from "@/components/useAppData";
import { MAX_FILE_MB, uploadMaterialFile } from "@/lib/materials";
import { ExternalLink, FileText, Link2, Paperclip, Plus, Trash2, Video, type LucideIcon } from "lucide-react";
import { Alert, Card, CardTitle, EmptyState, Loading, PageTitle, btnPrimary, input, label } from "@/components/ui";

const KIND: Record<Material["kind"], { icon: LucideIcon; label: string; color: string }> = {
  video: { icon: Video, label: "Video", color: "bg-rose-50 text-rose-600" },
  pdf: { icon: FileText, label: "PDF", color: "bg-sky-50 text-sky-600" },
  file: { icon: FileText, label: "File", color: "bg-sky-50 text-sky-600" },
  link: { icon: Link2, label: "Link", color: "bg-emerald-50 text-emerald-600" },
};

export default function MaterialiPage() {
  const { materials, loading, reload } = useAppData();
  const [kind, setKind] = useState<Material["kind"]>("video");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    setBusy(true);
    const supabase = createClient();
    try {
      if (kind === "file") {
        if (!file) throw new Error("Scegli un file");
        await uploadMaterialFile(supabase, file, title);
      } else {
        const finalUrl = url.trim();
        if (!finalUrl) throw new Error("Inserisci il link");
        const { error: insErr } = await supabase.from("materials").insert({ title: title.trim(), kind, url: finalUrl });
        if (insErr) throw new Error(insErr.message);
      }
    } catch (e) {
      setBusy(false);
      return setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
    setTitle("");
    setUrl("");
    setFile(null);
    reload();
  }

  async function remove(m: Material) {
    const supabase = createClient();
    if (m.storage_path) await supabase.storage.from("materials").remove([m.storage_path]);
    await supabase.from("materials").delete().eq("id", m.id);
    reload();
  }

  return (
    <>
      <PageTitle sub="I materiali vengono inviati via WhatsApp come link. Per i video usa YouTube (non in elenco) o Vimeo.">
        Materiali
      </PageTitle>
      <Card className="space-y-4">
        <CardTitle icon={Plus} tone="pink">Aggiungi materiale</CardTitle>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <span className={label}>Tipo</span>
            <select className={input} value={kind} onChange={(e) => setKind(e.target.value as Material["kind"])}>
              <option value="video">Video (link)</option>
              <option value="file">Documento o video (carica file)</option>
              <option value="link">Link utile</option>
            </select>
          </div>
          <div>
            <span className={label}>Titolo</span>
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="es. Video demo" />
          </div>
          <div>
            {kind === "file" ? (
              <>
                <span className={label}>File (max {MAX_FILE_MB} MB)</span>
                <input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.jpg,.jpeg,.png,video/*,application/pdf" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </>
            ) : (
              <>
                <span className={label}>Link</span>
                <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </>
            )}
          </div>
        </div>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <button className={btnPrimary} onClick={add} disabled={busy || !title.trim()}>
            <Plus size={16} /> {busy ? "Salvo…" : "Aggiungi"}
          </button>
          {kind === "file" && <p className="text-xs text-slate-500">Attenzione: chi ha il link del file può aprirlo (serve per mandarlo via WhatsApp).</p>}
        </div>
      </Card>

      <Card className="mt-6 p-0">
        {loading ? (
          <div className="px-5"><Loading /></div>
        ) : !materials.length ? (
          <EmptyState icon={Paperclip} title="Nessun materiale ancora">
            Aggiungi video, PDF o link: potrai allegarli ai messaggi WhatsApp.
          </EmptyState>
        ) : (
          <ul className="divide-y divide-black/[0.06]">
            {materials.map((m) => {
              const k = KIND[m.kind] ?? KIND.link;
              return (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3.5 text-sm">
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${k.color}`}>
                    <k.icon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900">{m.title}</div>
                    <a className="inline-flex max-w-full items-center gap-1 truncate text-xs text-slate-500 hover:text-brand-600" href={m.url} target="_blank">
                      <span className="truncate">{m.url.replace(/^https?:\/\//, "")}</span> <ExternalLink size={11} className="shrink-0" />
                    </a>
                  </div>
                  <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 sm:inline">{k.label}</span>
                  <button
                    className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => remove(m)}
                    aria-label="Elimina"
                    title="Elimina"
                  >
                    <Trash2 size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}
