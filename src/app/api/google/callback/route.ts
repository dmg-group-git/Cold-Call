import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirectUri } from "@/lib/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (msg: string) =>
    NextResponse.redirect(`${url.origin}/impostazioni?google=${encodeURIComponent(msg)}`);

  const { error } = await requireUser();
  if (error) return NextResponse.redirect(`${url.origin}/login`);

  const cookieStore = await cookies();
  if (!url.searchParams.get("state") || url.searchParams.get("state") !== cookieStore.get("g_state")?.value)
    return back("errore_sicurezza");
  const code = url.searchParams.get("code");
  if (!code) return back(url.searchParams.get("error") || "annullato");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(url.origin),
      grant_type: "authorization_code",
    }),
  });
  const tok = await res.json();
  if (!res.ok || !tok.refresh_token) return back(tok.error || "nessun_refresh_token");

  let email: string | null = null;
  try {
    const payload = JSON.parse(Buffer.from(tok.id_token.split(".")[1], "base64url").toString());
    email = payload.email ?? null;
  } catch {}

  const admin = createAdminClient();
  await admin.from("google_tokens").upsert({
    id: 1,
    refresh_token: tok.refresh_token,
    access_token: tok.access_token,
    expires_at: new Date(Date.now() + tok.expires_in * 1000).toISOString(),
  });
  await admin.from("settings").update({ google_email: email }).eq("id", 1);
  return back("ok");
}
