import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

/** Coordinate del centro di un comune (per la ricerca a raggio). */
export async function POST(req: Request) {
  const { error } = await requireUser();
  if (error) return error;
  if (!process.env.GOOGLE_PLACES_API_KEY)
    return NextResponse.json({ error: "Manca la chiave GOOGLE_PLACES_API_KEY" }, { status: 500 });
  const { comune, provincia } = await req.json();
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY,
      "X-Goog-FieldMask": "places.location,places.displayName",
    },
    body: JSON.stringify({
      textQuery: `${comune}${provincia ? ` ${provincia}` : ""}, Italia`,
      includedType: "locality",
      languageCode: "it",
      regionCode: "IT",
      pageSize: 1,
    }),
  });
  const json = await res.json();
  if (!res.ok) return NextResponse.json({ error: json.error?.message || "Errore Google" }, { status: 500 });
  const loc = json.places?.[0]?.location;
  if (!loc) return NextResponse.json({ error: `Non trovo ${comune} su Google` }, { status: 404 });
  return NextResponse.json({ lat: loc.latitude, lng: loc.longitude });
}
