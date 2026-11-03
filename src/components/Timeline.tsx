"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Interaction } from "@/lib/types";
import { OUTCOMES } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { CalendarDays, MessageCircle, Phone, StickyNote, type LucideIcon } from "lucide-react";

const ICON: Record<string, { icon: LucideIcon; color: string }> = {
  call: { icon: Phone, color: "bg-brand-50 text-brand-600" },
  whatsapp: { icon: MessageCircle, color: "bg-emerald-50 text-emerald-600" },
  note: { icon: StickyNote, color: "bg-amber-50 text-amber-600" },
  event: { icon: CalendarDays, color: "bg-sky-50 text-sky-600" },
};

export function Timeline({ items }: { items: Interaction[] }) {
  if (!items.length)
    return <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">Nessuna attività ancora.</p>;
  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-4 before:top-2 before:w-px before:bg-slate-200">
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

  const ic = ICON[it.type] ?? ICON.note;
  return (
    <li className="relative flex gap-3 text-sm">
      <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${ic.color}`}>
        <ic.icon size={15} />
      </span>
      <div className="min-w-0 flex-1 rounded-xl border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="font-medium text-slate-700">{formatDateTime(it.created_at)}</span>
        {it.duration_sec != null && <span>· {formatDuration(it.duration_sec)}</span>}
        {outcome && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{outcome}</span>}
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
        <a className="mt-1 block font-medium text-brand-600 hover:underline" href={d.meetLink} target="_blank">
          Link Google Meet
        </a>
      )}
      {it.type === "whatsapp" && d.text && <p className="mt-1 whitespace-pre-wrap text-slate-600">{d.text}</p>}
      <div className="mt-2 flex gap-3 text-xs">
        {it.transcript && (
          <button className="font-medium text-brand-600 hover:underline" onClick={() => setShowT((v) => !v)}>
            {showT ? "Nascondi trascrizione" : "Trascrizione"}
          </button>
        )}
        {it.recording_path && !it.recording_deleted && !audio && (
          <button className="font-medium text-brand-600 hover:underline" onClick={play}>
            Ascolta registrazione
          </button>
        )}
        {it.recording_deleted && <span className="text-slate-400">audio cancellato (30 giorni)</span>}
      </div>
      {audio && <audio className="mt-2 w-full" controls src={audio} autoPlay />}
      {showT && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-700">{it.transcript}</pre>}
      </div>
    </li>
  );
}
