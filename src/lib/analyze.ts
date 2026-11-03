import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Analysis } from "./types";

const AnalysisSchema = z.object({
  esito: z.enum(["non_risponde", "da_richiamare", "interessato", "non_interessato"]),
  riassunto: z.string(),
  obiezioni: z.array(z.string()),
  prossimo_passo: z.string(),
  tipo_appuntamento: z.enum(["videocall", "richiamata", "nessuno"]),
  data_appuntamento: z.string().nullable(),
  nome_referente: z.string().nullable(),
  email_lead: z.string().nullable(),
  consigli: z.object({
    bene: z.array(z.string()),
    migliorare: z.array(z.string()),
  }),
});

const SYSTEM = `Analizzi trascrizioni di chiamate commerciali a freddo in italiano, fatte da un commerciale a strutture ricettive o attività locali.
La trascrizione separa le voci come "Voce 1", "Voce 2": capisci dal contesto chi è il commerciale e chi il cliente. La qualità può essere bassa (registrazione in vivavoce): deduci con buon senso.

Restituisci:
- esito: "non_risponde" (nessuno ha risposto, segreteria, chiamata non avvenuta), "da_richiamare" (vuole essere richiamato o non era la persona giusta/momento giusto), "interessato" (vuole info, materiali o una videocall), "non_interessato" (ha detto chiaramente di no).
- riassunto: 2-4 frasi, concrete.
- obiezioni: le obiezioni del cliente, brevi (lista vuota se nessuna).
- prossimo_passo: cosa deve fare il commerciale, una frase.
- tipo_appuntamento: "videocall" se è stata concordata una videochiamata/demo, "richiamata" se è stato concordato quando richiamare, altrimenti "nessuno".
- data_appuntamento: data e ora concordate nel formato "YYYY-MM-DDTHH:mm" (ora italiana), risolvendo espressioni come "giovedì alle 10" rispetto alla data di oggi indicata. Se c'è solo il giorno senza ora, usa le 10:00. null se non concordata.
- nome_referente: nome della persona con cui si è parlato, se detto, altrimenti null.
- email_lead: email del cliente se dettata, altrimenti null.
- consigli: sei anche un coach di vendita. Dai consigli al COMMERCIALE (non al cliente), in italiano semplice e diretto, dandogli del tu.
  - bene: 1-3 cose concrete che ha fatto bene in questa chiamata.
  - migliorare: 1-3 cose concrete da fare diversamente la prossima volta. Per ognuna, se utile, suggerisci la frase esatta da dire tra virgolette (es. come rispondere a un'obiezione, come chiedere l'appuntamento).
  Se la chiamata non è avvenuta o è troppo breve per giudicare, lascia entrambe le liste vuote.`;

export async function analyzeTranscript(transcript: string, leadName: string): Promise<Analysis> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("Manca la chiave ANTHROPIC_API_KEY");
  const client = new Anthropic();
  const today = new Date().toLocaleString("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  if (!transcript.trim()) {
    return {
      esito: "non_risponde",
      riassunto: "Nessuna voce rilevata nella registrazione.",
      obiezioni: [],
      prossimo_passo: "Riprovare a chiamare o inviare il WhatsApp.",
      tipo_appuntamento: "nessuno",
      data_appuntamento: null,
      nome_referente: null,
      email_lead: null,
      consigli: { bene: [], migliorare: [] },
    };
  }

  const response = await client.messages.parse({
    model: process.env.CLAUDE_MODEL || "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(AnalysisSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Oggi è ${today}.\nStruttura chiamata: ${leadName}\n\nTRASCRIZIONE:\n${transcript}`,
      },
    ],
  });

  if (!response.parsed_output) {
    throw new Error(
      response.stop_reason === "refusal"
        ? "Claude non ha potuto analizzare questa chiamata"
        : "Risposta di Claude non leggibile",
    );
  }
  return response.parsed_output;
}
