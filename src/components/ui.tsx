"use client";
import { ReactNode, useEffect, useId, useState } from "react";
import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Info, X, type LucideIcon } from "lucide-react";
import { STATUSES, type LeadStatus } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Finestra (su iPhone sale dal basso come un "foglio")               */
/* ------------------------------------------------------------------ */
export function Modal({
  open,
  title,
  icon: Icon,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  icon?: LucideIcon;
  onClose: () => void;
  children: ReactNode;
}) {
  // chiudi con il tasto Esc
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-black/25 p-0 backdrop-blur-xl sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-sheet sm:animate-pop-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] bg-white/95 p-6 pb-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] sm:rounded-[28px] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto -mt-2 mb-4 h-1.5 w-10 rounded-full bg-black/10 sm:hidden" />
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
                <Icon size={20} />
              </span>
            )}
            <h2 className="text-lg font-semibold text-[#1d1d1f]">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-slate-500 transition hover:bg-black/10 hover:text-slate-800"
            aria-label="Chiudi"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: LeadStatus }) {
  const s = STATUSES.find((x) => x.value === status);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${s?.color ?? "bg-slate-500/10 text-slate-600"}`}
    >
      {s?.label ?? status}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Card: bianca, molto arrotondata, ombra morbida, niente bordo        */
/* ------------------------------------------------------------------ */
export const cardBase =
  "rounded-[22px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_28px_-6px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.03]";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${cardBase} ${/(^|\s)p-0(\s|$)/.test(className) ? "" : "p-6"} ${className}`}>{children}</div>
  );
}

