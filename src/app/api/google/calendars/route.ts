import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getGoogleAccessToken, GoogleNotConnectedError } from "@/lib/google";

export async function GET() {
  const { error } = await requireUser();
  if (error) return error;
  try {
    const token = await getGoogleAccessToken();
    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer",
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || "Errore Google");
    return NextResponse.json({
      calendars: (json.items ?? []).map((c: { id: string; summary: string; primary?: boolean }) => ({
        id: c.primary ? "primary" : c.id,
        name: c.summary + (c.primary ? " (principale)" : ""),
      })),
    });
  } catch (e) {
    const status = e instanceof GoogleNotConnectedError ? 409 : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Errore" }, { status });
  }
}
