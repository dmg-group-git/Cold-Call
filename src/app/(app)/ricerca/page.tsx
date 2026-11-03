"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import comuniData from "@/data/comuni.json";
import { createClient } from "@/lib/supabase/client";
import {
  Bookmark,
  Check,
  ChevronDown,
  Globe,
  Info as InfoIcon,
  MapPin,
  Play,
  Save,
  Search,
  Sparkles,
  Square,
  Star,
  Trash2,
} from "lucide-react";
import { Alert, Card, PageTitle, btnPrimary, btnSecondary, input, label, link } from "@/components/ui";
import { PhoneKind } from "@/components/PhoneKind";
import { formatDateTime, phoneKind } from "@/lib/utils";

const COMUNI = comuniData as Record<string, string[]>;
const PROVINCE = Object.keys(COMUNI);
/** Tutti i comuni d'Italia come "Vieste (FG)" -> provincia, per la ricerca su una sola città. */
const ALL_PLACES = PROVINCE.flatMap((p) => {
  const sigla = p.match(/\((\w+)\)/)?.[1] ?? "";
  return COMUNI[p].map((c) => ({ label: `${c} (${sigla})`, comune: c, provincia: p }));
});
const PLACE_BY_LABEL = new Map(ALL_PLACES.map((x) => [x.label.toLowerCase(), x]));
const RADII = [5, 10, 20, 30, 50];

type Mode = "provincia" | "citta" | "raggio";

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
  distance_km?: number | null;
  status?: "nuovo" | "gia_presente" | "non_contattare";
  /** true se una ricerca salvata non l'aveva ancora trovato */
  novita?: boolean;
}

/** Cosa serve per rifare una ricerca. */
interface SearchParams {
  query: string;
  mode: Mode;
  provincia: string;
  comuni: string[];
  cityText: string;
  radiusKm: number;
  synonyms: boolean;
}

interface SavedSearch {
  id: string;
  name: string;
  params: SearchParams;
  seen_ids: string[];
  last_run_at: string | null;
}

