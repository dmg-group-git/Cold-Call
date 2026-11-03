import { ThumbsUp, TrendingUp } from "lucide-react";
import type { Analysis } from "@/lib/types";

/** Consigli di Claude sulla chiamata: cosa è andato bene e cosa migliorare. */
export function CallCoaching({ consigli }: { consigli: Analysis["consigli"] | null | undefined }) {
  if (!consigli || (!consigli.bene?.length && !consigli.migliorare?.length)) return null;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {consigli.bene?.length > 0 && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
            <ThumbsUp size={13} /> Cosa è andato bene
          </div>
          <ul className="list-disc space-y-1 pl-4 text-slate-700">
            {consigli.bene.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {consigli.migliorare?.length > 0 && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-3 text-sm">
          <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">
            <TrendingUp size={13} /> Da migliorare la prossima volta
          </div>
          <ul className="list-disc space-y-1 pl-4 text-slate-700">
            {consigli.migliorare.map((x, i) => (
              <li key={i}>{x}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
