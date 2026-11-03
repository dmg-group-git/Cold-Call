import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { normalizePhone } from "@/lib/utils";

/** Aggiorna i dati di un lead da Google (si conserva solo il place_id come riferimento). */
export async function POST(req: Request) {
  const { supabase, error } = await requireUser();
  if (error) return error;
  const { leadId } = await req.json();
  const { data: lead } = await supabase.from("leads").select("*").eq("id", leadId).single();
  if (!lead?.place_id) return NextResponse.json({ error: "Lead senza ID Google" }, { status: 400 });

  const res = await fetch(`https://places.googleapis.com/v1/places/${lead.place_id}`, {
    headers: {
      "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
      "X-Goog-FieldMask":
        "displayName,formattedAddress,nationalPhoneNumber,internationalPhoneNumber,websiteUri,rating,userRatingCount",
      "Accept-Language": "it",
    },
  });
  const p = await res.json();
  if (!res.ok) return NextResponse.json({ error: p.error?.message || "Errore Google" }, { status: 500 });

  const update = {
    name: p.displayName?.text ?? lead.name,
    address: p.formattedAddress ?? lead.address,
    phone: normalizePhone(p.internationalPhoneNumber || p.nationalPhoneNumber) ?? lead.phone,
    website: p.websiteUri ?? lead.website,
    rating: p.rating ?? lead.rating,
    reviews_count: p.userRatingCount ?? lead.reviews_count,
    updated_at: new Date().toISOString(),
  };
  const { error: upErr } = await supabase.from("leads").update(update).eq("id", leadId);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
