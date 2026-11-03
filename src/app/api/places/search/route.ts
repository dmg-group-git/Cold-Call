import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

export const maxDuration = 60;

const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.rating",
  "places.userRatingCount",
  "places.businessStatus",
  "places.primaryType",
  "nextPageToken",
].join(",");

interface GPlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
}

/**
 * Google con una sola frase trova solo una parte delle strutture (es. "bed and breakfast" a Torremaggiore: 10,
 * mentre su Maps sono molte di più). Per i tipi più comuni facciamo più ricerche con sinonimi e uniamo i risultati.
 */
const SYNONYMS: { match: RegExp; terms: string[] }[] = [
  {
    match: /\b(b\s*&\s*b|bnb|bed\s*(and|&)\s*breakfast|affittacamere|guest\s*house|case?\s*vacanz[ae])\b/i,
    terms: ["bed and breakfast", "B&B", "affittacamere", "guest house", "casa vacanze", "camere"],
  },
  { match: /\b(hotel|albergh?[oi])\b/i, terms: ["hotel", "albergo"] },
  { match: /\b(agriturism[oi])\b/i, terms: ["agriturismo", "masseria"] },
  { match: /\b(ristorant[ei]|trattori[ae]|osteri[ae])\b/i, terms: ["ristorante", "trattoria", "osteria", "pizzeria"] },
];

/** Divide "B&B, agriturismo" in più ricerche e aggiunge i sinonimi. */
function expandQuery(q: string): string[] {
  const parts = q
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const syn = SYNONYMS.find((g) => g.match.test(part));
    for (const t of syn ? [part, ...syn.terms] : [part]) {
      const clean = t.replace(/\bb\s*&\s*b\b/gi, "B&B");
      if (!out.some((o) => o.toLowerCase() === clean.toLowerCase())) out.push(clean);
    }
  }
  return out.slice(0, 8);
}

/** Cerca un tipo di attività in UN comune (fino a 60 risultati, limite Google). */
export async function POST(req: Request) {
  const { error } = await requireUser();
  if (error) return error;
  if (!process.env.GOOGLE_PLACES_API_KEY)
    return NextResponse.json({ error: "Manca la chiave GOOGLE_PLACES_API_KEY" }, { status: 500 });

  const { query, comune, provincia } = await req.json();
  const where = `a ${comune}${provincia ? ` (${provincia})` : ""}`;
  const byId = new Map<string, GPlace>();

  for (const term of expandQuery(String(query))) {
    let pageToken: string | undefined;
    for (let page = 0; page < 3; page++) {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
          "X-Goog-FieldMask": FIELDS,
        },
        body: JSON.stringify({
          textQuery: `${term} ${where}`,
          languageCode: "it",
          regionCode: "IT",
          pageSize: 20,
          ...(pageToken ? { pageToken } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: json.error?.message || "Errore Google Places" }, { status: 500 });
      }
      for (const p of (json.places ?? []) as GPlace[]) if (!byId.has(p.id)) byId.set(p.id, p);
      pageToken = json.nextPageToken;
      if (!pageToken) break;
    }
  }
  const places = [...byId.values()];

  const comuneLc = String(comune).toLowerCase();
  const results = places
    .filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY")
    .map((p) => ({
      place_id: p.id,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      phone: normalizePhone(p.internationalPhoneNumber || p.nationalPhoneNumber),
      website: p.websiteUri ?? null,
      rating: p.rating ?? null,
      reviews_count: p.userRatingCount ?? null,
      city: comune,
      in_comune: (p.formattedAddress ?? "").toLowerCase().includes(comuneLc),
    }));

  return NextResponse.json({ results });
}
