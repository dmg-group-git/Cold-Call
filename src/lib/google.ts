import { createAdminClient } from "@/lib/supabase/admin";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export function redirectUri(origin: string) {
  return `${process.env.APP_URL || origin}/api/google/callback`;
}

export class GoogleNotConnectedError extends Error {}

/** Restituisce un access token valido, rinnovandolo se scaduto. */
export async function getGoogleAccessToken(): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin.from("google_tokens").select("*").eq("id", 1).maybeSingle();
  if (!data?.refresh_token) throw new GoogleNotConnectedError("Google Calendar non collegato");

  if (data.access_token && data.expires_at && new Date(data.expires_at).getTime() > Date.now() + 60_000) {
    return data.access_token;
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (!res.ok) {
    if (json.error === "invalid_grant") {
      await admin.from("google_tokens").delete().eq("id", 1);
      await admin.from("settings").update({ google_email: null }).eq("id", 1);
      throw new GoogleNotConnectedError(
        "Il collegamento a Google è scaduto: ricollegalo da Impostazioni",
      );
    }
    throw new Error(json.error_description || "Errore Google");
  }
  await admin
    .from("google_tokens")
    .update({
      access_token: json.access_token,
      expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    })
    .eq("id", 1);
  return json.access_token;
}
