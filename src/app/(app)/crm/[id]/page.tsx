"use client";
import { PhoneKind } from "@/components/PhoneKind";
import { PriorityBadge } from "@/components/PriorityBadge";
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Interaction, Lead, LeadStatus } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { formatDateTime, formatPhone, normalizePhone, telLink } from "@/lib/utils";
import { useAppData } from "@/components/useAppData";
import { Timeline } from "@/components/Timeline";
import { WhatsAppDialog } from "@/components/WhatsAppDialog";
import { EventDialog } from "@/components/EventDialog";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  History,
  ListRestart,
  MessageCircle,
  Phone,
  RefreshCw,
  Star,
  Trash2,
  UserRound,
  Video,
} from "lucide-react";
import {
  Alert,
  Avatar,
  Card,
  CardTitle,
  CollapsibleCard,
  usePersistentOpen,
  Loading,
  Modal,
  StatusBadge,
  btnGreen,
  btnPrimary,
  btnRed,
  btnSecondary,
  input,
  label,
} from "@/components/ui";

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
  const [formOpen, setFormOpen] = usePersistentOpen("lead-form", true);

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

  if (!lead) return <Loading />;

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
      <Link href="/crm" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-900">
        <ArrowLeft size={15} /> CRM
      </Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar name={lead.name} size="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-[28px] font-bold tracking-tight text-[#1d1d1f]">{lead.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
              <StatusBadge status={lead.status} />
              {lead.city && <span>{[lead.city, lead.province].filter(Boolean).join(" · ")}</span>}
              <PhoneKind phone={lead.phone} />
              <PriorityBadge lead={lead} showReasons={false} />
              {lead.rating != null && (
                <span className="inline-flex items-center gap-1">
                  <Star size={13} className="fill-amber-400 text-amber-400" /> {lead.rating} ({lead.reviews_count})
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.phone && (
            <a className={btnGreen} href={telLink(lead.phone)}>
              <Phone size={16} /> Chiama
            </a>
          )}
          <button className={btnSecondary} onClick={() => setWa(true)}>
            <MessageCircle size={16} /> WhatsApp
          </button>
          <button className={btnSecondary} onClick={() => setEv("videocall")}>
            <Video size={16} /> Videocall
          </button>
          <button className={btnSecondary} onClick={() => setEv("richiamata")}>
            <CalendarClock size={16} /> Richiamata
          </button>
        </div>
      </div>
      {isDnc && <Alert tone="error" className="mb-4">Questo lead è nella lista &quot;non contattare&quot;.</Alert>}
      {msg && <Alert className="mb-4">{msg}</Alert>}

      <div className="grid gap-6 lg:grid-cols-5">
        <CollapsibleCard
          className="self-start lg:col-span-2"
          icon={UserRound}
          tone="blue"
          title="Dati del lead"
          summary={[formatPhone(lead.phone), lead.contact_person, lead.email].filter(Boolean).join(" · ") || "Tocca per modificare"}
          open={formOpen}
          onToggle={setFormOpen}
        >
          <div className="space-y-3">
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
          {lead.next_action_at && (
            <p className="flex items-center gap-1.5 text-sm text-slate-600">
              <CalendarClock size={14} className="text-slate-400" /> Prossima richiamata: {formatDateTime(lead.next_action_at)}
            </p>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            <button className={btnPrimary} onClick={save}>{saved ? "Salvato ✓" : "Salva"}</button>
            <button className={btnSecondary} onClick={requeue}>
              <ListRestart size={15} /> Rimetti in coda
            </button>
            {lead.place_id && (
              <button className={btnSecondary} onClick={refreshGoogle}>
                <RefreshCw size={15} /> Aggiorna da Google
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-4 border-t border-black/[0.06] pt-4 text-xs font-medium">
            <button className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900" onClick={toggleDnc}>
              <Ban size={13} /> {isDnc ? "Togli da \"non contattare\"" : "Aggiungi a \"non contattare\""}
            </button>
            <button className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700" onClick={() => setDelOpen(true)}>
              <Trash2 size={13} /> Elimina lead
            </button>
          </div>
          </div>
        </CollapsibleCard>

        <Card className="lg:col-span-3">
          <CardTitle icon={History} tone="indigo" sub="Tocca una riga per i dettagli">Storico</CardTitle>
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
        <div className="mt-6 flex justify-end gap-2">
          <button className={btnSecondary} onClick={() => setDelOpen(false)}>Annulla</button>
          <button className={btnRed} onClick={remove}>Elimina</button>
        </div>
      </Modal>
    </>
  );
}
