"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lead, Material, Script, Settings } from "@/lib/types";
import { appointmentVars, fillTemplate, materialsText, missingAppointmentVars, waLink, withMaterials, phoneKind } from "@/lib/utils";
import { MessageCircle } from "lucide-react";
import { WaPreview } from "./WaPreview";
import { SHOW_WA_ATTACHMENTS } from "@/lib/features";
import { Modal, btnGreen, btnSecondary, input, label } from "./ui";

/**
 * Conferma prima di inviare un WhatsApp: mostra il testo (modificabile),
 * poi apre WhatsApp con il messaggio pronto. L'invio vero lo fai tu premendo "Invia" in WhatsApp.
 */
export function WhatsAppDialog({
  open,
  onClose,
  onSent,
  lead,
  kind,
  scripts,
  materials,
  settings,
  title,
  appointment,
}: {
  open: boolean;
  onClose: () => void;
  onSent?: () => void;
  lead: Lead;
  kind: "wa_no_answer" | "wa_answered";
  scripts: Script[];
  materials: Material[];
  settings: Settings | null;
  title?: string;
  /** Data e ora capite dalla chiamata ("YYYY-MM-DDTHH:mm"), usate se non c'è ancora una videocall in calendario. */
  appointment?: string | null;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [template, setTemplate] = useState(kind);
  const [when, setWhen] = useState("");
  const [meetLink, setMeetLink] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTemplate(kind);
  }, [open, kind]);

  // allegati predefiniti dello script scelto (impostati nella pagina Script)
  useEffect(() => {
    if (!open) return;
    if (!SHOW_WA_ATTACHMENTS) return setSelected([]);
    const ids = scripts.find((s) => s.kind === template)?.material_ids ?? [];
    setSelected(ids.filter((id) => materials.some((m) => m.id === id)));
  }, [open, template, scripts, materials]);

  // data e ora della videocall: prima quella fissata sul calendario, altrimenti quella capita dalla chiamata
  useEffect(() => {
    if (!open) return;
    setWhen(appointment ?? "");
    setMeetLink(null);
    let cancelled = false;
    createClient()
      .from("interactions")
      .select("data")
      .eq("lead_id", lead.id)
      .eq("type", "event")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        const ev = (data ?? [])
          .map((r) => r.data as { kind?: string; start?: string; meetLink?: string | null } | null)
          .find((d) => d?.kind === "videocall" && d.start);
        if (cancelled || !ev?.start) return;
        setWhen(ev.start.slice(0, 16));
        setMeetLink(ev.meetLink ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, lead.id, appointment]);

  const body = scripts.find((s) => s.kind === template)?.body ?? "";
  const usesAppointment = /\{(giorno|ora|link_videocall)\}/i.test(body);

  useEffect(() => {
    if (!open) return;
    const mats = materials.filter((m) => selected.includes(m.id));
    const extra = { materiali: materialsText(mats), ...appointmentVars(when, meetLink) };
    setText(withMaterials(fillTemplate(body, lead, settings, extra), body, mats));
  }, [open, body, selected, materials, lead, settings, when, meetLink]);

  const missing = missingAppointmentVars(text);

  async function confirm() {
    if (!lead.phone) return;
    window.open(waLink(lead.phone, text), "_blank");
    const supabase = createClient();
    await supabase.from("interactions").insert({
      lead_id: lead.id,
      type: "whatsapp",
      summary: template === "wa_no_answer" ? "WhatsApp \"non risponde\" inviato" : "WhatsApp informativo inviato",
      data: { text, materials: selected },
    });
    onSent?.();
    onClose();
  }

  return (
    <Modal icon={MessageCircle} open={open} onClose={onClose} title={title ?? "Inviamo il WhatsApp?"}>
      {!lead.phone ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">Questo lead non ha un numero di telefono.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <span className={label}>Modello</span>
            <select className={input} value={template} onChange={(e) => setTemplate(e.target.value as typeof kind)}>
              <option value="wa_no_answer">Non risponde</option>
              <option value="wa_answered">Ha risposto</option>
            </select>
          </div>
          {SHOW_WA_ATTACHMENTS && materials.length > 0 && (
            <div>
              <span className={label}>Materiali da allegare (come link)</span>
              <div className="space-y-1">
                {materials.map((m) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={selected.includes(m.id)}
                      onChange={(e) =>
                        setSelected((s) => (e.target.checked ? [...s, m.id] : s.filter((x) => x !== m.id)))
                      }
                    />
                    {m.title} <span className="text-slate-400">({m.kind})</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-500">Partono come link nel messaggio (al posto di {"{materiali}"} o in fondo).</p>
            </div>
          )}
          {usesAppointment && (
            <div>
              <span className={label}>Data e ora della videocall</span>
              <input type="datetime-local" className={input} value={when} onChange={(e) => setWhen(e.target.value)} />
              <p className="mt-1 text-xs text-slate-500">Riempie {"{giorno}"} e {"{ora}"} nel messaggio.</p>
            </div>
          )}
          {missing.length > 0 && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              Nel messaggio manca ancora: <b>{missing.join(", ")}</b>.{" "}
              {missing.some((v) => /link/i.test(v))
                ? "Il link arriva quando fissi la videocall con Google Meet, oppure scrivilo a mano."
                : "Scegli data e ora qui sopra."}
            </p>
          )}
          <div>
            <span className={label}>Testo (puoi modificarlo)</span>
            <textarea className={`${input} h-40`} value={text} onChange={(e) => setText(e.target.value)} />
            <div className="mt-3">
              <span className={label}>Anteprima</span>
              <WaPreview text={text} className="h-48" />
            </div>
          </div>
          {phoneKind(lead.phone) === "fisso" && (
            <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
              Attenzione: questo sembra un numero <b>fisso</b>, di solito non ha WhatsApp.
            </p>
          )}
          <p className="text-xs text-slate-500">
            Si aprirà WhatsApp con il messaggio pronto per {lead.phone}: premi Invia lì. Non inviare troppi messaggi a
            numeri sconosciuti, WhatsApp potrebbe bloccare il numero.
          </p>
          <div className="flex flex-col-reverse gap-2 border-t border-black/[0.06] pt-4 sm:flex-row sm:justify-end">
            <button className={btnSecondary} onClick={onClose}>
              Annulla
            </button>
            <button className={btnGreen} onClick={confirm} disabled={!text.trim() || missing.some((v) => !/link/i.test(v))}>
              Sì, apri WhatsApp
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
