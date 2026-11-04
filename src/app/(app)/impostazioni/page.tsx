"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { Settings } from "@/lib/types";
import { listAudioInputs } from "@/components/useRecorder";
import { Building2, CalendarDays, Check, Mic, RefreshCw, Smartphone } from "lucide-react";
import { Alert, Loading, PageTitle, SettingsRow, btnPrimary, btnSecondary, cardBase, input, label, link } from "@/components/ui";

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
  const [openRow, setOpenRow] = useState<string | null>(null);

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

  const toggle = (k: string) => setOpenRow(openRow === k ? null : k);

  return (
    <>
      <PageTitle
        actions={
          <button className={btnPrimary} onClick={save}>
            {saved ? <Check size={16} /> : null}
            {saved ? "Salvato" : "Salva"}
          </button>
        }
      >
        Impostazioni
      </PageTitle>
      {gMsg && <Alert tone={gMsg.includes("✓") ? "success" : "info"} className="mb-5">{gMsg}</Alert>}

      <div className="mx-auto max-w-2xl space-y-8">
        <section>
          <h3 className="mb-2 px-4 text-[13px] font-normal uppercase text-slate-500">Account</h3>
          <div className={`${cardBase} overflow-hidden`}>
            <SettingsRow
              icon={Building2}
              tone="blue"
              title="Dati azienda"
              value={s.company_name || "Da completare"}
              open={openRow === "azienda"}
              onToggle={() => toggle("azienda")}
            >
              <p className="mb-3 text-[13px] text-slate-500">Usati negli script e nei messaggi WhatsApp.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><span className={label}>Il tuo nome {"{mio_nome}"}</span><input className={input} value={s.sender_name ?? ""} onChange={(e) => set("sender_name", e.target.value)} /></div>
                <div><span className={label}>Nome azienda {"{azienda}"}</span><input className={input} value={s.company_name ?? ""} onChange={(e) => set("company_name", e.target.value)} /></div>
                <div><span className={label}>Sito {"{sito}"}</span><input className={input} value={s.company_website ?? ""} onChange={(e) => set("company_website", e.target.value)} /></div>
                <div><span className={label}>Riferimenti {"{riferimenti}"}</span><input className={input} value={s.company_contacts ?? ""} onChange={(e) => set("company_contacts", e.target.value)} placeholder="tel, email…" /></div>
              </div>
            </SettingsRow>
            <SettingsRow
              icon={CalendarDays}
              tone="red"
              title="Google Calendar"
              value={s.google_email ? "Collegato" : "Non collegato"}
              open={openRow === "google"}
              onToggle={() => toggle("google")}
              last
            >
              {s.google_email ? (
                <div className="space-y-3">
                  <p className="flex items-center gap-2 text-[15px] text-[#1d1d1f]">
                    <span className="h-2 w-2 rounded-full bg-[#34c759]" /> {s.google_email}
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <span className={label}>Calendario</span>
                      <select className={input} value={s.calendar_id} onChange={(e) => set("calendar_id", e.target.value)}>
                        {calendars.length ? calendars.map((c) => <option key={c.id} value={c.id}>{c.name}</option>) : <option value={s.calendar_id}>{s.calendar_id}</option>}
                      </select>
                    </div>
                    <div>
                      <span className={label}>Durata videocall (minuti)</span>
                      <input type="number" min={5} step={5} className={input} value={s.meeting_minutes} onChange={(e) => set("meeting_minutes", Number(e.target.value))} />
                    </div>
                  </div>
                  <button className="text-[15px] text-[#ff3b30] hover:underline" onClick={disconnect}>Scollega Google</button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-[13px] text-slate-500">Per fissare videocall e richiamate direttamente dal sito.</p>
                  <a className={btnPrimary} href="/api/google/connect">Collega Google Calendar</a>
                </div>
              )}
            </SettingsRow>
          </div>
        </section>

        <section>
          <h3 className="mb-2 px-4 text-[13px] font-normal uppercase text-slate-500">Chiamate</h3>
          <div className={`${cardBase} overflow-hidden`}>
            <SettingsRow
              icon={Mic}
              tone="orange"
              title="Microfono"
              value={s.audio_device_label || "Predefinito"}
              open={openRow === "audio"}
              onToggle={() => {
                toggle("audio");
                if (!devices.length) loadDevices();
              }}
            >
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <span className={label}>Dispositivo di ingresso</span>
                  <select className={input} value={s.audio_device_id ?? ""} onChange={(e) => set("audio_device_id", e.target.value)}>
                    <option value="">Predefinito del Mac</option>
                    {devices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label || "Dispositivo senza nome"}</option>
                    ))}
                    {s.audio_device_id && !devices.some((d) => d.deviceId === s.audio_device_id) && (
                      <option value={s.audio_device_id}>{s.audio_device_label}</option>
                    )}
                  </select>
                </div>
                <button className={btnSecondary} onClick={loadDevices}><RefreshCw size={15} /> Aggiorna</button>
              </div>
              <p className="mt-3 text-[13px] text-slate-500">
                Per iniziare va bene il microfono del Mac in vivavoce. Se la voce del cliente si sente male, segui la{" "}
                <Link href="/test-audio#blackhole" className={link}>guida BlackHole</Link>.
              </p>
            </SettingsRow>
            <SettingsRow
              icon={Smartphone}
              tone="green"
              title="Come chiamare"
              value="Aiuto"
              open={openRow === "iphone"}
              onToggle={() => toggle("iphone")}
              last
            >
              <div className="space-y-3 text-[15px] text-slate-700">
                <p>Il sito non fa partire la chiamata: chiami tu dal telefono. Il Mac registra soltanto.</p>
                <ol className="list-decimal space-y-1.5 pl-5">
                  <li>In <b>Chiamate</b> premi <b>Avvia registrazione</b> (tasto C).</li>
                  <li>Sul <b>telefono</b> componi il numero grande che vedi sullo schermo.</li>
                  <li>
                    Metti il <b>vivavoce</b> e appoggia il telefono vicino al Mac: il Mac registra solo quello che sente,
                    quindi senza vivavoce non si sente il cliente.
                  </li>
                  <li>A fine chiamata premi <b>Termina</b> (tasto T): parte trascrizione e analisi.</li>
                </ol>
                <p className="text-slate-500">Niente cuffie o auricolari, altrimenti il Mac non sente la voce del cliente.</p>
              </div>
            </SettingsRow>
          </div>
        </section>
      </div>
    </>
  );
}
