"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, CalendarClock, Phone } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Lead } from "@/lib/types";
import { Card } from "./ui";

/** Inizio e fine della giornata di oggi (ora di Roma) in ISO. */
function todayRange(): [string, string] {
  const now = new Date();
  const romeDay = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" }); // YYYY-MM-DD
  const asUtc = new Date(`${romeDay}T00:00:00Z`);
  const romeMidnight = new Date(asUtc.toLocaleString("sv-SE", { timeZone: "Europe/Rome" }).replace(" ", "T") + "Z");
  const offset = romeMidnight.getTime() - asUtc.getTime();
  const start = new Date(asUtc.getTime() - offset);
  return [start.toISOString(), new Date(start.getTime() + 24 * 3600 * 1000).toISOString()];
}

function hour(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
}

/**
 * Richiamate di oggi, in cima alla pagina Chiamate.
 * Con la pagina aperta, all'ora giusta arriva anche un promemoria (notifica del browser).
 */
export function RecallsToday({
  currentId,
  canPick,
  onPick,
}: {
  currentId?: string | null;
  canPick: boolean;
  onPick: (lead: Lead) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Lead[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const notified = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    const [start, end] = todayRange();
    const { data } = await supabase
      .from("leads")
      .select("*")
      .gte("next_action_at", start)
      .lt("next_action_at", end)
      .not("status", "in", "(cliente,perso)")
      .order("next_action_at", { ascending: true });
    setItems((data as Lead[]) ?? []);
  }, [supabase]);

  useEffect(() => {
    load();
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    const t = setInterval(() => {
      setNow(Date.now());
      load();
    }, 60_000);
    return () => clearInterval(t);
  }, [load]);

  // promemoria all'ora della richiamata
  useEffect(() => {
    for (const l of items) {
      const at = new Date(l.next_action_at!).getTime();
      if (at <= now && now - at < 15 * 60_000 && !notified.current.has(l.id)) {
        notified.current.add(l.id);
        if (perm === "granted") {
          try {
            new Notification(`Richiama ${l.name}`, { body: `Era previsto alle ${hour(l.next_action_at!)}`, tag: l.id });
          } catch {
            /* alcuni browser non permettono notifiche qui */
          }
        }
      }
    }
  }, [items, now, perm]);

  async function askPermission() {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  }

  if (!items.length) return null;
  const late = items.filter((l) => new Date(l.next_action_at!).getTime() <= now).length;

  return (
    <Card className="mb-6">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <CalendarClock size={16} className="text-brand-500" />
          Richiamate di oggi: {items.length}
          {late > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">{late} da fare ora</span>}
        </div>
        {perm === "default" && (
          <button className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline" onClick={askPermission}>
            <Bell size={13} /> Attiva promemoria
          </button>
        )}
        {perm === "granted" && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <BellRing size={13} /> Promemoria attivi (con questa pagina aperta)
          </span>
        )}
      </div>
      <ul className="divide-y divide-slate-100">
        {items.map((l) => {
          const due = new Date(l.next_action_at!).getTime() <= now;
          const current = l.id === currentId;
          return (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <div className="flex min-w-0 items-center gap-3">
                <span className={`w-12 font-mono tabular-nums ${due ? "font-semibold text-rose-600" : "text-slate-500"}`}>
                  {hour(l.next_action_at!)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{l.name}</div>
                  <div className="truncate text-xs text-slate-500">{[l.contact_person, l.city].filter(Boolean).join(" · ")}</div>
                </div>
              </div>
              {current ? (
                <span className="text-xs font-medium text-brand-600">in chiamata adesso</span>
              ) : (
                <button
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  disabled={!canPick || !l.phone}
                  onClick={() => onPick(l)}
                >
                  <Phone size={12} /> Chiama ora
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
