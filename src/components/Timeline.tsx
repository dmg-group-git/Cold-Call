"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Analysis, Interaction } from "@/lib/types";
import { OUTCOMES } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/utils";
import { CalendarDays, ChevronDown, MessageCircle, Phone, StickyNote, type LucideIcon } from "lucide-react";
import { Collapse, IconTile, type Tone } from "./ui";
import { CallCoaching } from "./CallCoaching";

const ICON: Record<string, { icon: LucideIcon; tone: Tone; label: string }> = {
  call: { icon: Phone, tone: "green", label: "Chiamata" },
  whatsapp: { icon: MessageCircle, tone: "teal", label: "WhatsApp" },
  note: { icon: StickyNote, tone: "orange", label: "Nota" },
  event: { icon: CalendarDays, tone: "red", label: "Appuntamento" },
};

export function Timeline({ items }: { items: Interaction[] }) {
  if (!items.length)
    return (
      <p className="rounded-2xl bg-[#767680]/[0.06] p-6 text-center text-[15px] text-slate-500">Nessuna attività ancora.</p>
    );
  return (
    <ol className="overflow-hidden rounded-2xl bg-[#767680]/[0.06]">
      {items.map((it, i) => (
        <TimelineItem key={it.id} it={it} first={i === 0} />
      ))}
    </ol>
  );
}

/** Ogni attività è una riga compatta: si apre al clic per vedere dettagli, trascrizione e audio. */
function TimelineItem({ it, first }: { it: Interaction; first: boolean }) {
  const [open, setOpen] = useState(false);
  const [showT, setShowT] = useState(false);
  const [audio, setAudio] = useState<string | null>(null);
  const outcome = OUTCOMES.find((o) => o.value === it.outcome)?.label;
  const d = (it.data ?? {}) as Record<string, string>;
  const ic = ICON[it.type] ?? ICON.note;
  const consigli = ((it.data ?? {}) as { analysis?: Analysis }).analysis?.consigli;
  const hasConsigli = !!(consigli && (consigli.bene?.length || consigli.migliorare?.length));
  const hasMore =
    hasConsigli ||
    !!it.objections?.length ||
    !!it.next_step ||
    !!it.transcript ||
    (!!it.recording_path && !it.recording_deleted) ||
    (it.type === "event" && !!d.meetLink) ||
    (it.type === "whatsapp" && !!d.text) ||
    (it.summary?.length ?? 0) > 80;

  async function play() {
    if (!it.recording_path) return;
    const { data } = await createClient().storage.from("recordings").createSignedUrl(it.recording_path, 600);
    if (data) setAudio(data.signedUrl);
  }

  return (
    <li className={first ? "" : "border-t border-black/[0.06]"}>
      <button
        type="button"
        onClick={() => hasMore && setOpen(!open)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 px-4 py-3 text-left ${hasMore ? "transition hover:bg-black/[0.02]" : "cursor-default"}`}
      >
        <IconTile icon={ic.icon} tone={ic.tone} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-[15px] text-[#1d1d1f]">{it.summary || ic.label}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-slate-500">
            <span>{formatDateTime(it.created_at)}</span>
            {it.duration_sec != null && <span>· {formatDuration(it.duration_sec)}</span>}
            {outcome && <span>· {outcome}</span>}
            {it.analysis_status === "in_corso" && <span className="text-[#ff9500]">· analisi in corso…</span>}
            {it.analysis_status === "errore" && <span className="text-[#ff3b30]">· analisi non riuscita</span>}
          </div>
        </div>
        {hasMore && (
          <ChevronDown
            size={16}
            className={`shrink-0 text-slate-400 transition-transform duration-300 ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>
      {hasMore && (
        <Collapse open={open}>
          <div className="space-y-2 px-4 pb-4 pl-14 text-[14px] text-slate-600">
            {(it.summary?.length ?? 0) > 80 && <p className="text-[#1d1d1f]">{it.summary}</p>}
            {!!it.objections?.length && (
              <p>
                <b className="font-medium text-[#1d1d1f]">Obiezioni:</b> {it.objections.join("; ")}
              </p>
            )}
            {it.next_step && (
              <p>
                <b className="font-medium text-[#1d1d1f]">Prossimo passo:</b> {it.next_step}
              </p>
            )}
            {hasConsigli && <CallCoaching consigli={consigli} />}
            {it.type === "event" && d.meetLink && (
              <a className="block font-medium text-[#007aff] hover:underline" href={d.meetLink} target="_blank">
                Link Google Meet
              </a>
            )}
            {it.type === "whatsapp" && d.text && (
              <p className="whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-[#d9fdd3] p-3 text-[#1d1d1f]">{d.text}</p>
            )}
            <div className="flex flex-wrap gap-4 pt-1 text-[13px]">
              {it.transcript && (
                <button className="font-medium text-[#007aff] hover:underline" onClick={() => setShowT((v) => !v)}>
                  {showT ? "Nascondi trascrizione" : "Trascrizione"}
                </button>
              )}
              {it.recording_path && !it.recording_deleted && !audio && (
                <button className="font-medium text-[#007aff] hover:underline" onClick={play}>
                  Ascolta registrazione
                </button>
              )}
              {it.recording_deleted && <span className="text-slate-400">audio cancellato (30 giorni)</span>}
            </div>
            {audio && <audio className="w-full" controls src={audio} autoPlay />}
            {showT && (
              <pre className="whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-[13px] leading-relaxed text-slate-700">
                {it.transcript}
              </pre>
            )}
          </div>
        </Collapse>
      )}
    </li>
  );
}
