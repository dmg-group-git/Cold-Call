"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Interaction } from "@/lib/types";
import { OUTCOMES } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/utils";

const ICON: Record<string, string> = { call: "📞", whatsapp: "💬", note: "📝", event: "📅" };

export function Timeline({ items }: { items: Interaction[] }) {
  if (!items.length) return <p className="text-sm text-slate-500">Nessuna attività ancora.</p>;
  return (
    <ol className="space-y-3">
      {items.map((it) => (
        <TimelineItem key={it.id} it={it} />
      ))}
    </ol>
  );
}

function TimelineItem({ it }: { it: Interaction }) {
  const [showT, setShowT] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const outcome = OUTCOMES.find((o) => o.value === it.outcome)?.label;
  const d = (it.data ?? {}) as Record<string, string>;

  async function play() {
    if (!it.recording_path) return;
    const { data } = await createClient().storage.from("recordings").createSignedUrl(it.recording_path, 600);
    if (data) setAudio(data.signedUrl);
  }

  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-slate-500">
        <span>{ICON[it.type]}</span>
        <span>{formatDateTime(it.created_at)}</span>
        {it.duration_sec != null && <span>· {formatDuration(it.duration_sec)}</span>}
        {outcome && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">{outcome}</span>}
        {it.analysis_status === "in_corso" && <span className="text-amber-600">analisi in corso…</span>}
        {it.analysis_status === "errore" && <span className="text-red-600">analisi non riuscita</span>}
      </div>
      {it.summary && <p className="mt-1 text-slate-800">{it.summary}</p>}
      {!!it.objections?.length && (
        <p className="mt-1 text-slate-600">
          <b>Obiezioni:</b> {it.objections.join("; ")}
        </p>
      )}
      {it.next_step && (
        <p className="mt-1 text-slate-600">
          <b>Prossimo passo:</b> {it.next_step}
        </p>
      )}
      {it.type === "event" && d.meetLink && (
        <a className="mt-1 block text-blue-600 underline" href={d.meetLink} target="_blank">
          Link Google Meet
        </a>
      )}
      {it.type === "whatsapp" && d.text && <p className="mt-1 whitespace-pre-wrap text-slate-600">{d.text}</p>}
      <div className="mt-2 flex gap-3 text-xs">
        {it.transcript && (
          <button className="text-blue-600 underline" onClick={() => setShowT((v) => !v)}>
            {showT ? "Nascondi trascrizione" : "Trascrizione"}
          </button>
        )}
        {it.recording_path && !it.recording_deleted && !audio && (
          <button className="text-blue-600 underline" onClick={play}>
            Ascolta registrazione
          </button>
        )}
        {it.recording_deleted && <span className="text-slate-400">audio cancellato (30 giorni)</span>}
      </div>
      {audio && <audio className="mt-2 w-full" controls src={audio} autoPlay />}
      {showT && <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans text-xs text-slate-700">{it.transcript}</pre>}
    </li>
  );
}
