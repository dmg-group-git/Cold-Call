import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { GOOGLE_SCOPES, redirectUri } from "@/lib/google";

export async function GET(req: Request) {
  const { error } = await requireUser();
  if (error) return error;
  if (!process.env.GOOGLE_CLIENT_ID)
    return NextResponse.json({ error: "Manca GOOGLE_CLIENT_ID" }, { status: 500 });

  const origin = new URL(req.url).origin;
  const state = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("g_state", state, { httpOnly: true, secure: true, maxAge: 600, path: "/" });
  return res;
}
