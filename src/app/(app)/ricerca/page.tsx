"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import comuniData from "@/data/comuni.json";
import { createClient } from "@/lib/supabase/client";
import { Card, PageTitle, btnPrimary, btnSecondary, input, label } from "@/components/ui";

const COMUNI = comuniData as Record<string, string[]>;
const PROVINCE = Object.keys(COMUNI);

interface Result {
  place_id: string;
  name: string;
  address: string;
  phone: string | null;
  website: string | null;
  rating: number | null;
  reviews_count: number | null;
  city: string;
  in_comune: boolean;
  status?: "nuovo" | "gia_presente" | "non_contattare";
}

export default function RicercaPage() {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("bed and breakfast");
  const [provincia, setProvincia] = useState(PROVINCE.find((p) => p.startsWith("Foggia")) ?? PROVINCE[0]);
  const [comuni, setComuni] = useState<string[]>([]);
  const [onlyPhone, setOnlyPhone] = useState(true);
  const [onlyInComune, setOnlyInComune] = useState(true);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    setComuni(COMUNI[provincia] ?? []);
  }, [provincia]);

  async function search() {
    setRunning(true);
    setMsg(null);
    setResults([]);
    setSelected(new Set());
    stopRef.current = false;

    // lead già presenti e lista "non contattare"
    const [{ data: existing }, { data: dnc }] = await Promise.all([
      supabase.from("leads").select("phone, place_id"),
      supabase.from("do_not_contact").select("phone"),
    ]);
    const exPhones = new Set((existing ?? []).map((e) => e.phone).filter(Boolean));
    const exPlaces = new Set((existing ?? []).map((e) => e.place_id).filter(Boolean));
    const dncPhones = new Set((dnc ?? []).map((d) => d.phone));
    const seen = new Set<string>();
    const all: Result[] = [];
    const sigla = provincia.match(/\((\w+)\)/)?.[1] ?? "";

    setProgress({ done: 0, total: comuni.length, current: "" });
    for (let i = 0; i < comuni.length; i++) {
      if (stopRef.current) break;
      const comune = comuni[i];
      setProgress({ done: i, total: comuni.length, current: comune });
      const res = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, comune, provincia: sigla }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(`Errore su ${comune}: ${json.error}`);
        break;
      }
      for (const r of json.results as Result[]) {
        if (seen.has(r.place_id)) continue;
        seen.add(r.place_id);
        r.status =
          r.phone && dncPhones.has(r.phone)
            ? "non_contattare"
            : exPlaces.has(r.place_id) || (r.phone && exPhones.has(r.phone))
              ? "gia_presente"
              : "nuovo";
        all.push(r);
      }
      setResults([...all]);
    }
    setProgress((p) => ({ ...p, done: p.total, current: "" }));
    setSelected(new Set(all.filter((r) => r.status === "nuovo" && r.phone && r.in_comune).map((r) => r.place_id)));
    setRunning(false);
  }

  const visible = results.filter(
    (r) => r.status !== "non_contattare" && (!onlyPhone || r.phone) && (!onlyInComune || r.in_comune),
  );

  async function saveSelected() {
    const sigla = provincia.match(/\((\w+)\)/)?.[1] ?? provincia;
    const phonesUsed = new Set<string>();
    const rows = visible
      .filter((r) => selected.has(r.place_id) && r.status === "nuovo")
      .filter((r) => !r.phone || (!phonesUsed.has(r.phone) && phonesUsed.add(r.phone)))
      .map((r) => ({
        name: r.name,
        phone: r.phone,
        website: r.website,
        address: r.address,
        city: r.city,
        province: sigla,
        category: query,
        place_id: r.place_id,
        rating: r.rating,
        reviews_count: r.reviews_count,
      }));
    if (!rows.length) return setMsg("Nessun lead nuovo selezionato.");
    const { error } = await supabase.from("leads").upsert(rows, { onConflict: "place_id", ignoreDuplicates: true });
    if (error) return setMsg("Errore nel salvataggio: " + error.message);
    setMsg(`Salvati ${rows.length} lead nel CRM. Li trovi in coda nella pagina Chiamate.`);
    setResults((rs) => rs.map((r) => (selected.has(r.place_id) ? { ...r, status: "gia_presente" } : r)));
    setSelected(new Set());
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  const allComuni = COMUNI[provincia] ?? [];

  return (
    <>
      <PageTitle sub="Cerca su Google le attività comune per comune e salvale nel CRM.">Ricerca lead</PageTitle>
      <Card className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <span className={label}>Tipo di attività</span>
            <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="es. bed and breakfast" />
          </div>
          <div>
            <span className={label}>Provincia</span>
            <select className={input} value={provincia} onChange={(e) => setProvincia(e.target.value)}>
              {PROVINCE.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <details>
          <summary className="cursor-pointer text-sm text-slate-700">
            Comuni selezionati: {comuni.length} di {allComuni.length} (clicca per scegliere)
          </summary>
          <div className="mt-2 flex gap-3 text-xs">
            <button className="underline" onClick={() => setComuni(allComuni)}>Tutti</button>
            <button className="underline" onClick={() => setComuni([])}>Nessuno</button>
          </div>
          <div className="mt-2 grid max-h-64 grid-cols-2 gap-1 overflow-y-auto text-sm md:grid-cols-4">
            {allComuni.map((c) => (
              <label key={c} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={comuni.includes(c)}
                  onChange={(e) => setComuni((cs) => (e.target.checked ? [...cs, c] : cs.filter((x) => x !== c)))}
                />
                {c}
              </label>
            ))}
          </div>
        </details>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} /> Solo con telefono</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={onlyInComune} onChange={(e) => setOnlyInComune(e.target.checked)} /> Solo nel comune cercato</label>
        </div>
        <div className="flex items-center gap-3">
          {!running ? (
            <button className={btnPrimary} onClick={search} disabled={!query.trim() || !comuni.length}>Cerca</button>
          ) : (
            <button className={btnSecondary} onClick={() => (stopRef.current = true)}>Ferma</button>
          )}
          {running && (
            <span className="text-sm text-slate-600">
              {progress.done + 1}/{progress.total}: {progress.current}…
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">
          Ogni comune costa una o più richieste a Google (c&apos;è una quota gratuita mensile). Ricorda di verificare il
          Registro delle Opposizioni per i numeri di persone fisiche.
        </p>
      </Card>

      {msg && <div className="mt-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{msg}</div>}

      {results.length > 0 && (
        <Card className="mt-6 overflow-x-auto p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-4">
            <span className="text-sm text-slate-600">
              {visible.length} risultati · {selected.size} selezionati
            </span>
            <button className={btnPrimary} onClick={saveSelected} disabled={!selected.size || running}>
              Salva selezionati nel CRM
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3">
                  <input
                    type="checkbox"
                    checked={visible.filter((r) => r.status === "nuovo").every((r) => selected.has(r.place_id))}
                    onChange={(e) =>
                      setSelected(new Set(e.target.checked ? visible.filter((r) => r.status === "nuovo").map((r) => r.place_id) : []))
                    }
                  />
                </th>
                <th className="p-3">Nome</th>
                <th className="p-3">Comune</th>
                <th className="p-3">Telefono</th>
                <th className="p-3">Google</th>
                <th className="p-3">Sito</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.place_id} className="border-t border-slate-100">
                  <td className="p-3">
                    {r.status === "nuovo" ? (
                      <input type="checkbox" checked={selected.has(r.place_id)} onChange={() => toggle(r.place_id)} />
                    ) : (
                      <span className="text-xs text-slate-400">già nel CRM</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.address}</div>
                  </td>
                  <td className="p-3 text-slate-600">{r.city}</td>
                  <td className="p-3 text-slate-600">{r.phone ?? "—"}</td>
                  <td className="p-3 text-slate-600">{r.rating != null ? `★ ${r.rating} (${r.reviews_count})` : "—"}</td>
                  <td className="p-3">{r.website ? <a className="text-blue-600 underline" href={r.website} target="_blank">sito</a> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
