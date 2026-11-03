"use client";
/** Anteprima in stile chat WhatsApp */
export function WaPreview({ text, className = "" }: { text: string; className?: string }) {
  const time = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  return (
    <div className={`wa-bg overflow-y-auto rounded-xl border border-slate-200 p-4 ${className || "h-80"}`}>
      <div className="ml-auto max-w-[88%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 pb-1.5 pt-2 text-[14.5px] leading-snug text-slate-900 shadow-sm">
        <div className="whitespace-pre-wrap break-words">
          {text.trim() ? text : <span className="italic text-slate-400">Il messaggio comparirà qui…</span>}
        </div>
        <div className="mt-1 flex items-center justify-end gap-1 text-[11px] text-slate-500">
          {time}
          <svg width="16" height="11" viewBox="0 0 16 11" className="text-sky-500" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 6l3 3 6-7" />
            <path d="M6 6l3 3 6-7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
