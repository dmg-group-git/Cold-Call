"use client";
import { useCallback, useEffect, useRef, useState } from "react";

function pickMime(): string {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  for (const t of types) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

/** Registrazione audio dal microfono scelto (o da un dispositivo aggregato BlackHole). */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const raf = useRef<number | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);

  const cleanup = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (raf.current) cancelAnimationFrame(raf.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    streamRef.current = null;
    setLevel(0);
  }, []);

  useEffect(() => cleanup, [cleanup]);

  const start = useCallback(async (deviceId?: string | null) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        // disattivati: altrimenti il browser "pulisce" via la voce del cliente che esce dall'altoparlante
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: true,
        channelCount: 1,
      },
    });
    streamRef.current = stream;
    const mimeType = pickMime();
    const rec = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32000 });
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.start(1000);
    recRef.current = rec;
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);

    // indicatore volume
    try {
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let max = 0;
        for (const v of data) max = Math.max(max, Math.abs(v - 128));
        setLevel(Math.min(1, max / 64));
        raf.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {}
  }, []);

  const stop = useCallback((): Promise<{ blob: Blob; seconds: number; ext: string } | null> => {
    return new Promise((resolve) => {
      const rec = recRef.current;
      if (!rec || rec.state === "inactive") {
        cleanup();
        setRecording(false);
        return resolve(null);
      }
      const secs = seconds;
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(chunks.current, { type });
        cleanup();
        setRecording(false);
        resolve({ blob, seconds: secs, ext: type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm" });
      };
      rec.stop();
    });
  }, [cleanup, seconds]);

  const cancel = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") {
      rec.onstop = null;
      rec.stop();
    }
    chunks.current = [];
    cleanup();
    setRecording(false);
  }, [cleanup]);

  return { recording, seconds, level, start, stop, cancel };
}

export async function listAudioInputs(): Promise<MediaDeviceInfo[]> {
  // serve un permesso per vedere i nomi dei dispositivi
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true });
    s.getTracks().forEach((t) => t.stop());
  } catch {}
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === "audioinput");
}
