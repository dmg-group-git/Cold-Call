"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Lead, Material, Script, Settings } from "@/lib/types";
import { fillTemplate, materialsText, waLink } from "@/lib/utils";
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
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [template, setTemplate] = useState(kind);

  useEffect(() => {
    if (!open) return;
    setTemplate(kind);
    setSelected(kind === "wa_answered" ? materials.map((m) => m.id) : []);
  }, [open, kind, materials]);

  useEffect(() => {
    if (!open) return;
    const body = scripts.find((s) => s.kind === template)?.body ?? "";
    const mats = materials.filter((m) => selected.includes(m.id));
    setText(fillTemplate(body, lead, settings, { materiali: materialsText(mats) }));
  }, [open, template, selected, scripts, materials, lead, settings]);

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
    <Modal open={open} onClose={onClose} title={title ?? "Inviamo il WhatsApp?"}>
      {!lead.phone ? (
        <p className="text-sm text-red-600">Questo lead non ha un numero di telefono.</p>
      ) : (
        <div className="space-y-4">
          <div>
            <span className={label}>Modello</span>
            <select className={input} value={template} onChange={(e) => setTemplate(e.target.value as typeof kind)}>
              <option value="wa_no_answer">Non risponde</option>
              <option value="wa_answered">Ha risposto (con materiali)</option>
            </select>
          </div>
          {materials.length > 0 && (
            <div>
              <span className={label}>Materiali da allegare (come link)</span>
              <div className="space-y-1">
                {materials.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-sm">
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
              <p className="mt-1 text-xs text-slate-500">Nel testo i materiali compaiono al posto di {"{materiali}"}.</p>
            </div>
          )}
          <div>
            <span className={label}>Testo (puoi modificarlo)</span>
            <textarea className={`${input} h-48`} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <p className="text-xs text-slate-500">
            Si aprirà WhatsApp con il messaggio pronto per {lead.phone}: premi Invia lì. Non inviare troppi messaggi a
            numeri sconosciuti, WhatsApp potrebbe bloccare il numero.
          </p>
          <div className="flex justify-end gap-2">
            <button className={btnSecondary} onClick={onClose}>
              Annulla
            </button>
            <button className={btnGreen} onClick={confirm} disabled={!text.trim()}>
              Sì, apri WhatsApp
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
