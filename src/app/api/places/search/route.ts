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
}

/** Cerca un tipo di attività in UN comune (fino a 60 risultati, limite Google). */
export async function POST(req: Request) {
  const { error } = await requireUser();
  if (error) return error;
  if (!process.env.GOOGLE_PLACES_API_KEY)
    return NextResponse.json({ error: "Manca la chiave GOOGLE_PLACES_API_KEY" }, { status: 500 });

  const { query, comune, provincia } = await req.json();
  const textQuery = `${query} a ${comune}${provincia ? ` (${provincia})` : ""}`;
  const places: GPlace[] = [];
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
        textQuery,
        languageCode: "it",
        regionCode: "IT",
        pageSize: 20,
        ...(pageToken ? { pageToken } : {}),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error?.message || "Errore Google Places" },
        { status: 500 },
      );
    }
    places.push(...(json.places ?? []));
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

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