export function IconTile({ icon: Icon, tone = "blue", size = "md" }: { icon: LucideIcon; tone?: Tone; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "h-7 w-7 rounded-lg" : "h-9 w-9 rounded-[10px]";
  return (
    <span className={`flex shrink-0 items-center justify-center text-white ${sz} ${TONE[tone]}`}>
      <Icon size={size === "sm" ? 15 : 18} strokeWidth={2.2} />
    </span>
  );
}

export type Tone = "blue" | "green" | "orange" | "red" | "purple" | "pink" | "gray" | "teal" | "indigo";
export const TONE: Record<Tone, string> = {
  blue: "bg-[#007aff]",
  green: "bg-[#34c759]",
  orange: "bg-[#ff9500]",
  red: "bg-[#ff3b30]",
  purple: "bg-[#af52de]",
  pink: "bg-[#ff2d55]",
  gray: "bg-[#8e8e93]",
  teal: "bg-[#30b0c7]",
  indigo: "bg-[#5856d6]",
};

export function CardTitle({
  icon: Icon,
  tone = "blue",
  children,
  sub,
}: {
  icon?: LucideIcon;
  tone?: Tone;
  children: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center gap-3">
      {Icon && <IconTile icon={Icon} tone={tone} />}
      <div>
        <h2 className="text-[17px] font-semibold text-[#1d1d1f]">{children}</h2>
        {sub && <p className="text-[13px] text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tendina animata                                                     */
/* ------------------------------------------------------------------ */
export function Collapse({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className="collapse-grid" data-open={open} aria-hidden={!open}>
      <div>{children}</div>
    </div>
  );
}

/** Ricorda se una tendina è aperta o chiusa (per ogni utente, sul suo browser). */
export function usePersistentOpen(key: string, initial: boolean) {
  const [open, setOpen] = useState(initial);
  useEffect(() => {
    try {
      const v = localStorage.getItem(`cc-open:${key}`);
      if (v !== null) setOpen(v === "1");
    } catch {}
  }, [key]);
  const set = (v: boolean) => {
    setOpen(v);
    try {
      localStorage.setItem(`cc-open:${key}`, v ? "1" : "0");
    } catch {}
  };
  return [open, set] as const;
}

/**
 * Card richiudibile: titolo sempre visibile, contenuto a tendina.
 * `summary` è la riga riassuntiva mostrata quando è chiusa.
 */
export function CollapsibleCard({
  title,
  sub,
  summary,
  icon,
  tone,
  open,
  onToggle,
  children,
  className = "",
  right,
}: {
  title: ReactNode;
  sub?: ReactNode;
  summary?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  open: boolean;
  onToggle: (v: boolean) => void;
  children: ReactNode;
  className?: string;
  right?: ReactNode;
}) {
  const id = useId();
  return (
    <div className={`${cardBase} ${className}`}>
      <div className="flex items-center gap-3 px-6 py-4">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          onClick={() => onToggle(!open)}
          aria-expanded={open}
          aria-controls={id}
        >
          {icon && <IconTile icon={icon} tone={tone} />}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-semibold text-[#1d1d1f]">{title}</h2>
            {(open ? sub : summary ?? sub) && (
              <p className="truncate text-[13px] text-slate-500">{open ? sub : summary ?? sub}</p>
            )}
          </div>
        </button>
        {right}
        <button
          type="button"
          onClick={() => onToggle(!open)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/[0.04] text-slate-500 transition hover:bg-black/[0.08]"
          aria-label={open ? "Chiudi" : "Apri"}
        >
          <ChevronDown size={16} strokeWidth={2.5} className={`transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      <Collapse open={open}>
        <div id={id} className="px-6 pb-6">
          {children}
        </div>
      </Collapse>
    </div>
  );
}

/** Riga stile "Impostazioni di iPhone" che si apre a tendina. */
export function SettingsRow({
  icon,
  tone,
  title,
  value,
  open,
  onToggle,
  children,
  last,
}: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  value?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-black/[0.02] active:bg-black/[0.04]"
      >
        <IconTile icon={icon} tone={tone} size="sm" />
        <span className="flex-1 text-[15px] text-[#1d1d1f]">{title}</span>
        {value && <span className="max-w-[45%] truncate text-[15px] text-slate-400">{value}</span>}
        <ChevronRight
          size={18}
          className={`shrink-0 text-slate-300 transition-transform duration-300 ${open ? "rotate-90" : ""}`}
        />
      </button>
      <Collapse open={open}>
        <div className="px-4 pb-5 pt-1 sm:pl-14">{children}</div>
      </Collapse>
      {!last && <div className="ml-14 h-px bg-black/[0.06]" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Interruttore a levetta (al posto delle caselle)                     */
/* ------------------------------------------------------------------ */
export function Toggle({
  checked,
  onChange,
  label: text,
  hint,
  icon: Icon,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  disabled?: boolean;
}) {
  return (
    <label className={`flex cursor-pointer select-none items-center gap-3 ${disabled ? "opacity-50" : ""}`}>
      {(text || Icon) && (
        <span className="flex min-w-0 flex-1 items-center gap-2 text-[15px] text-[#1d1d1f]">
          {Icon && <Icon size={16} className="shrink-0 text-slate-400" />}
          <span className="min-w-0">
            {text}
            {hint && <span className="block truncate text-xs text-slate-400">{hint}</span>}
          </span>
        </span>
      )}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-300 ${
          checked ? "bg-[#34c759]" : "bg-[#e9e9eb]"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            checked ? "translate-x-[22px]" : "translate-x-[2px]"
          }`}
        />
      </button>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Controllo a segmenti (come le schede di iOS)                        */
/* ------------------------------------------------------------------ */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
}) {
  return (
    <div className="inline-flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-[#767680]/[0.12] p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-[8px] px-3.5 py-1.5 text-[13px] font-medium transition-all duration-200 ${
            value === o.value ? "bg-white text-[#1d1d1f] shadow-[0_3px_8px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.04)]" : "text-slate-600 hover:text-[#1d1d1f]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function PageTitle({ children, sub, actions }: { children: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[34px] font-bold leading-tight tracking-tight text-[#1d1d1f]">{children}</h1>
        {sub && <p className="mt-1 text-[15px] text-slate-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Alert({
  tone = "info",
  children,
  className = "",
}: {
  tone?: "info" | "success" | "error" | "warning";
  children: ReactNode;
  className?: string;
}) {
  const styles = {
    info: "bg-[#007aff]/[0.08] text-[#004a99]",
    success: "bg-[#34c759]/[0.12] text-[#1e7a36]",
    error: "bg-[#ff3b30]/[0.08] text-[#b3261e]",
    warning: "bg-[#ff9500]/[0.12] text-[#8a5000]",
  }[tone];
  const Icon = { info: Info, success: CheckCircle2, error: AlertCircle, warning: AlertCircle }[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-2xl p-3.5 text-sm ${styles} ${className}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-black/10 border-t-brand-600 ${className}`}
    />
  );
}

export function Loading({ text = "Carico…" }: { text?: string }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sm text-slate-500">
      <Spinner /> {text}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-[20px] bg-black/[0.04] text-slate-400">
        <Icon size={30} strokeWidth={1.75} />
      </span>
      <h3 className="text-[17px] font-semibold text-[#1d1d1f]">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-[15px] text-slate-500">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Avatar stile app Contatti: iniziali bianche su grigio sfumato. */
export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" | "xl" }) {
  const initials =
    name
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 || /\d/.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const sz = {
    sm: "h-8 w-8 text-[13px]",
    md: "h-10 w-10 text-[15px]",
    lg: "h-14 w-14 text-xl",
    xl: "h-20 w-20 text-[28px]",
  }[size];
  return (
    <span
      className={`flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-b from-[#a5abb6] to-[#858993] font-semibold text-white ${sz}`}
    >
      {initials}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Pulsanti: pieni, a pillola, senza gradiente; "affondano" al tocco   */
/* ------------------------------------------------------------------ */
export const btn =
  "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[15px] font-medium transition-all duration-200 ease-out active:scale-[0.96] active:opacity-80 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100";
export const btnPrimary = `${btn} bg-[#007aff] text-white hover:bg-[#0071eb]`;
export const btnSecondary = `${btn} bg-black/[0.05] text-[#1d1d1f] hover:bg-black/[0.08]`;
export const btnGreen = `${btn} bg-[#34c759] text-white hover:bg-[#2fb850]`;
export const btnRed = `${btn} bg-[#ff3b30] text-white hover:bg-[#ec352b]`;
export const btnGhost = `${btn} text-[#007aff] hover:bg-[#007aff]/[0.08]`;
export const btnLg = "px-6 py-3.5 text-[17px] font-semibold";
export const input =
  "w-full rounded-xl border-0 bg-[#767680]/[0.08] px-3.5 py-2.5 text-[15px] text-[#1d1d1f] transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-brand-500/20";
export const label = "mb-1.5 block text-[13px] font-medium text-slate-500";
export const link = "font-medium text-[#007aff] hover:underline";
