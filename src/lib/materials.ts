import type { SupabaseClient } from "@supabase/supabase-js";
import type { Material } from "./types";

/** Limite del piano gratuito di Supabase per singolo file. */
export const MAX_FILE_MB = 50;

/** Carica un file (PDF, documento o video) nei Materiali e restituisce il materiale creato. */
export async function uploadMaterialFile(supabase: SupabaseClient, file: File, title?: string): Promise<Material> {
  if (file.size > MAX_FILE_MB * 1024 * 1024)
    throw new Error(`Il file supera ${MAX_FILE_MB} MB. Per i video grandi usa un link YouTube (non in elenco) o Vimeo.`);
  const kind: Material["kind"] =
    file.type === "application/pdf" ? "pdf" : file.type.startsWith("video/") ? "video" : "file";
  const safe = file.name.replace(/[^\w.-]+/g, "_");
  const storage_path = `${Date.now()}-${safe}`;
  const { error: upErr } = await supabase.storage
    .from("materials")
    .upload(storage_path, file, { contentType: file.type || "application/octet-stream" });
  if (upErr) throw new Error(upErr.message);
  const url = supabase.storage.from("materials").getPublicUrl(storage_path).data.publicUrl;
  const { data, error } = await supabase
    .from("materials")
    .insert({ title: (title || file.name).trim(), kind, url, storage_path })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Material;
}
