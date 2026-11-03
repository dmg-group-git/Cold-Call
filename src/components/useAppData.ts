"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Material, Script, Settings } from "@/lib/types";

/** Carica impostazioni, script e materiali (usati in più pagine). */
export function useAppData() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const supabase = createClient();
    const [s, sc, m] = await Promise.all([
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
      supabase.from("scripts").select("*").order("kind"),
      supabase.from("materials").select("*").order("created_at", { ascending: false }),
    ]);
    setSettings(s.data as Settings | null);
    setScripts((sc.data as Script[]) ?? []);
    setMaterials((m.data as Material[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { settings, scripts, materials, loading, reload };
}
