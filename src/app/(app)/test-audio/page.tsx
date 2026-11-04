"use client";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { listAudioInputs, useRecorder } from "@/components/useRecorder";
import { LevelMeter } from "@/components/LevelMeter";
import { Mic, Square } from "lucide-react";
import { Card, PageTitle, btnPrimary, btnRed, btnSecondary, input, label, link } from "@/components/ui";
import { formatDuration } from "@/lib/utils";

export default function TestAudioPage() {
  const rec = useRecorder();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [blob, setBlob] = useState<{ blob: Blob; ext: string } | null>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .from("settings")
      .select("audio_device_id")
      .eq("id", 1)
      .single()
      .then(({ data }) => setDeviceId(data?.audio_device_id ?? ""));
  }, []);

  async function start() {
    setError(null);
    setTranscript(null);
    setAudioUrl(null);
    try {
      await rec.start(deviceId || null);
    } catch {
      setError("Non riesco ad accedere al microfono: controlla i permessi del browser.");
    }
  }

  async function stop() {
    const r = await rec.stop();
    if (!r) return;
    setBlob({ blob: r.blob, ext: r.ext });
    setAudioUrl(URL.createObjectURL(r.blob));
  }

  async function transcribe() {
    if (!blob) return;
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const path = `test/${Date.now()}.${blob.ext}`;
    const { error: upErr } = await supabase.storage.from("recordings").upload(path, blob.blob, { contentType: blob.blob.type });
    if (upErr) {
      setBusy(false);
      return setError(upErr.message);
    }
    const res = await fetch("/api/transcribe-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) return setError(j.error);
    setTranscript(j.transcript || "(nessuna voce rilevata)");
  }

  async function saveDevice() {
    const dev = devices.find((d) => d.deviceId === deviceId);
    await createClient()
      .from("settings")
      .update({ audio_device_id: deviceId || null, audio_device_label: dev?.label ?? null })
      .eq("id", 1);
    setError("Dispositivo salvato come predefinito ✓");
  }

  return (
    <>
      <PageTitle sub="Fai questa prova prima di iniziare: chiama un amico dal telefono, in vivavoce vicino al Mac, e registra.">
        Prova audio
      </PageTitle>

      <Card className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
          <li>Scegli il dispositivo (per iniziare: microfono del Mac).</li>
          <li>Chiama un amico dal telefono, metti il <b>vivavoce</b> e appoggialo vicino al Mac, <b>senza cuffie</b>.</li>
          <li>Premi &quot;Avvia registrazione&quot;, parlate 30 secondi, poi &quot;Ferma&quot;.</li>
          <li>Riascolta e premi &quot;Trascrivi&quot;: se si capiscono bene entrambe le voci, sei pronto.</li>
        </ol>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <span className={label}>Dispositivo audio</span>
            <select className={input} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} onFocus={async () => !devices.length && setDevices(await listAudioInputs())}>
              <option value="">Predefinito del Mac</option>
              {devices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label || "Dispositivo senza nome"}</option>
              ))}
            </select>
          </div>
          <button className={btnSecondary} onClick={async () => setDevices(await listAudioInputs())}>Aggiorna elenco</button>
          <button className={btnSecondary} onClick={saveDevice}>Usa come predefinito</button>
        </div>

        {rec.recording ? (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-2xl font-semibold tabular-nums">{formatDuration(rec.seconds)}</span>
              <button className={btnRed} onClick={stop}><Square size={14} /> Ferma</button>
            </div>
            <LevelMeter level={rec.level} />
            <p className="text-xs text-slate-500">La barra verde deve muoversi sia quando parli tu sia quando parla l&apos;altra persona.</p>
          </div>
        ) : (
          <button className={btnPrimary} onClick={start}><Mic size={16} /> Avvia registrazione</button>
        )}

        {audioUrl && (
          <div className="space-y-3">
            <audio controls src={audioUrl} className="w-full" />
            <button className={btnSecondary} onClick={transcribe} disabled={busy}>{busy ? "Trascrivo…" : "Trascrivi"}</button>
          </div>
        )}
        {transcript && <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm">{transcript}</pre>}
        {error && <p className="text-sm text-slate-700">{error}</p>}
      </Card>

      <Card className="mt-6 space-y-3 text-sm text-slate-700" >
        <h2 id="blackhole" className="text-base font-semibold text-slate-900">Solo se la qualità non basta: BlackHole</h2>
        <p>BlackHole è un programma gratuito che permette di registrare l&apos;audio della chiamata in modo pulito, anche con le cuffie. Si fa una volta sola, circa 15 minuti.</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Scarica e installa <b>BlackHole 2ch</b> da <a className={link} href="https://existential.audio/blackhole/" target="_blank">existential.audio/blackhole</a> (ti chiede la tua email, è gratis). Riavvia il Mac.</li>
          <li>Apri <b>Configurazione MIDI Audio</b> (cercalo con Spotlight, ⌘+Spazio).</li>
          <li>In basso a sinistra premi <b>+</b> → <b>Crea dispositivo a uscita multipla</b>. Spunta le tue cuffie (o &quot;Altoparlanti MacBook&quot;) <b>e</b> &quot;BlackHole 2ch&quot;. Mettilo come uscita del Mac (tasto destro → &quot;Usa questo dispositivo per l&apos;uscita audio&quot;).</li>
          <li>Premi di nuovo <b>+</b> → <b>Crea dispositivo aggregato</b>. Spunta il <b>microfono</b> (es. &quot;Microfono MacBook&quot;) <b>e</b> &quot;BlackHole 2ch&quot;. Rinominalo &quot;Registrazione chiamate&quot;.</li>
          <li>Torna qui, premi &quot;Aggiorna elenco&quot;, scegli &quot;Registrazione chiamate&quot; e premi &quot;Usa come predefinito&quot;. Rifai la prova.</li>
        </ol>
        <p className="text-xs text-slate-500">Nota: con l&apos;uscita multipla il volume del Mac non si regola dai tasti; si regola dalle cuffie o dalla Configurazione MIDI Audio. Finite le chiamate puoi rimettere l&apos;uscita normale.</p>
      </Card>
    </>
  );
}
