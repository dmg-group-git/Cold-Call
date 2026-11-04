import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Elimina uno o più lead dal CRM, insieme alle loro registrazioni audio.
 * Lo storico (tabella lead_history) li ricorda comunque, così la Ricerca lead li segna come «già stato nel CRM».
 */
export async function deleteLeads(supabase: SupabaseClient, ids: string[]) {
  if (!ids.length) return null;
  const { data: recs } = await supabase
    .from("interactions")
    .select("recording_path")
    .in("lead_id", ids)
    .eq("recording_deleted", false)
    .not("recording_path", "is", null);
  const paths = (recs ?? []).map((r) => r.recording_path as string).filter(Boolean);
  if (paths.length) await supabase.storage.from("recordings").remove(paths);
  const { error } = await supabase.from("leads").delete().in("id", ids);
  return error;
}
