"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Material } from "@/lib/types";
import { useAppData } from "@/components/useAppData";
import { Card, PageTitle, btnPrimary, input, label } from "@/components/ui";

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
    let finalUrl = url.trim();
    let storage_path: string | null = null;
    if (kind === "pdf") {
      if (!file) {
        setBusy(false);
        return setError("Scegli un file PDF");
      }
      const safe = file.name.replace(/[^\w.-]+/g, "_");
      storage_path = `${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("materials").upload(storage_path, file, { contentType: file.type });
      if (upErr) {
        setBusy(false);
        return setError(upErr.message);
      }
      finalUrl = supabase.storage.from("materials").getPublicUrl(storage_path).data.publicUrl;
    }
    if (!finalUrl) {
      setBusy(false);
      return setError("Inserisci il link");
    }
    const { error: insErr } = await supabase.from("materials").insert({ title: title.trim(), kind, url: finalUrl, storage_path });
    setBusy(false);
    if (insErr) return setError(insErr.message);
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
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <span className={label}>Tipo</span>
            <select className={input} value={kind} onChange={(e) => setKind(e.target.value as Material["kind"])}>
              <option value="video">Video (link)</option>
              <option value="pdf">PDF (carica file)</option>
              <option value="link">Link utile</option>
            </select>
          </div>
          <div>
            <span className={label}>Titolo</span>
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="es. Video demo" />
          </div>
          <div>
            {kind === "pdf" ? (
              <>
                <span className={label}>File PDF</span>
                <input type="file" accept="application/pdf" className="text-sm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </>
            ) : (
              <>
                <span className={label}>Link</span>
                <input className={input} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
              </>
            )}
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className={btnPrimary} onClick={add} disabled={busy || !title.trim()}>
          {busy ? "Salvo…" : "Aggiungi"}
        </button>
        {kind === "pdf" && <p className="text-xs text-slate-500">Attenzione: chi ha il link del PDF può aprirlo (serve per mandarlo via WhatsApp).</p>}
      </Card>

      <Card className="mt-6">
        {loading ? (
          <p className="text-slate-500">Carico…</p>
        ) : !materials.length ? (
          <p className="text-slate-500">Nessun materiale ancora.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {materials.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <div className="font-medium">{m.title} <span className="text-xs text-slate-400">({m.kind})</span></div>
                  <a className="break-all text-blue-600 underline" href={m.url} target="_blank">{m.url}</a>
                </div>
                <button className="text-xs text-red-600 underline" onClick={() => remove(m)}>Elimina</button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