export default function RicercaPage() {
  const supabase = useMemo(() => createClient(), []);
  // --- cosa cercare
  const [query, setQuery] = useState("bed and breakfast");
  const [mode, setMode] = useState<Mode>("provincia");
  const [provincia, setProvincia] = useState(PROVINCE.find((p) => p.startsWith("Foggia")) ?? PROVINCE[0]);
  const [comuni, setComuni] = useState<string[]>([]);
  const [cityText, setCityText] = useState("");
  const [radiusKm, setRadiusKm] = useState(10);
  const [synonyms, setSynonyms] = useState(true);
  // --- filtri sui risultati
  const [onlyPhone, setOnlyPhone] = useState(true);
  const [phoneFilter, setPhoneFilter] = useState<"tutti" | "cellulare" | "fisso">("tutti");
  const [onlyInArea, setOnlyInArea] = useState(true);
  const [siteFilter, setSiteFilter] = useState<"tutti" | "con" | "senza">("tutti");
  const [maxRating, setMaxRating] = useState("");
  const [maxReviews, setMaxReviews] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  // --- stato
  const [searchProv, setSearchProv] = useState(provincia);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, current: "" });
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [activeSaved, setActiveSaved] = useState<SavedSearch | null>(null);
  const [saveName, setSaveName] = useState<string | null>(null);
  const stopRef = useRef(false);
  const skipComuniReset = useRef(false);

  useEffect(() => {
    if (skipComuniReset.current) {
      skipComuniReset.current = false;
      return;
    }
    setComuni(COMUNI[provincia] ?? []);
  }, [provincia]);

  const loadSaved = useCallback(async () => {
    const { data } = await supabase.from("saved_searches").select("*").order("created_at", { ascending: false });
    setSaved((data as SavedSearch[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    loadSaved();
  }, [loadSaved]);

  const city = PLACE_BY_LABEL.get(cityText.trim().toLowerCase()) ?? null;
  const canSearch = !!query.trim() && (mode === "provincia" ? comuni.length > 0 : !!city);

  function currentParams(): SearchParams {
    return { query, mode, provincia, comuni, cityText, radiusKm, synonyms };
  }

  async function search(p: SearchParams = currentParams(), fromSaved: SavedSearch | null = null) {
    const pCity = PLACE_BY_LABEL.get(p.cityText.trim().toLowerCase()) ?? null;
    const prov = p.mode === "provincia" ? p.provincia : (pCity?.provincia ?? "");
    const sigla = prov.match(/\((\w+)\)/)?.[1] ?? "";
    setRunning(true);
    setActiveSaved(fromSaved);
    setSearchProv(prov);
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
    const seenBefore = new Set(fromSaved?.seen_ids ?? []);
    const seen = new Set<string>();
    const all: Result[] = [];

    // una chiamata per comune, oppure una sola per città / raggio
    let calls: { label: string; body: Record<string, unknown> }[];
    if (p.mode === "provincia") {
      calls = p.comuni.map((c) => ({ label: c, body: { query: p.query, comune: c, provincia: sigla, synonyms: p.synonyms } }));
    } else if (p.mode === "citta") {
      calls = pCity ? [{ label: pCity.comune, body: { query: p.query, comune: pCity.comune, provincia: sigla, synonyms: p.synonyms } }] : [];
    } else {
      if (!pCity) calls = [];
      else {
        setProgress({ done: 0, total: 1, current: `centro di ${pCity.comune}` });
        const g = await fetch("/api/places/geocode", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comune: pCity.comune, provincia: sigla }),
        });
        const gj = await g.json();
        if (!g.ok) {
          setMsg(`Errore: ${gj.error}`);
          setRunning(false);
          return;
        }
        calls = [
          {
            label: `${p.radiusKm} km da ${pCity.comune}`,
            body: { query: p.query, comune: pCity.comune, provincia: sigla, synonyms: p.synonyms, center: gj, radiusKm: p.radiusKm },
          },
        ];
      }
    }

    setProgress({ done: 0, total: calls.length, current: "" });
    for (let i = 0; i < calls.length; i++) {
      if (stopRef.current) break;
      setProgress({ done: i, total: calls.length, current: calls[i].label });
      const res = await fetch("/api/places/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calls[i].body),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg(`Errore su ${calls[i].label}: ${json.error}`);
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
        r.novita = !!fromSaved && !seenBefore.has(r.place_id);
        all.push(r);
      }
      setResults([...all]);
    }
    setProgress((pr) => ({ ...pr, done: pr.total, current: "" }));
    setSelected(new Set(all.filter((r) => r.status === "nuovo" && r.phone && r.in_comune).map((r) => r.place_id)));
    setRunning(false);

    // ricerca salvata: ricordo cosa ho già visto, così la prossima volta mostro solo le novità
    if (fromSaved && !stopRef.current) {
      const ids = [...new Set([...fromSaved.seen_ids, ...seen])];
      await supabase
        .from("saved_searches")
        .update({ seen_ids: ids, last_run_at: new Date().toISOString() })
        .eq("id", fromSaved.id);
      const nuove = all.filter((r) => r.novita).length;
      setMsg(
        fromSaved.last_run_at
          ? `Ricerca "${fromSaved.name}": ${nuove} attività nuove rispetto all'ultima volta.`
          : `Ricerca "${fromSaved.name}" fatta. La prossima volta ti mostro quali sono nuove.`,
      );
      loadSaved();
    }
  }

  function defaultSaveName() {
    const where =
      mode === "provincia"
        ? comuni.length === (COMUNI[provincia]?.length ?? 0)
          ? `provincia di ${provincia}`
          : `${comuni.length} comuni (${provincia})`
        : mode === "citta"
          ? (city?.label ?? cityText)
          : `${radiusKm} km da ${city?.label ?? cityText}`;
    return `${query} · ${where}`;
  }

  async function saveSearch() {
    const name = (saveName ?? "").trim() || defaultSaveName();
    const ids = results.map((r) => r.place_id);
    const { error } = await supabase
      .from("saved_searches")
      .insert({ name, params: currentParams(), seen_ids: ids, last_run_at: results.length ? new Date().toISOString() : null });
    if (error) return setMsg("Errore nel salvataggio della ricerca: " + error.message);
    setSaveName(null);
    setMsg(`Ricerca "${name}" salvata. La ritrovi qui sopra in "Ricerche salvate".`);
    loadSaved();
  }

  function applyParams(p: SearchParams) {
    if (p.provincia !== provincia) skipComuniReset.current = true;
    setQuery(p.query);
    setMode(p.mode);
    setProvincia(p.provincia);
    setComuni(p.comuni);
    setCityText(p.cityText);
    setRadiusKm(p.radiusKm);
    setSynonyms(p.synonyms);
  }

  function runSaved(s: SavedSearch) {
    applyParams(s.params);
    setOnlyNew(!!s.last_run_at);
    search(s.params, s);
  }

  async function deleteSaved(s: SavedSearch) {
    await supabase.from("saved_searches").delete().eq("id", s.id);
    if (activeSaved?.id === s.id) setActiveSaved(null);
    loadSaved();
  }

  const maxR = maxRating ? Number(maxRating) : null;
  const maxRev = maxReviews.trim() ? Number(maxReviews) : null;
  const visible = results.filter(
    (r) =>
      r.status !== "non_contattare" &&
      (!onlyPhone || r.phone) &&
      (phoneFilter === "tutti" || phoneKind(r.phone) === phoneFilter) &&
      (!onlyInArea || r.in_comune) &&
      (siteFilter === "tutti" || (siteFilter === "con" ? !!r.website : !r.website)) &&
      (maxR == null || (r.rating ?? 0) < maxR) &&
      (maxRev == null || (r.reviews_count ?? 0) <= maxRev) &&
      (!onlyNew || (r.status === "nuovo" && (!activeSaved || r.novita))),
  );
  const selectedVisible = visible.filter((r) => selected.has(r.place_id)).length;
  const withSite = results.filter((r) => r.website).length;
  const cells = results.filter((r) => phoneKind(r.phone) === "cellulare").length;
  const fissi = results.filter((r) => phoneKind(r.phone) === "fisso").length;

  async function saveSelected() {
    const sigla = searchProv.match(/\((\w+)\)/)?.[1] ?? searchProv;
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
  const seg = (active: boolean) => `rounded-md px-2.5 py-1 ${active ? "bg-slate-900 text-white" : "text-slate-600"}`;
  const small = `${input} py-1.5 text-sm`;

  return (
    <>
      <PageTitle sub="Cerca su Google le attività in una provincia, in una città o intorno a una città, e salvale nel CRM.">
        Ricerca lead
      </PageTitle>

      {saved.length > 0 && (
        <Card className="mb-5">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Bookmark size={15} className="text-brand-500" /> Ricerche salvate
          </div>
          <ul className="divide-y divide-slate-100">
            {saved.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <div>
                  <div className="font-medium text-slate-900">{s.name}</div>
                  <div className="text-xs text-slate-500">
                    {s.last_run_at ? `Ultima volta: ${formatDateTime(s.last_run_at)}` : "Mai fatta"} · {s.seen_ids.length} attività già viste
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className={`${btnSecondary} px-3 py-1.5 text-xs`} disabled={running} onClick={() => runSaved(s)}>
                    <Play size={13} /> Rifai e mostra le novità
                  </button>
                  <button className="p-1.5 text-slate-400 hover:text-rose-600" title="Elimina" onClick={() => deleteSaved(s)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <span className={label}>1. Che attività cerchi?</span>
            <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="es. bed and breakfast" />
            <p className="mt-1 text-xs text-slate-500">
              Puoi scriverne più di una separate da virgola (es. B&amp;B, agriturismo): unisco i risultati senza doppioni.
            </p>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={synonyms} onChange={(e) => setSynonyms(e.target.checked)} />
              <Sparkles size={13} className="text-brand-500" /> Cerca anche i sinonimi (più risultati)
            </label>
          </div>
          <div>
            <span className={label}>2. Dove?</span>
            <div className="mb-2 grid grid-cols-3 rounded-lg border border-slate-200 p-0.5 text-xs">
              {(
                [
                  ["provincia", "Provincia (più comuni)"],
                  ["citta", "Una città/paese"],
                  ["raggio", "Intorno a una città"],
                ] as const
              ).map(([m, l]) => (
                <button key={m} type="button" onClick={() => setMode(m)} className={seg(mode === m)}>
                  {l}
                </button>
              ))}
            </div>
            {mode === "provincia" ? (
              <select className={input} value={provincia} onChange={(e) => setProvincia(e.target.value)}>
                {PROVINCE.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            ) : (
              <div className="flex gap-2">
                <div className="flex-1">
                  <input
                    className={input}
                    list="lista-comuni"
                    value={cityText}
                    onChange={(e) => setCityText(e.target.value)}
                    placeholder="Scrivi il nome, es. Vieste"
                  />
                  <datalist id="lista-comuni">
                    {cityText.trim().length >= 2 &&
                      ALL_PLACES.filter((x) => x.label.toLowerCase().startsWith(cityText.trim().toLowerCase()))
                        .slice(0, 30)
                        .map((x) => <option key={x.label} value={x.label} />)}
                  </datalist>
                </div>
                {mode === "raggio" && (
                  <select className={`${input} w-28`} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))}>
                    {RADII.map((r) => (
                      <option key={r} value={r}>
                        {r} km
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
            {mode !== "provincia" && cityText.trim() && !city && (
              <p className="mt-1 text-xs text-amber-600">Scegli il comune dall&apos;elenco che compare mentre scrivi.</p>
            )}
            {mode === "raggio" && (
              <p className="mt-1 text-xs text-slate-500">
                Trova le attività entro {radiusKm} km dal centro, anche nei comuni vicini.
              </p>
            )}
          </div>
        </div>
        {mode === "provincia" && (
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
        )}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          {!running ? (
            <button className={btnPrimary} onClick={() => search()} disabled={!canSearch}>
              <Search size={16} /> Cerca su Google
            </button>
          ) : (
            <button className={btnSecondary} onClick={() => (stopRef.current = true)}>
              <Square size={14} /> Ferma
            </button>
          )}
          {!running &&
            (saveName === null ? (
              <button className={btnSecondary} disabled={!canSearch} onClick={() => setSaveName(defaultSaveName())}>
                <Bookmark size={15} /> Salva questa ricerca
              </button>
            ) : (
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <input className={`${small} min-w-[220px] flex-1`} value={saveName} onChange={(e) => setSaveName(e.target.value)} />
                <button className={`${btnPrimary} px-3 py-1.5 text-sm`} onClick={saveSearch}>Salva</button>
                <button className={`${btnSecondary} px-3 py-1.5 text-sm`} onClick={() => setSaveName(null)}>Annulla</button>
              </div>
            ))}
          {running && (
            <div className="min-w-[200px] flex-1">
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>Cerco: <b>{progress.current}</b>…</span>
                <span className="tabular-nums">{Math.min(progress.done + 1, progress.total)}/{progress.total}</span>
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
          Ogni comune costa alcune richieste a Google (con i sinonimi qualcuna in più). Ricorda di verificare il Registro
          delle Opposizioni per i numeri di persone fisiche.
        </p>
      </Card>

      {msg && (
        <Alert
          tone={msg.startsWith("Errore") ? "error" : msg.startsWith("Salvati") || msg.startsWith("Ricerca") ? "success" : "info"}
          className="mt-4"
        >
          {msg}
        </Alert>
      )}

      {results.length > 0 && (
        <Card className="mt-6 p-0">
          <div className="sticky top-[104px] z-10 space-y-3 rounded-t-2xl border-b border-slate-200 bg-white/95 p-4 backdrop-blur md:top-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-slate-600">
                <b className="text-slate-900">{visible.length}</b> risultati su {results.length} ·{" "}
                <b className="text-slate-900">{selectedVisible}</b> selezionati
              </span>
              <button className={btnPrimary} onClick={saveSelected} disabled={!selectedVisible || running}>
                <Save size={16} /> Salva {selectedVisible || ""} nel CRM
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                {(
                  [
                    ["tutti", `Tutti`],
                    ["con", `Con sito (${withSite})`],
                    ["senza", `Senza sito (${results.length - withSite})`],
                  ] as const
                ).map(([f, l]) => (
                  <button key={f} type="button" onClick={() => setSiteFilter(f)} className={seg(siteFilter === f)}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 p-0.5">
                {(
                  [
                    ["tutti", "Ogni numero"],
                    ["cellulare", `Cellulari (${cells})`],
                    ["fisso", `Fissi (${fissi})`],
                  ] as const
                ).map(([f, l]) => (
                  <button key={f} type="button" onClick={() => setPhoneFilter(f)} className={seg(phoneFilter === f)}>
                    {l}
                  </button>
                ))}
              </div>
              <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5" value={maxRating} onChange={(e) => setMaxRating(e.target.value)}>
                <option value="">Qualsiasi voto</option>
                <option value="4.5">Voto sotto 4,5 ★</option>
                <option value="4">Voto sotto 4 ★</option>
                <option value="3.5">Voto sotto 3,5 ★</option>
              </select>
              <label className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1">
                Max recensioni
                <input
                  type="number"
                  min={0}
                  className="w-16 rounded border border-slate-200 px-1.5 py-0.5"
                  value={maxReviews}
                  onChange={(e) => setMaxReviews(e.target.value)}
                  placeholder="—"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-700">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} /> Solo con telefono
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={onlyInArea} onChange={(e) => setOnlyInArea(e.target.checked)} />
                {mode === "raggio" ? `Solo entro ${radiusKm} km` : "Solo nel comune cercato"}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input type="checkbox" checked={onlyNew} onChange={(e) => setOnlyNew(e.target.checked)} />
                {activeSaved ? "Solo novità (non viste l'ultima volta e non nel CRM)" : "Nascondi quelli già nel CRM"}
              </label>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">
                    <input
                      type="checkbox"
                      checked={
                        visible.some((r) => r.status === "nuovo") &&
                        visible.filter((r) => r.status === "nuovo").every((r) => selected.has(r.place_id))
                      }
                      onChange={(e) =>
                        setSelected((prev) => {
                          const n = new Set(prev);
                          for (const r of visible.filter((x) => x.status === "nuovo")) {
                            if (e.target.checked) n.add(r.place_id);
                            else n.delete(r.place_id);
                          }
                          return n;
                        })
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
                  <tr key={r.place_id} className={`border-t border-slate-100 ${selected.has(r.place_id) ? "bg-brand-50/40" : ""}`}>
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
                      <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-900">
                        {r.name}
                        {r.novita && (
                          <span className="rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand-700">nuovo</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{r.address}</div>
                    </td>
                    <td className="p-3 text-slate-600">
                      {r.city}
                      {r.distance_km != null && <div className="text-xs text-slate-400">{r.distance_km} km</div>}
                    </td>
                    <td className="whitespace-nowrap p-3 text-slate-600 tabular-nums">
                      {r.phone ?? "—"}
                      <div className="mt-0.5">
                        <PhoneKind phone={r.phone} />
                      </div>
                    </td>
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
