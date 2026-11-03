import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getGoogleAccessToken, GoogleNotConnectedError } from "@/lib/google";
import { addMinutesLocal, romeLocalToIso } from "@/lib/utils";

/**
 * Crea un evento su Google Calendar (SOLO dopo conferma nel sito).
 * kind: "videocall" (con link Meet e invito al lead) | "richiamata" (promemoria per te)
 */
export async function POST(req: Request) {
  const { supabase, error } = await requireUser();
  if (error) return error;
  const { leadId, kind, title, start, minutes, description, attendeeEmail } = await req.json();
  if (!leadId || !start || !title)
    return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });

  const { data: settings } = await supabase.from("settings").select("calendar_id").eq("id", 1).single();
  const calendarId = settings?.calendar_id || "primary";
  const end = addMinutesLocal(start, Number(minutes) || 30);

  const event: Record<string, unknown> = {
    summary: title,
    description: description || "",
    start: { dateTime: `${start}:00`, timeZone: "Europe/Rome" },
    end: { dateTime: `${end}:00`, timeZone: "Europe/Rome" },
    reminders: { useDefault: true },
  };
  if (kind === "videocall") {
    event.conferenceData = {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } },
    };
    if (attendeeEmail) event.attendees = [{ email: attendeeEmail }];
  }

  try {
    const token = await getGoogleAccessToken();
    const params = new URLSearchParams({
      conferenceDataVersion: "1",
      sendUpdates: kind === "videocall" && attendeeEmail ? "all" : "none",
    });
    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(event),
      },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "Errore Google Calendar");

    const meetLink: string | null = json.hangoutLink ?? null;
    await supabase.from("interactions").insert({
      lead_id: leadId,
      type: "event",
      summary: `${kind === "videocall" ? "Videocall" : "Richiamata"} fissata per il ${start.replace("T", " alle ")}`,
      data: { kind, start, end, eventId: json.id, htmlLink: json.htmlLink, meetLink, attendeeEmail },
    });

    // aggiorna il lead
    const leadUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (kind === "videocall") {
      leadUpdate.status = "demo";
      if (attendeeEmail) leadUpdate.email = attendeeEmail;
    } else {
      leadUpdate.next_action_at = romeLocalToIso(start);
    }
    await supabase.from("leads").update(leadUpdate).eq("id", leadId);

    return NextResponse.json({ ok: true, htmlLink: json.htmlLink, meetLink });
  } catch (e) {
    const status = e instanceof GoogleNotConnectedError ? 409 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status });
  }
}
