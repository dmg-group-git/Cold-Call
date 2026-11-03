import { Flame } from "lucide-react";
import type { Lead } from "@/lib/types";
import { leadPriority } from "@/lib/priority";

const STYLE = {
  alta: "bg-rose-50 text-rose-700 ring-rose-200",
  media: "bg-amber-50 text-amber-700 ring-amber-200",
  bassa: "bg-slate-100 text-slate-600 ring-slate-200",
} as const;

/** "Priorità alta · senza sito, cellulare" */
export function PriorityBadge({ lead, showReasons = true }: { lead: Lead; showReasons?: boolean }) {
  const p = leadPriority(lead);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${STYLE[p.level]}`}
      title={p.reasons.join(", ")}
    >
      <Flame size={11} /> Priorità {p.level}
      {showReasons && p.reasons.length > 0 && <span className="font-normal opacity-80">· {p.reasons.join(", ")}</span>}
    </span>
  );
}
