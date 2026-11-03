-- =========================================================
-- Cold Call Dashboard - struttura del database
-- Da incollare UNA volta in Supabase > SQL Editor > Run
-- =========================================================

-- LEAD (le strutture da chiamare)
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  contact_person text,
  phone text unique,               -- formato +39...
  email text,
  website text,
  address text,
  city text,
  province text,
  category text,
  place_id text unique,            -- ID Google del posto
  rating numeric,
  reviews_count int,
  status text not null default 'nuovo'
    check (status in ('nuovo','contattato','ha_risposto','demo','in_prova','cliente','perso')),
  next_action_at timestamptz,      -- quando richiamare (torna in coda)
  notes text
);
create index if not exists leads_status_idx on public.leads(status);
create index if not exists leads_next_idx on public.leads(next_action_at);

-- INTERAZIONI (chiamate, WhatsApp, note, eventi)
create table if not exists public.interactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  type text not null check (type in ('call','whatsapp','note','event')),
  outcome text,                    -- non_risponde, da_richiamare, interessato, non_interessato
  summary text,
  objections text[],
  next_step text,
  transcript text,
  recording_path text,             -- percorso del file audio (cancellato dopo 30 giorni)
  recording_deleted boolean not null default false,
  duration_sec int,
  analysis_status text,            -- in_corso, completata, errore
  data jsonb
);
create index if not exists interactions_lead_idx on public.interactions(lead_id, created_at desc);

-- SCRIPT (chiamata e WhatsApp)
create table if not exists public.scripts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('call','wa_no_answer','wa_answered')),
  title text not null,
  body text not null default '',
  updated_at timestamptz not null default now()
);

-- MATERIALI (PDF, video, link)
create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  kind text not null check (kind in ('pdf','video','link')),
  url text not null,
  storage_path text
);

-- NON CONTATTARE
create table if not exists public.do_not_contact (
  phone text primary key,
  name text,
  reason text,
  created_at timestamptz not null default now()
);

-- IMPOSTAZIONI (una sola riga)
create table if not exists public.settings (
  id int primary key default 1 check (id = 1),
  company_name text default '',
  company_website text default '',
  company_contacts text default '',
  sender_name text default '',
  audio_device_id text,
  audio_device_label text,
  meeting_minutes int not null default 30,
  calendar_id text default 'primary',
  google_email text
);
insert into public.settings (id) values (1) on conflict do nothing;

-- TOKEN GOOGLE (leggibili solo dal server, mai dal browser)
create table if not exists public.google_tokens (
  id int primary key default 1 check (id = 1),
  refresh_token text,
  access_token text,
  expires_at timestamptz
);

-- ---------------------------------------------------------
-- SICUREZZA: solo utenti loggati possono leggere/scrivere
-- ---------------------------------------------------------
alter table public.leads enable row level security;
alter table public.interactions enable row level security;
alter table public.scripts enable row level security;
alter table public.materials enable row level security;
alter table public.do_not_contact enable row level security;
alter table public.settings enable row level security;
alter table public.google_tokens enable row level security; -- nessuna regola = nessun accesso dal browser

do $$
declare t text;
begin
  foreach t in array array['leads','interactions','scripts','materials','do_not_contact','settings'] loop
    execute format('drop policy if exists "auth_all" on public.%I', t);
    execute format('create policy "auth_all" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------
-- ARCHIVIO FILE
-- recordings = privato (audio chiamate)
-- materials  = pubblico (PDF da mandare via WhatsApp)
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public) values ('recordings','recordings', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('materials','materials', true) on conflict do nothing;

drop policy if exists "auth_recordings" on storage.objects;
create policy "auth_recordings" on storage.objects for all to authenticated
  using (bucket_id in ('recordings','materials')) with check (bucket_id in ('recordings','materials'));

-- ---------------------------------------------------------
-- SCRIPT DI PARTENZA (modificabili dalla pagina Script)
-- ---------------------------------------------------------
insert into public.scripts (kind, title, body)
select 'call', 'Script chiamata', 'Buongiorno, parlo con {struttura}? Sono {mio_nome} di {azienda}.

Vi avviso che la chiamata è registrata per finalità di servizio, va bene?

[Presentazione in 20 secondi: chi siamo e cosa facciamo per strutture come la vostra a {città}]

Domanda: come gestite oggi ...?

Se interessato: le propongo una videocall di 20 minuti per mostrarle come funziona. Le va bene [giorno] alle [ora]?'
where not exists (select 1 from public.scripts where kind = 'call');

insert into public.scripts (kind, title, body)
select 'wa_no_answer', 'WhatsApp - non risponde', 'Buongiorno {nome}, sono {mio_nome} di {azienda}. Ho provato a chiamarvi poco fa per presentarvi un servizio pensato per strutture come {struttura}. Quando posso richiamarvi?
{sito}'
where not exists (select 1 from public.scripts where kind = 'wa_no_answer');

insert into public.scripts (kind, title, body)
select 'wa_answered', 'WhatsApp - ha risposto', 'Buongiorno {nome}, grazie per il tempo al telefono! Come promesso le lascio qualche informazione su {azienda}:
{materiali}

Sito: {sito}
Contatti: {riferimenti}

A presto,
{mio_nome}'
where not exists (select 1 from public.scripts where kind = 'wa_answered');

-- ---------------------------------------------------------
-- AGGIORNAMENTO 2026-11-03: allegati negli script WhatsApp
-- ---------------------------------------------------------
alter table public.scripts add column if not exists material_ids uuid[] not null default '{}';
alter table public.materials drop constraint if exists materials_kind_check;
alter table public.materials add constraint materials_kind_check check (kind in ('pdf','video','link','file'));

-- ---------------------------------------------------------
-- AGGIORNAMENTO 2026-11-03: ricerche salvate
-- ---------------------------------------------------------
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  params jsonb not null default '{}',
  seen_ids text[] not null default '{}',
  last_run_at timestamptz
);
alter table public.saved_searches enable row level security;
drop policy if exists "auth_all" on public.saved_searches;
create policy "auth_all" on public.saved_searches for all to authenticated using (true) with check (true);
