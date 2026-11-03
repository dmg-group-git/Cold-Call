"use client";
import { ReactNode, useEffect } from "react";
import { AlertCircle, CheckCircle2, Info, X, type LucideIcon } from "lucide-react";
import { STATUSES, type LeadStatus } from "@/lib/types";

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
      className="animate-fade-in fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-md sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="animate-pop-in max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            {Icon && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon size={20} />
              </span>
            )}
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="-m-1 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Chiudi"
          >
            <X size={18} />
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
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold shadow-sm transition-colors ${s?.color ?? "bg-slate-600 text-white"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
      {s?.label ?? status}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm shadow-slate-200/60 transition-shadow ${
        /(^|\s)p-0(\s|$)/.test(className) ? "" : "p-5"
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardTitle({ icon: Icon, children, sub }: { icon?: LucideIcon; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      {Icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Icon size={18} />
        </span>
      )}
      <div>
        <h2 className="font-semibold text-slate-900">{children}</h2>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

export function PageTitle({ children, sub, actions }: { children: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{children}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
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
    info: "border-sky-200 bg-sky-50 text-sky-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    error: "border-rose-200 bg-rose-50 text-rose-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  }[tone];
  const Icon = { info: Info, success: CheckCircle2, error: AlertCircle, warning: AlertCircle }[tone];
  return (
    <div className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm ${styles} ${className}`}>
      <Icon size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600 ${className}`}
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
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <Icon size={26} />
      </span>
      <h3 className="font-semibold text-slate-900">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-slate-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const initials =
    name
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 || /\d/.test(w))
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join("") || "?";
  const palette = [
    "from-brand-500 to-violet-600",
    "from-sky-500 to-brand-600",
    "from-emerald-500 to-teal-600",
    "from-amber-400 to-orange-500",
    "from-rose-500 to-pink-600",
    "from-violet-500 to-fuchsia-600",
  ];
  const color = palette[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % palette.length];
  const sz = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg" }[size];
  return (
    <span
      className={`font-display flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br font-bold text-white shadow-md shadow-slate-900/10 ring-2 ring-white ${color} ${sz}`}
    >
      {initials}
    </span>
  );
}

export const btn =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-150 active:translate-y-px active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 disabled:active:translate-y-0";
export const btnPrimary = `${btn} bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-md shadow-brand-600/25 hover:from-brand-600 hover:to-brand-700 hover:shadow-lg hover:shadow-brand-600/30`;
export const btnSecondary = `${btn} border border-slate-200 bg-white text-slate-700 shadow-sm hover:-translate-y-px hover:border-slate-300 hover:bg-slate-50 hover:shadow`;
export const btnGreen = `${btn} bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-600/25 hover:from-emerald-600 hover:to-emerald-700 hover:shadow-lg hover:shadow-emerald-600/30`;
export const btnRed = `${btn} bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-md shadow-rose-600/25 hover:from-rose-600 hover:to-rose-700 hover:shadow-lg hover:shadow-rose-600/30`;
export const btnGhost = `${btn} text-slate-600 hover:bg-slate-100 hover:text-slate-900`;
export const btnLg = "px-5 py-3 text-base";
export const input =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-500/10";
export const label = "mb-1.5 block text-sm font-medium text-slate-700";
export const link = "font-medium text-brand-600 hover:text-brand-700 hover:underline";
