"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import comuniData from "@/data/comuni.json";
import { createClient } from "@/lib/supabase/client";
import { Check, ChevronDown, Globe, Info as InfoIcon, MapPin, Save, Search, Square, Star } from "lucide-react";
import { Alert, Card, PageTitle, btnPrimary, btnSecondary, input, label, link } from "@/components/ui";

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
      <Card className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <span className={label}>1. Che attività cerchi?</span>
            <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="es. bed and breakfast" />
          </div>
          <div>
            <span className={label}>2. In quale provincia?</span>
            <select className={input} value={provincia} onChange={(e) => setProvincia(e.target.value)}>
              {PROVINCE.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
        <details className="group rounded-xl border border-slate-200 bg-slate-50/50">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm">
            <span className="flex items-center gap-2 text-slate-700">
              <MapPin size={15} className="text-slate-400" />
              3. Comuni: <b>{comuni.length}</b> di {allComuni.length} selezionati
            </span>
            <span className="flex items-center gap-1 text-xs font-medium text-brand-600">
              Scegli <ChevronDown size={14} className="transition group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t border-slate-200 px-4 py-3">
          <div className="flex gap-2 text-xs">
            <button className={`${btnSecondary} px-2.5 py-1 text-xs`} onClick={() => setComuni(allComuni)}>Tutti</button>
            <button className={`${btnSecondary} px-2.5 py-1 text-xs`} onClick={() => setComuni([])}>Nessuno</button>
          </div>
          <div className="mt-3 grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto text-sm md:grid-cols-4">
            {allComuni.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={comuni.includes(c)}
                  onChange={(e) => setComuni((cs) => (e.target.checked ? [...cs, c] : cs.filter((x) => x !== c)))}
                />
                {c}
              </label>
            ))}
          </div>
          </div>
        </details>
        <div className="flex flex-wrap gap-4 text-sm text-slate-700">
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} /> Solo con telefono</label>
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" checked={onlyInComune} onChange={(e) => setOnlyInComune(e.target.checked)} /> Solo nel comune cercato</label>
        </div>
        <div className="flex flex-wrap items-center gap-4 border-t border-slate-100 pt-5">
          {!running ? (
            <button className={btnPrimary} onClick={search} disabled={!query.trim() || !comuni.length}>
              <Search size={16} /> Cerca su Google
            </button>
          ) : (
            <button className={btnSecondary} onClick={() => (stopRef.current = true)}>
              <Square size={14} /> Ferma
            </button>
          )}
          {running && (
            <div className="min-w-[200px] flex-1">
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>Cerco a <b>{progress.current}</b>…</span>
                <span className="tabular-nums">{progress.done + 1}/{progress.total}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${progress.total ? ((progress.done + 1) / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <p className="flex items-start gap-1.5 text-xs text-slate-500">
          <InfoIcon size={13} className="mt-0.5 shrink-0" />
          Ogni comune costa una o più richieste a Google (c&apos;è una quota gratuita mensile). Ricorda di verificare il
          Registro delle Opposizioni per i numeri di persone fisiche.
        </p>
      </Card>

      {msg && (
        <Alert tone={msg.startsWith("Salvati") ? "success" : msg.startsWith("Errore") ? "error" : "info"} className="mt-4">
          {msg}
        </Alert>
      )}

      {results.length > 0 && (
        <Card className="mt-6 p-0">
          <div className="sticky top-[104px] z-10 flex flex-wrap items-center justify-between gap-2 rounded-t-2xl border-b border-slate-200 bg-white/95 p-4 backdrop-blur md:top-0">
            <span className="text-sm text-slate-600">
              <b className="text-slate-900">{visible.length}</b> risultati · <b className="text-slate-900">{selected.size}</b> selezionati
            </span>
            <button className={btnPrimary} onClick={saveSelected} disabled={!selected.size || running}>
              <Save size={16} /> Salva {selected.size || ""} nel CRM
            </button>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
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
                <tr
                  key={r.place_id}
                  className={`border-t border-slate-100 ${selected.has(r.place_id) ? "bg-brand-50/40" : ""}`}
                >
                  <td className="p-3">
                    {r.status === "nuovo" ? (
                      <input type="checkbox" checked={selected.has(r.place_id)} onChange={() => toggle(r.place_id)} />
                    ) : (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                        <Check size={11} /> nel CRM
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.address}</div>
                  </td>
                  <td className="p-3 text-slate-600">{r.city}</td>
                  <td className="whitespace-nowrap p-3 text-slate-600 tabular-nums">{r.phone ?? "—"}</td>
                  <td className="whitespace-nowrap p-3 text-slate-600">
                    {r.rating != null ? (
                      <span className="inline-flex items-center gap-1">
                        <Star size={13} className="fill-amber-400 text-amber-400" /> {r.rating}{" "}
                        <span className="text-slate-400">({r.reviews_count})</span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    {r.website ? (
                      <a className={`${link} inline-flex items-center gap-1`} href={r.website} target="_blank">
                        <Globe size={13} /> sito
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </Card>
      )}
    </>
  );
}
