/**
 * Trascrizione con Deepgram (italiano, separazione delle voci).
 * Riceve un URL temporaneo del file audio.
 */
interface DGUtterance {
  speaker?: number;
  transcript: string;
}

async function callDeepgram(audioUrl: string, model: string) {
  const params = new URLSearchParams({
    model,
    language: "it",
    diarize: "true",
    smart_format: "true",
    punctuate: "true",
    utterances: "true",
  });
  return fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: audioUrl }),
  });
}

export async function transcribeAudio(audioUrl: string): Promise<string> {
  if (!process.env.DEEPGRAM_API_KEY) throw new Error("Manca la chiave DEEPGRAM_API_KEY");
  const primary = process.env.DEEPGRAM_MODEL || "nova-3";
  let res = await callDeepgram(audioUrl, primary);
  if (res.status === 400 && primary !== "nova-2") {
    // alcuni modelli potrebbero non supportare l'italiano: si riprova con nova-2
    res = await callDeepgram(audioUrl, "nova-2");
  }
  const json = await res.json();
  if (!res.ok) throw new Error(`Trascrizione fallita: ${json.err_msg || res.status}`);

  const utterances: DGUtterance[] = json.results?.utterances ?? [];
  if (utterances.length) {
    const lines: string[] = [];
    for (const u of utterances) {
      const who = `Voce ${(u.speaker ?? 0) + 1}`;
      const last = lines[lines.length - 1];
      if (last && last.startsWith(who + ":")) lines[lines.length - 1] = `${last} ${u.transcript}`;
      else lines.push(`${who}: ${u.transcript}`);
    }
    return lines.join("\n");
  }
  return json.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? "";
}
