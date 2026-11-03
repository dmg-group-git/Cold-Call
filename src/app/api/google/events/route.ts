import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getGoogleAccessToken, GoogleNotConnectedError } from "@/lib/google";

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

/** "2026-11-05T15:00:00+01:00" -> "2026-11-05T15:00" (ora di Roma) */
function toRomeLocal(dt: string): string {
  return new Date(dt).toLocaleString("sv-SE", { timeZone: "Europe/Rome" }).replace(" ", "T").slice(0, 16);
}

/** Legge (solo lettura) gli impegni del calendario Google scelto in Impostazioni. */
export async function GET(req: Request) {
  const { supabase, error } = await requireUser();
  if (error) return error;
  const url = new URL(req.url);
  const timeMin = url.searchParams.get("timeMin");
  const timeMax = url.searchParams.get("timeMax");
  if (!timeMin || !timeMax) return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });

  const { data: settings } = await supabase.from("settings").select("calendar_id").eq("id", 1).single();
  const calendarId = settings?.calendar_id || "primary";

  try {
    const token = await getGoogleAccessToken();
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
      timeZone: "Europe/Rome",
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "Errore Google Calendar");

    const events = ((json.items ?? []) as GEvent[])
      .filter((e) => e.status !== "cancelled" && (e.start?.dateTime || e.start?.date))
      .map((e) => {
        const allDay = !e.start?.dateTime;
        return {
          id: e.id,
          title: e.summary || "(senza titolo)",
          start: allDay ? `${e.start!.date}T00:00` : toRomeLocal(e.start!.dateTime!),
          end: e.end?.dateTime ? toRomeLocal(e.end.dateTime) : null,
          allDay,
          htmlLink: e.htmlLink ?? null,
          meetLink: e.hangoutLink ?? null,
        };
      });
    return NextResponse.json({ events });
  } catch (e) {
    const status = e instanceof GoogleNotConnectedError ? 409 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status });
  }
}
