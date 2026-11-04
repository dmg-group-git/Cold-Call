import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Objection } from "./types";

/** Quante chiamate leggere per volta (così ogni passaggio resta sotto il minuto). */
const BATCH = 40;

const GroupsSchema = z.object({
  gruppi: z.array(
    z.object({
      esistente: z.string().nullable(),
      obiezione: z.string(),
      risposta: z.string(),
      voci: z.array(z.number().int()),
    }),
  ),
});

const AnswerSchema = z.object({ risposta: z.string() });

const ANSWER_STYLE = `Le risposte sono per un commerciale che fa chiamate a freddo in italiano: 2-4 frasi da dire a voce, dando del lei al cliente, naturali e non aggressive. Riconosci l'obiezione, dai un motivo concreto basato su cosa offre l'azienda, e chiudi con una domanda che riporta verso l'appuntamento (videocall). Non inventare prezzi, numeri o garanzie che non trovi nel contesto.`;

function model() {
  return process.env.CLAUDE_MODEL || "claude-opus-5-5";
}

/** Contesto dell'azienda (script + impostazioni) per scrivere risposte coerenti. */
async function loadContext(supabase: SupabaseClient) {
  const [{ data: settings }, { data: scripts }] = await Promise.all([
    supabase.from("settings").select("company_name, company_website").eq("id", 1).maybeSingle(),
    supabase.from("scripts").select("kind, title, body"),
  ]);
  const parts: string[] = [];
  if (settings?.company_name) parts.push(`Azienda: ${settings.company_name}`);
  if (settings?.company_website) parts.push(`Sito: ${settings.company_website}`);
  for (const s of scripts ?? []) parts.push(`--- ${s.title} ---\n${String(s.body).slice(0, 4000)}`);
  return parts.join("\n\n") || "(nessun contesto disponibile)";
}

function client() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Manca la chiave ANTHROPIC_API_KEY");
  return new Anthropic();
}

/**
 * Legge le chiamate non ancora usate per le obiezioni e le aggiunge all'elenco:
 * obiezioni simili a una esistente ne aumentano il contatore, quelle nuove vengono create
 * con una prima risposta scritta da Claude.
 */
