export const metadata = { title: "Privacy - Cold Call Dashboard" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-6 text-sm leading-relaxed text-slate-700">
      <h1 className="text-2xl font-semibold text-slate-900">Informativa privacy (bozza)</h1>
      <p className="rounded-lg bg-amber-50 p-3 text-amber-900">
        Bozza da completare e far verificare da un consulente privacy prima dell&apos;uso.
      </p>
      <h2 className="font-semibold text-slate-900">Titolare del trattamento</h2>
      <p>[Ragione sociale, indirizzo, P.IVA, email di contatto]</p>
      <h2 className="font-semibold text-slate-900">Quali dati trattiamo</h2>
      <p>Dati di contatto delle attività (nome, telefono, indirizzo, sito) ricavati da fonti pubbliche come Google; registrazioni audio, trascrizioni e riassunti delle telefonate, solo con il consenso dell&apos;interlocutore comunicato all&apos;inizio della chiamata.</p>
      <h2 className="font-semibold text-slate-900">Perché</h2>
      <p>Per contattare le attività a fini commerciali (legittimo interesse) e per gestire la relazione commerciale. Le registrazioni servono a documentare la chiamata e a ricavarne un riassunto.</p>
      <h2 className="font-semibold text-slate-900">Per quanto tempo</h2>
      <p>Le registrazioni audio sono cancellate automaticamente dopo 30 giorni; restano trascrizione e riassunto finché dura il rapporto commerciale o fino a opposizione.</p>
      <h2 className="font-semibold text-slate-900">Fornitori</h2>
      <p>Supabase (database e archivio), Vercel (hosting), Deepgram (trascrizione), Anthropic (analisi del testo), Google (ricerca attività e calendario). Con ciascuno va sottoscritto l&apos;accordo sul trattamento dei dati (DPA).</p>
      <h2 className="font-semibold text-slate-900">I tuoi diritti</h2>
      <p>Puoi chiedere accesso, rettifica, cancellazione, opporti al trattamento o chiedere di non essere più contattato scrivendo a [email]. Puoi presentare reclamo al Garante per la protezione dei dati personali.</p>
    </main>
  );
}
