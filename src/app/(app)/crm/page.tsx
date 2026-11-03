"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Lead, LeadStatus } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { normalizePhone, formatDateTime } from "@/lib/utils";
import { Card, Modal, PageTitle, StatusBadge, btnPrimary, btnSecondary, input, label } from "@/components/ui";

export default function CrmPage() {
  const supabase = useMemo(() => createClient(), []);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  async function load() {
    setLoading(true);
    let query = supabase.from("leads").select("*").order("updated_at", { ascending: false }).limit(1000);
    if (status) query = query.eq("status", status);
    const { data } = await query;
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const filtered = leads.filter((l) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [l.name, l.city, l.phone, l.contact_person, l.email].some((v) => v?.toLowerCase().includes(s));
  });

  return (
    <>
      <div className="flex items-start justify-between">
        <PageTitle sub={`${filtered.length} lead`}>CRM</PageTitle>
        <button className={btnPrimary} onClick={() => setAddOpen(true)}>+ Nuovo lead</button>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <input className={`${input} max-w-xs`} placeholder="Cerca nome, città, telefono…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={`${input} max-w-[200px]`} value={status} onChange={(e) => setStatus(e.target.value as LeadStatus | "")}>
          <option value="">Tutti gli stati</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </div>
      <Card className="overflow-x-auto p-0">
        {loading ? (
          <p className="p-5 text-slate-500">Carico…</p>
        ) : !filtered.length ? (
          <p className="p-5 text-slate-500">Nessun lead.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="p-3">Struttura</th>
                <th className="p-3">Città</th>
                <th className="p-3">Telefono</th>
                <th className="p-3">Stato</th>
                <th className="p-3">Aggiornato</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="p-3"><Link className="font-medium text-slate-900 hover:underline" href={`/crm/${l.id}`}>{l.name}</Link></td>
                  <td className="p-3 text-slate-600">{l.city}</td>
                  <td className="p-3 text-slate-600">{l.phone}</td>
                  <td className="p-3"><StatusBadge status={l.status} /></td>
                  <td className="p-3 text-slate-500">{formatDateTime(l.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <AddLead open={addOpen} onClose={() => setAddOpen(false)} onAdded={load} />
    </>
  );
}

function AddLead({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [f, setF] = useState({ name: "", phone: "", city: "", province: "", website: "", contact_person: "", email: "" });
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    const phone = normalizePhone(f.phone);
    const supabase = createClient();
    if (phone) {
      const { data: dnc } = await supabase.from("do_not_contact").select("phone").eq("phone", phone).maybeSingle();
      if (dnc) return setError("Questo numero è nella lista \"non contattare\".");
    }
    const { error } = await supabase.from("leads").insert({ ...f, phone, category: "manuale" });
    if (error) return setError(error.code === "23505" ? "Esiste già un lead con questo numero." : error.message);
    setF({ name: "", phone: "", city: "", province: "", website: "", contact_person: "", email: "" });
    onAdded();
    onClose();
  }
  const field = (k: keyof typeof f, l: string) => (
    <div>
      <span className={label}>{l}</span>
      <input className={input} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </div>
  );
  return (
    <Modal open={open} onClose={onClose} title="Nuovo lead">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">{field("name", "Nome struttura *")}</div>
        {field("phone", "Telefono")}
        {field("contact_person", "Referente")}
        {field("city", "Città")}
        {field("province", "Provincia")}
        {field("website", "Sito")}
        {field("email", "Email")}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className={btnSecondary} onClick={onClose}>Annulla</button>
        <button className={btnPrimary} onClick={save} disabled={!f.name.trim()}>Salva</button>
      </div>
    </Modal>
  );
}
