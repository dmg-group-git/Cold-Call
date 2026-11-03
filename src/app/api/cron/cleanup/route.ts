import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Ogni giorno (Vercel Cron): cancella gli audio più vecchi di 30 giorni. */
export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }
  const admin = createAdminClient();
  const limit = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const { data: old } = await admin
    .from("interactions")
    .select("id, recording_path")
    .not("recording_path", "is", null)
    .eq("recording_deleted", false)
    .lt("created_at", limit)
    .limit(500);

  const paths = (old ?? []).map((o) => o.recording_path as string);
  if (paths.length) {
    await admin.storage.from("recordings").remove(paths);
    await admin
      .from("interactions")
      .update({ recording_deleted: true })
      .in("id", (old ?? []).map((o) => o.id));
  }
  // file di prova rimasti
  const { data: tests } = await admin.storage.from("recordings").list("test", { limit: 1000 });
  if (tests?.length) await admin.storage.from("recordings").remove(tests.map((t) => `test/${t.name}`));

  return NextResponse.json({ deleted: paths.length });
}
