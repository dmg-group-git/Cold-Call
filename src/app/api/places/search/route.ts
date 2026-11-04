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
  "places.types",
  "places.location",
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
  types?: string[];
  location?: { latitude: number; longitude: number };
}

type Center = { lat: number; lng: number };

/** Distanza in km tra due punti. */
function distanceKm(a: Center, b: Center): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Rettangolo che contiene il cerchio (Google accetta solo rettangoli come limite rigido). */
function boxAround(c: Center, km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((c.lat * Math.PI) / 180));
  return {
    rectangle: {
      low: { latitude: c.lat - dLat, longitude: c.lng - dLng },
      high: { latitude: c.lat + dLat, longitude: c.lng + dLng },
    },
  };
}

/** Comune dall'indirizzo di Google: "Via Roma 1, 71016 San Severo FG" -> "San Severo". */
function cityFromAddress(addr: string): string | null {
  return addr.match(/\d{5}\s+(.+?)\s+[A-Z]{2}(?:,|$)/)?.[1] ?? null;
}

/**
 * Google con una sola frase trova solo una parte delle strutture (es. "bed and breakfast" a Torremaggiore: 10,
 * mentre su Maps sono molte di più). Per i tipi più comuni facciamo più ricerche con sinonimi e uniamo i risultati.
 */
const SYNONYMS: { match: RegExp; terms: string[]; types: RegExp; names: RegExp }[] = [
  {
    match: /\b(b\s*&\s*b|bnb|bed\s*(and|&)\s*breakfast|affittacamere|guest\s*house|case?\s*vacanz[ae])\b/i,
    terms: ["bed and breakfast", "B&B", "affittacamere", "guest house", "casa vacanze"],
    types: /^(lodging|bed_and_breakfast|guest_house|hotel|motel|inn|hostel|farmstay|cottage|private_guest_room|resort_hotel|extended_stay_hotel)$/,
    names: /\b(b\s*&\s*b|bnb|bed|breakfast|affittacamer[ae]|camere|rooms?|guest|casa|case|vacanz[ae]|suites?|dimora|residence|relais|ospitalit|holiday|apartments?|appartament[oi]|villa|loft)\b/i,
  },
  {
    match: /\b(hotel|albergh?[oi])\b/i,
    terms: ["hotel", "albergo"],
    types: /^(lodging|hotel|motel|inn|resort_hotel|extended_stay_hotel)$/,
    names: /\b(hotel|albergo|resort|relais)\b/i,
  },
  {
    match: /\b(agriturism[oi])\b/i,
    terms: ["agriturismo", "masseria"],
    types: /^(lodging|farmstay|farm|bed_and_breakfast|guest_house|restaurant)$/,
    names: /\b(agriturism[oi]|masseria|tenuta|azienda agricola|fattoria)\b/i,
  },
  {
    match: /\b(ristorant[ei]|trattori[ae]|osteri[ae])\b/i,
    terms: ["ristorante", "trattoria", "osteria", "pizzeria"],
    types: /(restaurant|^pizzeria$|^meal_takeaway$)/,
    names: /\b(ristorante|trattoria|osteria|pizzeria|braceria|locanda)\b/i,
  },
];

/**
 * Google, se trova pochi risultati per la frase, riempie la lista con attività vicine che non c'entrano
 * (pub, negozi...). Per i tipi conosciuti teniamo solo i posti del tipo giusto (o col nome giusto).
 */
function fitsQuery(p: GPlace, q: string, synonyms: boolean): boolean {
  if (!synonyms) return true;
  const parts = q.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);
  const groups = parts.map((part) => SYNONYMS.find((g) => g.match.test(part)));
  // se c'è anche un tipo di attività che non conosciamo, non filtriamo
  if (!parts.length || groups.some((g) => !g)) return true;
  const types = [p.primaryType, ...(p.types ?? [])].filter(Boolean) as string[];
  const name = p.displayName?.text ?? "";
  return groups.some((g) => !!g && (types.some((t) => g.types.test(t)) || g.names.test(name)));
}

/** Divide "B&B, agriturismo" in più ricerche e aggiunge i sinonimi. */
function expandQuery(q: string, synonyms: boolean): string[] {
  const parts = q
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const syn = synonyms ? SYNONYMS.find((g) => g.match.test(part)) : undefined;
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

  const body = await req.json();
  const { query, comune, provincia } = body;
  const synonyms: boolean = body.synonyms !== false;
  const center: Center | null = body.center ?? null;
  const radiusKm: number = Math.min(Math.max(Number(body.radiusKm) || 10, 1), 50);
  // ricerca a raggio: niente nome del comune nella frase, ma un'area rigida intorno al centro
  const where = center ? "" : `a ${comune}${provincia ? ` (${provincia})` : ""}`;
  const byId = new Map<string, GPlace>();

  for (const term of expandQuery(String(query), synonyms)) {
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
          textQuery: `${term} ${where}`.trim(),
          ...(center ? { locationRestriction: boxAround(center, radiusKm) } : {}),
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
    .filter((p) => fitsQuery(p, String(query), synonyms))
    .map((p) => ({
      place_id: p.id,
      name: p.displayName?.text ?? "",
      address: p.formattedAddress ?? "",
      phone: normalizePhone(p.internationalPhoneNumber || p.nationalPhoneNumber),
      website: p.websiteUri ?? null,
      rating: p.rating ?? null,
      reviews_count: p.userRatingCount ?? null,
      city: center ? (cityFromAddress(p.formattedAddress ?? "") ?? comune) : comune,
      distance_km:
        center && p.location
          ? Math.round(distanceKm(center, { lat: p.location.latitude, lng: p.location.longitude }) * 10) / 10
          : null,
      in_comune: center
        ? !!p.location && distanceKm(center, { lat: p.location.latitude, lng: p.location.longitude }) <= radiusKm
        : (p.formattedAddress ?? "").toLowerCase().includes(comuneLc),
    }));

  return NextResponse.json({ results });
}
