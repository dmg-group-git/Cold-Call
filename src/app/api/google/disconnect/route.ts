import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const { error } = await requireUser();
  if (error) return error;
  const admin = createAdminClient();
  const { data } = await admin.from("google_tokens").select("refresh_token").eq("id", 1).maybeSingle();
  if (data?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${data.refresh_token}`, { method: "POST" }).catch(() => {});
  }
  await admin.from("google_tokens").delete().eq("id", 1);
  await admin.from("settings").update({ google_email: null }).eq("id", 1);
  return NextResponse.json({ ok: true });
}
