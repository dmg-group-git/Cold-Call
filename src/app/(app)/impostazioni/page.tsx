"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Settings } from "@/lib/types";
import { listAudioInputs } from "@/components/useRecorder";
import { Building2, CalendarDays, Check, Mic, RefreshCw, Smartphone } from "lucide-react";
import { Alert, Card, CardTitle, Loading, PageTitle, btnPrimary, btnSecondary, input, label, link } from "@/components/ui";

const GOOGLE_MSG: Record<string, string> = {
  ok: "Google Calendar collegato ✓",
  annullato: "Collegamento annullato.",
  access_denied: "Accesso negato da Google.",
  nessun_refresh_token: "Google non ha dato il permesso permanente: riprova.",
  errore_sicurezza: "Errore di sicurezza: riprova.",
};

export default function ImpostazioniPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [calendars, setCalendars] = useState<{ id: string; name: string }[]>([]);
  const [saved, setSaved] = useState(false);
  const [gMsg, setGMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await createClient().from("settings").select("*").eq("id", 1).single();
    setS(data as Settings);
    if (data?.google_email) {
      const r = await fetch("/api/google/calendars");
      const j = await r.json();
      if (r.ok) setCalendars(j.calendars);
      else setGMsg(j.error);
    }
  }

  useEffect(() => {
    load();
    const p = new URLSearchParams(window.location.search).get("google");
    if (p) setGMsg(GOOGLE_MSG[p] ?? `Errore Google: ${p}`);
  }, []);

  async function loadDevices() {
    setDevices(await listAudioInputs());
  }

  async function save() {
    if (!s) return;
    const dev = devices.find((d) => d.deviceId === s.audio_device_id);
    await createClient()
      .from("settings")
      .update({
        company_name: s.company_name,
        company_website: s.company_website,
        company_contacts: s.company_contacts,
        sender_name: s.sender_name,
        audio_device_id: s.audio_device_id || null,
        audio_device_label: s.audio_device_id ? dev?.label ?? s.audio_device_label : null,
        meeting_minutes: s.meeting_minutes,
        calendar_id: s.calendar_id || "primary",
      })
      .eq("id", 1);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function disconnect() {
    await fetch("/api/google/disconnect", { method: "POST" });
    setCalendars([]);
    load();
  }

  if (!s) return <Loading />;
  const set = (k: keyof Settings, v: string | number | null) => setS({ ...s, [k]: v });

  return (
    <>
      <PageTitle
        sub="Dati azienda, audio e calendario."
        actions={
          <button className={btnPrimary} onClick={save}>
            {saved ? <Check size={16} /> : null}
            {saved ? "Salvato" : "Salva impostazioni"}
          </button>
        }
      >
        Impostazioni
      </PageTitle>
      <div className="space-y-6">
        <Card className="space-y-4">
          <CardTitle icon={Building2} sub="Usati negli script e nei messaggi WhatsApp.">Dati azienda</CardTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <div><span className={label}>Il tuo nome {"{mio_nome}"}</span><input className={input} value={s.sender_name ?? ""} onChange={(e) => set("sender_name", e.target.value)} /></div>
            <div><span className={label}>Nome azienda {"{azienda}"}</span><input className={input} value={s.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></div>
            <div><span className={label}>Sito {"{sito}"}</span><input className={input} value={s.company_website ?? ""} onChange={(e) => set("company_website", e.target.value)} /></div>
            <div><span className={label}>Riferimenti {"{riferimenti}"}</span><input className={input} value={s.company_contacts ?? ""} onChange={(e) => set("company_contacts", e.target.value)} placeholder="tel, email…" /></div>
          </div>
        </Card>

        <Card className="space-y-4">
          <CardTitle icon={Mic} sub="Il microfono usato per registrare le chiamate.">Audio per la registrazione</CardTitle>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[260px] flex-1">
              <span className={label}>Dispositivo di ingresso</span>
              <select className={input} value={s.audio_device_id ?? ""} onChange={(e) => set("audio_device_id", e.target.value)} onFocus={() => !devices.length && loadDevices()}>
                <option value="">Predefinito del Mac {s.audio_device_label && !devices.length ? `(salvato: ${s.audio_device_label})` : ""}</option>
                {devices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || "Dispositivo senza nome"}</option>
                ))}
                {s.audio_device_id && !devices.length && <option value={s.audio_device_id}>{s.audio_device_label}</option>}
              </select>
            </div>
            <button className={btnSecondary} onClick={loadDevices}><RefreshCw size={15} /> Aggiorna elenco</button>
          </div>
          <p className="text-xs text-slate-500">
            Per iniziare va bene il microfono del Mac in vivavoce. Se la voce del cliente si sente male, segui la{" "}
            <Link href="/test-audio#blackhole" className={link}>guida BlackHole</Link> e scegli qui il &quot;dispositivo aggregato&quot;.
          </p>
        </Card>

        <Card className="space-y-4">
          <CardTitle icon={CalendarDays} sub="Per fissare videocall e richiamate direttamente dal sito.">Google Calendar</CardTitle>
          {gMsg && <Alert tone={gMsg.includes("✓") ? "success" : "info"}>{gMsg}</Alert>}
          {s.google_email ? (
            <>
              <p className="flex items-center gap-2 text-sm text-slate-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> Collegato come <b>{s.google_email}</b>
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <span className={label}>Calendario</span>
                  <select className={input} value={s.calendar_id} onChange={(e) => set("calendar_id", e.target.value)}>
                    {calendars.length ? calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : <option value={s.calendar_id}>{s.calendar_id}</option>}
                  </select>
                </div>
                <div>
                  <span className={label}>Durata predefinita videocall (minuti)</span>
                  <input type="number" min={5} step={5} className={input} value={s.meeting_minutes} onChange={(e) => set("meeting_minutes", Number(e.target.value))} />
                </div>
              </div>
              <button className="text-sm font-medium text-rose-600 hover:underline" onClick={disconnect}>Scollega Google</button>
            </>
          ) : (
            <a className={btnPrimary} href="/api/google/connect">Collega Google Calendar</a>
          )}
        </Card>

        <Card>
          <details>
            <summary className="flex cursor-pointer list-none items-center gap-3 font-semibold text-slate-900">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Smartphone size={18} />
              </span>
              Il Mac non chiama? Attiva le chiamate da iPhone
            </summary>
            <div className="mt-3 space-y-3 text-sm text-slate-700">
              <p>Se compare &quot;iPhone non è configurato per effettuare chiamate tramite il Mac&quot;:</p>
              <ol className="list-decimal space-y-1 pl-5">
                <li>
                  Su <b>iPhone</b>: Impostazioni → App → Telefono → <b>Chiamate su altri dispositivi</b>. Attivalo e accendi
                  l&apos;interruttore del tuo Mac.
                </li>
                <li>
                  Sul <b>Mac</b>: apri l&apos;app FaceTime (o Telefono) → Impostazioni → spunta <b>Chiamate da iPhone</b>.
                </li>
                <li>iPhone e Mac devono avere lo stesso Apple ID, con Wi-Fi e Bluetooth accesi e vicini.</li>
              </ol>
              <p className="text-slate-500">Se ancora non va: spegni e riaccendi Wi-Fi su entrambi, poi riprova.</p>
            </div>
          </details>
        </Card>

        <div className="flex justify-end">
          <button className={btnPrimary} onClick={save}>
            {saved ? <Check size={16} /> : null}
            {saved ? "Salvato" : "Salva impostazioni"}
          </button>
        </div>
      </div>
    </>
  );
}