export async function syncObjections(supabase: SupabaseClient) {
  const { data: calls, error } = await supabase
    .from("interactions")
    .select("id, created_at, objections")
    .eq("type", "call")
    .eq("analysis_status", "completata")
    .is("objections_synced_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) throw new Error(error.message);

  const items: { interactionId: string; at: string; text: string }[] = [];
  for (const c of calls ?? [])
    for (const t of (c.objections as string[] | null) ?? [])
      if (t && t.trim()) items.push({ interactionId: c.id, at: c.created_at, text: t.trim() });

  let added = 0;
  let merged = 0;

  if (items.length) {
    const { data: existingRows, error: exErr } = await supabase.from("objections").select("*");
    if (exErr) throw new Error(exErr.message);
    const existing = (existingRows ?? []) as Objection[];
    const keyToRow = new Map(existing.map((o, i) => [`E${i + 1}`, o]));

    const elencoEsistenti = existing.length
      ? existing
          .map((o, i) => {
            const simili = o.aliases.slice(0, 4).map((a) => `"${a}"`).join(", ");
            return `E${i + 1}: ${o.text}${simili ? ` (detta anche: ${simili})` : ""}${o.answer.trim() ? "" : " [SENZA RISPOSTA]"}`;
          })
          .join("\n")
      : "(nessuna)";
    const voci = items.map((it, n) => `${n}: ${it.text}`).join("\n");

    const response = await client().messages.parse({
      model: model(),
      max_tokens: 12000,
      output_config: { effort: "low", format: zodOutputFormat(GroupsSchema) },
      system: `Gestisci l'elenco delle obiezioni che i clienti fanno al telefono a un commerciale.
Ricevi le obiezioni già in elenco (E1, E2, ...) e delle nuove voci numerate, estratte da chiamate recenti.
Raggruppa ogni voce:
- se ha lo stesso SENSO di un'obiezione già in elenco (anche con parole diverse, es. "costa troppo" e "non abbiamo budget"), mettila nel gruppo con esistente = "E<n>". In questo caso lascia obiezione vuota, e scrivi risposta SOLO se quell'obiezione è [SENZA RISPOSTA], altrimenti stringa vuota.
- se è un'obiezione nuova, crea un gruppo con esistente = null, obiezione = frase breve e chiara (max 10 parole, prima persona del cliente, es. "Non ho tempo adesso") e risposta consigliata.
- voci simili tra loro vanno nello stesso gruppo.
- ignora le voci che non sono vere obiezioni (es. "non ha risposto").
Ogni numero di voce va al massimo in un gruppo. Non creare doppioni di obiezioni già in elenco.
${ANSWER_STYLE}

CONTESTO AZIENDA (script e offerta):
${await loadContext(supabase)}`,
      messages: [
        {
          role: "user",
          content: `OBIEZIONI GIÀ IN ELENCO:\n${elencoEsistenti}\n\nNUOVE VOCI:\n${voci}`,
        },
      ],
    });
    if (!response.parsed_output) throw new Error("Risposta di Claude non leggibile");

    const used = new Set<number>();
    const now = new Date().toISOString();
    for (const g of response.parsed_output.gruppi) {
      const its = g.voci.filter((n) => items[n] && !used.has(n)).map((n) => (used.add(n), items[n]));
      if (!its.length) continue;
      const ids = its.map((i) => i.interactionId);
      const texts = its.map((i) => i.text);
      const lastSeen = its.map((i) => i.at).sort().at(-1)!;
      const row = g.esistente ? keyToRow.get(g.esistente.trim()) : undefined;

      if (row) {
        const update: Partial<Objection> = {
          interaction_ids: uniq([...row.interaction_ids, ...ids]),
          aliases: mergeAliases(row.aliases, texts, row.text),
          last_seen_at: maxDate(row.last_seen_at, lastSeen),
          updated_at: now,
        };
        if (!row.answer.trim() && !row.answer_manual && g.risposta.trim()) update.answer = g.risposta.trim();
        const { error: uErr } = await supabase.from("objections").update(update).eq("id", row.id);
        if (uErr) throw new Error(uErr.message);
        Object.assign(row, update); // se più gruppi puntano alla stessa, somma tutto
        merged++;
      } else {
        const text = g.obiezione.trim() || texts[0];
        const { error: iErr } = await supabase.from("objections").insert({
          text,
          answer: g.risposta.trim(),
          aliases: mergeAliases([], texts, text),
          interaction_ids: uniq(ids),
          last_seen_at: lastSeen,
        });
        if (iErr) throw new Error(iErr.message);
        added++;
      }
    }
  }

  const ids = (calls ?? []).map((c) => c.id);
  if (ids.length) {
    const { error: mErr } = await supabase
      .from("interactions")
      .update({ objections_synced_at: new Date().toISOString() })
      .in("id", ids);
    if (mErr) throw new Error(mErr.message);
  }

  const { count } = await supabase
    .from("interactions")
    .select("id", { count: "exact", head: true })
    .eq("type", "call")
    .eq("analysis_status", "completata")
    .is("objections_synced_at", null);

  return { added, merged, processed: ids.length, remaining: count ?? 0 };
}

/** Scrive una risposta consigliata per una singola obiezione. */
export async function writeAnswer(supabase: SupabaseClient, objection: string) {
  const response = await client().messages.parse({
    model: model(),
    max_tokens: 2000,
    output_config: { effort: "low", format: zodOutputFormat(AnswerSchema) },
    system: `Scrivi la risposta consigliata a un'obiezione di un cliente in una chiamata a freddo.
${ANSWER_STYLE}

CONTESTO AZIENDA (script e offerta):
${await loadContext(supabase)}`,
    messages: [{ role: "user", content: `Obiezione: ${objection}` }],
  });
  if (!response.parsed_output) throw new Error("Risposta di Claude non leggibile");
  return response.parsed_output.risposta.trim();
}

function uniq<T>(a: T[]) {
  return [...new Set(a)];
}

function mergeAliases(current: string[], add: string[], main: string) {
  const seen = new Set([main.toLowerCase(), ...current.map((a) => a.toLowerCase())]);
  const out = [...current];
  for (const t of add) {
    const k = t.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out.slice(-20);
}

function maxDate(a: string | null, b: string) {
  return !a || b > a ? b : a;
}
