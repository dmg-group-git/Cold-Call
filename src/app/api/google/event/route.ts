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

/** Cancella un evento da Google Calendar (se c'è). 404/410 = già cancellato: va bene lo stesso. */
async function deleteGoogleEvent(token: string, calendarId: string, eventId: string) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error?.message || "Errore Google Calendar");
  }
}

/**
 * Elimina un appuntamento dal calendario (SOLO dopo conferma nel sito).
 * kind "videocall": interactionId -> cancella evento Google + riga nella scheda del lead
 * kind "richiamata": leadId + start -> toglie la richiamata dal lead (+ evento Google se c'è)
 * kind "google": eventId -> cancella l'evento da Google Calendar
 */
export async function DELETE(req: Request) {
  const { supabase, error } = await requireUser();
  if (error) return error;
  const { kind, interactionId, leadId, start, eventId } = await req.json();

  const { data: settings } = await supabase.from("settings").select("calendar_id").eq("id", 1).single();
  const calendarId = settings?.calendar_id || "primary";

  try {
    // eventi Google da cancellare + righe "evento" del sito da togliere
    const googleIds: string[] = [];
    const rowIds: string[] = [];
    // per lasciare traccia nella scheda del lead
    let noteLead: string | null = kind === "richiamata" ? leadId : null;
    let noteStart: string | null = start ?? null;

    if (kind === "videocall") {
      if (!interactionId) return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
      const { data: row } = await supabase.from("interactions").select("id, lead_id, data").eq("id", interactionId).single();
      if (!row) return NextResponse.json({ error: "Appuntamento non trovato" }, { status: 404 });
      if (row.data?.eventId) googleIds.push(row.data.eventId);
      rowIds.push(row.id);
      noteLead = row.lead_id;
      noteStart = row.data?.start ?? null;
    } else if (kind === "richiamata") {
      if (!leadId) return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
      const { data: rows } = await supabase
        .from("interactions")
        .select("id, data")
        .eq("lead_id", leadId)
        .eq("type", "event")
        .eq("data->>kind", "richiamata");
      for (const r of rows ?? []) {
        if (start && r.data?.start !== start) continue;
        if (r.data?.eventId) googleIds.push(r.data.eventId);
        rowIds.push(r.id);
      }
    } else if (kind === "google") {
      if (!eventId) return NextResponse.json({ error: "Dati mancanti" }, { status: 400 });
      googleIds.push(eventId);
    } else {
      return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });
    }

    if (googleIds.length) {
      const token = await getGoogleAccessToken();
      for (const id of googleIds) await deleteGoogleEvent(token, calendarId, id);
    }
    if (rowIds.length) await supabase.from("interactions").delete().in("id", rowIds);
    if (kind === "richiamata")
      await supabase
        .from("leads")
        .update({ next_action_at: null, updated_at: new Date().toISOString() })
        .eq("id", leadId);
    if (noteLead)
      await supabase.from("interactions").insert({
        lead_id: noteLead,
        type: "note",
        summary: `${kind === "videocall" ? "Videocall" : "Richiamata"}${noteStart ? ` del ${noteStart.replace("T", " alle ")}` : ""} eliminata dal calendario`,
      });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e instanceof GoogleNotConnectedError ? 409 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status });
  }
}
