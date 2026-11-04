"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, Users, X } from "lucide-react";
import { deleteLeads } from "@/lib/leads";
import { createClient } from "@/lib/supabase/client";
import type { Lead, LeadStatus } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { normalizePhone, formatDateTime, formatPhone } from "@/lib/utils";
import {
  Alert,
  Avatar,
  Card,
  EmptyState,
  Loading,
  Modal,
  PageTitle,
  StatusBadge,
  btnPrimary,
  btnRed,
  btnSecondary,
  input,
  label,
} from "@/components/ui";

export default function CrmPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  /** lead da eliminare in attesa di conferma */
  const [toDelete, setToDelete] = useState<Lead[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("leads").select("*").order("updated_at", { ascending: false }).limit(1000);
    setLeads((data as Lead[]) ?? []);
    setLoading(false);
  }

  function toggle(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setDeleting(true);
    const ids = toDelete.map((l) => l.id);
    const error = await deleteLeads(supabase, ids);
    setDeleting(false);
    setToDelete(null);
    if (error) return setMsg("Errore nell'eliminazione: " + error.message);
    setMsg(ids.length === 1 ? `"${toDelete[0].name}" eliminato.` : `${ids.length} lead eliminati.`);
    setSelected(new Set());
    load();
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of leads) c[l.status] = (c[l.status] ?? 0) + 1;
    return c;
  }, [leads]);

  const filtered = leads.filter((l) => {
    if (status && l.status !== status) return false;
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return [l.name, l.city, l.phone, l.contact_person, l.email].some((v) => v?.toLowerCase().includes(s));
  });

  const selectedVisible = filtered.filter((l) => selected.has(l.id));
  const allVisibleSelected = filtered.length > 0 && filtered.every((l) => selected.has(l.id));

  const pill = (active: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition ${
      active ? "bg-[#1d1d1f] text-white" : "bg-white text-slate-600 shadow-[0_1px_3px_rgba(0,0,0,0.06)] ring-1 ring-black/[0.04] hover:bg-slate-50 active:scale-95"
    }`;

  return (
    <>
      <PageTitle
        sub="Tutti i tuoi contatti, con stato e storico."
        actions={
          <button className={btnPrimary} onClick={() => setAddOpen(true)}>
            <Plus size={16} /> Nuovo lead
          </button>
        }
      >
        CRM
      </PageTitle>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <button className={pill(status === "")} onClick={() => setStatus("")}>
          Tutti <span className="opacity-60">{leads.length}</span>
        </button>
        {STATUSES.map((s) => (
          <button key={s.value} className={pill(status === s.value)} onClick={() => setStatus(s.value)}>
            {s.label} <span className="opacity-60">{counts[s.value] ?? 0}</span>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/[0.06] p-3">
          <div className="relative w-full max-w-sm">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className={`${input} pl-9`}
              placeholder="Cerca nome, città, telefono…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          {selectedVisible.length > 0 && (
            <div className="flex items-center gap-2">
              <button className={`${btnSecondary} px-3 py-1.5 text-sm`} onClick={() => setSelected(new Set())}>
                <X size={14} /> Deseleziona
              </button>
              <button className={`${btnRed} px-3 py-1.5 text-sm`} onClick={() => setToDelete(selectedVisible)}>
                <Trash2 size={14} /> Elimina {selectedVisible.length}
              </button>
            </div>
          )}
        </div>
        {loading ? (
          <div className="px-5">
            <Loading />
          </div>
        ) : !filtered.length ? (
          <EmptyState
            icon={Users}
            title={leads.length ? "Nessun lead trovato" : "Ancora nessun lead"}
            action={
              !leads.length && (
                <Link className={btnPrimary} href="/ricerca">
                  <Search size={16} /> Cerca lead su Google
                </Link>
              )
            }
          >
            {leads.length ? "Prova a cambiare filtro o ricerca." : "Aggiungili dalla Ricerca lead o a mano con \"Nuovo lead\"."}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-10 py-3 pl-5 pr-0">
                    <input
                      type="checkbox"
                      aria-label="Seleziona tutti"
                      checked={allVisibleSelected}
                      onChange={(e) =>
                        setSelected((prev) => {
                          const n = new Set(prev);
                          for (const l of filtered) {
                            if (e.target.checked) n.add(l.id);
                            else n.delete(l.id);
                          }
                          return n;
                        })
                      }
                    />
                  </th>
                  <th className="px-5 py-3">Struttura</th>
                  <th className="hidden px-5 py-3 md:table-cell">Telefono</th>
                  <th className="px-5 py-3">Stato</th>
                  <th className="hidden px-5 py-3 lg:table-cell">Prossima azione</th>
                  <th className="hidden px-5 py-3 sm:table-cell">Aggiornato</th>
                  <th className="w-12 px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.06]">
                {filtered.map((l) => (
                  <tr
                    key={l.id}
                    className={`group cursor-pointer transition-colors hover:bg-brand-50/50 ${selected.has(l.id) ? "bg-brand-50/40" : ""}`}
                    onClick={() => router.push(`/crm/${l.id}`)}
                  >
                    <td className="py-4 pl-5 pr-0" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Seleziona ${l.name}`} checked={selected.has(l.id)} onChange={() => toggle(l.id)} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3.5">
                        <Avatar name={l.name} size="sm" />
                        <div className="min-w-0">
                          <Link
                            className="block truncate font-medium text-slate-900 hover:text-brand-700"
                            href={`/crm/${l.id}`}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {l.name}
                          </Link>
                          <div className="truncate text-xs text-slate-500">
                            {[l.city, l.contact_person].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-5 py-4 font-mono text-[13px] text-slate-600 tabular-nums md:table-cell">{formatPhone(l.phone) || "—"}</td>
                    <td className="px-5 py-4">
                      <StatusBadge status={l.status} />
                    </td>
                    <td className="hidden px-5 py-4 text-slate-600 lg:table-cell">
                      {l.next_action_at ? formatDateTime(l.next_action_at) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="hidden px-5 py-4 text-slate-500 sm:table-cell">{formatDateTime(l.updated_at)}</td>
                    <td className="px-3 py-4 text-right">
                      <button
                        className="rounded-full p-2 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600 group-hover:text-slate-400"
                        title="Elimina lead"
                        aria-label={`Elimina ${l.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setToDelete([l]);
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-3 text-xs text-slate-400">{filtered.length} lead mostrati</p>
      {msg && (
        <Alert tone={msg.startsWith("Errore") ? "error" : "success"} className="mt-3">
          {msg}
        </Alert>
      )}
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        icon={Trash2}
        title={toDelete?.length === 1 ? `Eliminare "${toDelete[0].name}"?` : `Eliminare ${toDelete?.length ?? 0} lead?`}
      >
        <p className="text-sm text-slate-600">
          Verranno cancellate anche le chiamate, le note e le registrazioni collegate. Non si può annullare.
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {toDelete?.length === 1 ? "Resterà" : "Resteranno"} nello storico della Ricerca lead, così nelle ricerche vedrai che
          {toDelete?.length === 1 ? " era già stato" : " erano già stati"} nel CRM.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button className={btnSecondary} onClick={() => setToDelete(null)}>Annulla</button>
          <button className={btnRed} onClick={confirmDelete} disabled={deleting}>
            <Trash2 size={15} /> {deleting ? "Elimino…" : "Elimina"}
          </button>
        </div>
      </Modal>
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
    <Modal open={open} onClose={onClose} icon={Plus} title="Nuovo lead">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">{field("name", "Nome struttura *")}</div>
        {field("phone", "Telefono")}
        {field("contact_person", "Referente")}
        {field("city", "Città")}
        {field("province", "Provincia")}
        {field("website", "Sito")}
        {field("email", "Email")}
      </div>
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button className={btnSecondary} onClick={onClose}>Annulla</button>
        <button className={btnPrimary} onClick={save} disabled={!f.name.trim()}>Salva</button>
      </div>
    </Modal>
  );
}
