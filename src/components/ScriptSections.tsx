"use client";
import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapse } from "./ui";

export interface ScriptSection {
  title: string;
  body: string;
}

/**
 * Divide lo script in sezioni.
 * Una riga che inizia con "#" (es. "# Obiezioni") oppure una riga corta che finisce con ":"
 * (es. "Obiezioni:") apre una nuova sezione. Se non ci sono titoli, ogni paragrafo è una sezione.
 */
export function parseScript(text: string): ScriptSection[] {
  const lines = text.split("\n");
  const isHeading = (l: string) => /^\s*#{1,3}\s+\S/.test(l) || (/^\s*[^\s].{0,38}:\s*$/.test(l) && !/https?:/.test(l));
  if (lines.some(isHeading)) {
    const out: ScriptSection[] = [];
    let cur: ScriptSection | null = null;
    for (const l of lines) {
      if (isHeading(l)) {
        if (cur) out.push(cur);
        cur = { title: l.replace(/^\s*#{1,3}\s+/, "").replace(/:\s*$/, "").trim(), body: "" };
      } else {
        if (!cur) cur = { title: "Introduzione", body: "" };
        cur.body += (cur.body ? "\n" : "") + l;
      }
    }
    if (cur) out.push(cur);
    return out.map((x) => ({ ...x, body: x.body.trim() })).filter((x) => x.body || x.title);
  }
  const paras = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paras.map((p) => {
    const words = p.replace(/\s+/g, " ").split(" ");
    return { title: words.slice(0, 6).join(" ") + (words.length > 6 ? "…" : ""), body: p };
  });
}

export function ScriptSections({ text, large }: { text: string; large?: boolean }) {
  const sections = useMemo(() => parseScript(text), [text]);
  // la prima sezione aperta, le altre chiuse
  const [open, setOpen] = useState<Set<number>>(() => new Set([0]));
  const allOpen = open.size === sections.length;

  if (sections.length <= 1)
    return (
      <div className={`whitespace-pre-wrap text-[#1d1d1f] ${large ? "text-[20px] leading-9" : "text-[17px] leading-8"}`}>
        {text}
      </div>
    );

  const toggle = (i: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(i)) n.delete(i);
      else n.add(i);
      return n;
    });

  return (
    <div>
      <div className="-mt-12 mb-4 flex justify-end">
        <button
          className="text-[13px] font-medium text-[#007aff] hover:underline"
          onClick={() => setOpen(allOpen ? new Set() : new Set(sections.map((_, i) => i)))}
        >
          {allOpen ? "Chiudi tutto" : "Apri tutto"}
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl bg-[#767680]/[0.06]">
        {sections.map((sec, i) => {
          const isOpen = open.has(i);
          return (
            <div key={i} className={i > 0 ? "border-t border-black/[0.06]" : ""}>
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.02]"
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${
                    isOpen ? "bg-[#007aff] text-white" : "bg-black/[0.06] text-slate-500"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex-1 truncate text-[15px] font-semibold text-[#1d1d1f]">{sec.title}</span>
                <ChevronDown
                  size={16}
                  className={`shrink-0 text-slate-400 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              <Collapse open={isOpen}>
                <div
                  className={`whitespace-pre-wrap px-4 pb-4 pl-[52px] text-[#1d1d1f] ${
                    large ? "text-[20px] leading-9" : "text-[17px] leading-8"
                  }`}
                >
                  {sec.body}
                </div>
              </Collapse>
            </div>
          );
        })}
      </div>
    </div>
  );
}
