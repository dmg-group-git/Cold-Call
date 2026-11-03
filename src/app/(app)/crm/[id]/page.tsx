"use client";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Interaction, Lead, LeadStatus } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { formatDateTime, normalizePhone, telLink } from "@/lib/utils";
import { useAppData } from "@/components/useAppData";
import { Timeline } from "@/components/Timeline";
import { WhatsAppDialog } from "@/components/WhatsAppDialog";
import { EventDialog } from "@/components/EventDialog";
import { Card, Modal, btnGreen, btnPrimary, btnRed, btnSecondary, input, label } from "@/components/ui";

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { settings, scripts, materials } = useAppData();
  const [lead, setLead] = useState<Lead | null>(null);
  const [items, setItems] = useState<Interaction[]>([]);
  const [isDnc, setIsDnc] = useState(false);
  const [edit, setEdit] = useState<Partial<Lead>>({});
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [wa, setWa] = useState(false);
  const [ev, setEv] = useState<null | "videocall" | "richiamata">(null);
  const [delOpen, setDelOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data: l } = await supabase.from("leads").select("*").eq("id", id).single();
    const { data: it } = await supabase
      .from("interactions")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false });
    setLead(l as Lead);
    setEdit(l as Lead);
    setItems((it as Interaction[]) ?? []);
    if (l?.phone) {
      const { data: d } = await supabase.from("do_not_contact").select("phone").eq("phone", l.phone).maybeSingle();
      setIsDnc(!!d);
    }
  }, [id, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  if (!lead) return <p className="text-slate-500">Carico…</p>;

  async function save() {
    const phone = normalizePhone(edit.phone ?? null);
    const { error } = await supabase
      .from("leads")
      .update({
        name: edit.name,
        contact_person: edit.contact_person,
        phone,
        email: edit.email,
        website: edit.website,
        city: edit.city,
        province: edit.province,
        address: edit.address,
        status: edit.status,
        notes: edit.notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) return setMsg(error.code === "23505" ? "Esiste già un lead con questo numero." : error.message);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  }

  async function addNote() {
    if (!note.trim()) return;
    await supabase.from("interactions").insert({ lead_id: id, type: "note", summary: note.trim() });
    setNote("");
    load();
  }

  async function toggleDnc() {
    if (!lead?.phone) return;
    if (isDnc) await supabase.from("do_not_contact").delete().eq("phone", lead.phone);
    else await supabase.from("do_not_contact").upsert({ phone: lead.phone, name: lead.name, reason: "Manuale" });
    load();
  }

  async function requeue() {
    await supabase.from("leads").update({ next_action_at: new Date().toISOString() }).eq("id", id);
    setMsg("Rimesso in coda chiamate.");
    load();
  }

  async function refreshGoogle() {
    setMsg("Aggiorno da Google…");
    const res = await fetch("/api/places/details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadId: id }),
    });
    const j = await res.json();
    setMsg(res.ok ? "Dati aggiornati da Google." : j.error);
    load();
  }

  async function remove() {
    const paths = items.filter((i) => i.recording_path && !i.recording_deleted).map((i) => i.recording_path!);
    if (paths.length) await supabase.storage.from("recordings").remove(paths);
    await supabase.from("leads").delete().eq("id", id);
    router.replace("/crm");
  }

  const f = (k: keyof Lead, l: string) => (
    <div>
      <span className={label}>{l}</span>
      <input className={input} value={(edit[k] as string) ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
    </div>
  );

  return (
    <>
      <Link href="/crm" className="text-sm text-slate-500 hover:underline">← CRM</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{lead.name}</h1>
        <div className="flex flex-wrap gap-2">
          {lead.phone && <a className={btnGreen} href={telLink(lead.phone)}>📞 Chiama</a>}
          <button className={btnSecondary} onClick={() => setWa(true)}>💬 WhatsApp</button>
          <button className={btnSecondary} onClick={() => setEv("videocall")}>📅 Videocall</button>
          <button className={btnSecondary} onClick={() => setEv("richiamata")}>⏰ Richiamata</button>
        </div>
      </div>
      {isDnc && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">Questo lead è nella lista &quot;non contattare&quot;.</div>}
      {msg && <div className="mb-4 rounded-lg bg-slate-100 p-3 text-sm text-slate-700">{msg}</div>}

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="space-y-3 lg:col-span-2">
          <div>
            <span className={label}>Stato</span>
            <select className={input} value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value as LeadStatus })}>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {f("name", "Nome struttura")}
          <div className="grid grid-cols-2 gap-3">
            {f("phone", "Telefono")}
            {f("contact_person", "Referente")}
            {f("email", "Email")}
            {f("website", "Sito")}
            {f("city", "Città")}
            {f("province", "Provincia")}
          </div>
          {f("address", "Indirizzo")}
          <div>
            <span className={label}>Note</span>
            <textarea className={`${input} h-24`} value={edit.notes ?? ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
          </div>
          {lead.rating != null && <p className="text-sm text-slate-500">Google: ★ {lead.rating} ({lead.reviews_count} recensioni)</p>}
          {lead.next_action_at && <p className="text-sm text-slate-500">Prossima richiamata: {formatDateTime(lead.next_action_at)}</p>}
          <div className="flex flex-wrap gap-2 pt-2">
            <button className={btnPrimary} onClick={save}>{saved ? "Salvato ✓" : "Salva"}</button>
            <button className={btnSecondary} onClick={requeue}>Rimetti in coda</button>
            {lead.place_id && <button className={btnSecondary} onClick={refreshGoogle}>Aggiorna da Google</button>}
          </div>
          <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-3 text-xs">
            <button className="text-slate-600 underline" onClick={toggleDnc}>
              {isDnc ? "Togli da \"non contattare\"" : "Aggiungi a \"non contattare\""}
            </button>
            <button className="text-red-600 underline" onClick={() => setDelOpen(true)}>Elimina lead</button>
          </div>
        </Card>

        <Card className="lg:col-span-3">
          <h2 className="mb-3 font-semibold">Storico</h2>
          <div className="mb-4 flex gap-2">
            <input className={input} placeholder="Aggiungi una nota…" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addNote()} />
            <button className={btnSecondary} onClick={addNote}>Aggiungi</button>
          </div>
          <Timeline items={items} />
        </Card>
      </div>

      {wa && (
        <WhatsAppDialog open onClose={() => setWa(false)} onSent={load} lead={lead} kind="wa_answered" scripts={scripts} materials={materials} settings={settings} />
      )}
      {ev && <EventDialog open onClose={() => setEv(null)} onDone={load} lead={lead} kind={ev} settings={settings} />}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} title="Eliminare il lead?">
        <p className="text-sm text-slate-600">Verranno cancellati anche tutto lo storico e le registrazioni collegate.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button className={btnSecondary} onClick={() => setDelOpen(false)}>Annulla</button>
          <button className={btnRed} onClick={remove}>Elimina</button>
        </div>
      </Modal>
    </>
  );
}
