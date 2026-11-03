"use client";
import { useEffect, useState } from "react";
import type { Lead, Settings } from "@/lib/types";
import { romeLocalNow } from "@/lib/utils";
import { CalendarClock, Video } from "lucide-react";
import { Modal, btnPrimary, btnSecondary, input, label } from "./ui";

/** Conferma prima di creare un evento su Google Calendar (data e ora modificabili). */
export function EventDialog({
  open,
  onClose,
  onDone,
  lead,
  kind,
  initialStart,
  settings,
  notes,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: (res: { meetLink?: string | null; htmlLink?: string }) => void;
  lead: Lead;
  kind: "videocall" | "richiamata";
  initialStart?: string | null;
  settings: Settings | null;
  notes?: string;
}) {
  const [start, setStart] = useState("");
  const [minutes, setMinutes] = useState(30);
  const [title, setTitle] = useState("");
  const [email, setEmail] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setStart(initialStart || romeLocalNow(24 * 60).slice(0, 11) + "10:00");
    setMinutes(kind === "videocall" ? settings?.meeting_minutes || 30 : 15);
    setTitle(kind === "videocall" ? `Videocall ${settings?.company_name || ""} - ${lead.name}`.replace("  ", " ") : `Richiamare ${lead.name}`);
    setEmail(lead.email || "");
    setDescription(
      [
        lead.phone ? `Telefono: ${lead.phone}` : "",
        lead.contact_person ? `Referente: ${lead.contact_person}` : "",
        notes || "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }, [open, initialStart, kind, lead, settings, notes]);

  const [d, t] = start.split("T");
  const pretty = d ? `${d.split("-").reverse().join("/")} alle ${t}` : "";

  async function confirm() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/google/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        leadId: lead.id,
        kind,
        title,
        start,
        minutes,
        description,
        attendeeEmail: kind === "videocall" ? email.trim() || null : null,
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) return setError(json.error || "Errore");
    onDone?.(json);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={kind === "videocall" ? Video : CalendarClock}
      title={kind === "videocall" ? `Fissiamo la videocall il ${pretty}?` : `Fissiamo la richiamata il ${pretty}?`}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <span className={label}>Data e ora</span>
            <input type="datetime-local" className={input} value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <span className={label}>Durata (minuti)</span>
            <input type="number" min={5} step={5} className={input} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <span className={label}>Titolo</span>
          <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        {kind === "videocall" && (
          <div>
            <span className={label}>Email del lead per l&apos;invito (facoltativa)</span>
            <input type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@esempio.it" />
            <p className="mt-1 text-xs text-slate-500">Verrà creato il link Google Meet. Se metti l&apos;email, il lead riceve l&apos;invito.</p>
          </div>
        )}
        <div>
          <span className={label}>Note nell&apos;evento</span>
          <textarea className={`${input} h-24`} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button className={btnSecondary} onClick={onClose}>
            Annulla
          </button>
          <button className={btnPrimary} onClick={confirm} disabled={busy || !start}>
            {busy ? "Salvo..." : "Sì, metti in calendario"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
