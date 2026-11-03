# Cold Call Dashboard

Web app interna per chiamate a freddo: ricerca lead (Google Places), coda chiamate con script,
chiamata dal Mac via iPhone (link `tel:`), registrazione dal browser, trascrizione (Deepgram),
analisi con Claude, automazioni con conferma (WhatsApp `wa.me`, Google Calendar con Meet), mini CRM,
script e materiali.

## Tecnologie
Next.js 15 (App Router) · Supabase (database, login, file) · Vercel · Deepgram · Claude API · Google Places API (New) · Google Calendar API

## Messa in funzione
1. Supabase: esegui `supabase/schema.sql` nel SQL Editor, crea il tuo utente in Authentication > Users, disattiva le iscrizioni pubbliche.
2. Vercel: importa il repo e inserisci le variabili di `.env.example`.
3. Google OAuth: redirect URI `https://<dominio>/api/google/callback`.

Sviluppo locale: `cp .env.example .env.local`, compila le chiavi, `npm install && npm run dev`.

## Note
- Le chiavi API stanno solo lato server (tranne URL e chiave pubblica di Supabase, protette dalle regole RLS).
- Gli audio vengono cancellati dopo 30 giorni (Vercel Cron giornaliero su `/api/cron/cleanup`).
- Nessun WhatsApp o evento in calendario parte senza conferma esplicita.
