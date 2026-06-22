-- =========================================================
-- CHIRP FIX/PATCH SQL
-- Pegar en Supabase SQL Editor.
-- No intenta hacer ALTER TABLE storage.objects ENABLE RLS.
-- =========================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- Media: compatibilidad con storage_bucket/storage_path.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'chirp_media'
  ) then
    alter table public.chirp_media
      add column if not exists storage_bucket text not null default 'chirp-media';

    alter table public.chirp_media
      add column if not exists storage_path text;

    alter table public.chirp_media
      add column if not exists media_url text;
  end if;
end $$;

-- Eventos de seguridad para cambios de contraseña/email y flujo sensible.
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  metadata jsonb not null default '{}'::jsonb,
  user_agent text,
  ip_address inet,
  created_at timestamptz not null default now()
);

create index if not exists security_events_user_created_idx
on public.security_events (user_id, created_at desc);

alter table public.security_events enable row level security;

drop policy if exists "security_events_select_own" on public.security_events;
create policy "security_events_select_own"
on public.security_events
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "security_events_insert_own" on public.security_events;
create policy "security_events_insert_own"
on public.security_events
for insert
to authenticated
with check (auth.uid() = user_id);

-- Tickets de soporte desde la app.
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint support_tickets_status_check check (status in ('open', 'reviewing', 'closed'))
);

create index if not exists support_tickets_user_created_idx
on public.support_tickets (user_id, created_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists "support_tickets_insert_own" on public.support_tickets;
create policy "support_tickets_insert_own"
on public.support_tickets
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "support_tickets_select_own" on public.support_tickets;
create policy "support_tickets_select_own"
on public.support_tickets
for select
to authenticated
using (auth.uid() = user_id);

-- Updated_at helper.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists support_tickets_set_updated_at on public.support_tickets;
create trigger support_tickets_set_updated_at
before update on public.support_tickets
for each row execute function public.set_updated_at();

-- Buckets necesarios.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('banners', 'banners', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif']),
  ('chirp-media', 'chirp-media', false, 52428800, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Helper seguro para leer UUID en rutas de storage.
create or replace function public.try_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  return value::uuid;
exception when others then
  return null;
end;
$$;

-- Storage policies. Requiere que existan public.can_read_chirp(uuid) y tablas del setup base.
drop policy if exists "storage_public_read_avatars_banners" on storage.objects;
create policy "storage_public_read_avatars_banners"
on storage.objects
for select
to anon, authenticated
using (bucket_id in ('avatars', 'banners'));

drop policy if exists "storage_read_visible_chirp_media" on storage.objects;
create policy "storage_read_visible_chirp_media"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'chirp-media'
  and public.can_read_chirp(public.try_uuid((storage.foldername(name))[2]))
);

drop policy if exists "storage_insert_own_assets" on storage.objects;
create policy "storage_insert_own_assets"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('avatars', 'banners', 'chirp-media')
  and auth.uid()::text = (storage.foldername(name))[1]
  and (
    bucket_id in ('avatars', 'banners')
    or (
      bucket_id = 'chirp-media'
      and exists (
        select 1 from public.chirps c
        where c.id = public.try_uuid((storage.foldername(name))[2])
          and c.author_id = auth.uid()
      )
    )
  )
);

drop policy if exists "storage_update_own_assets" on storage.objects;
create policy "storage_update_own_assets"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('avatars', 'banners', 'chirp-media')
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id in ('avatars', 'banners', 'chirp-media')
  and auth.uid()::text = (storage.foldername(name))[1]
);

drop policy if exists "storage_delete_own_assets" on storage.objects;
create policy "storage_delete_own_assets"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('avatars', 'banners', 'chirp-media')
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- Grants seguros para tablas nuevas.
grant select, insert on public.security_events to authenticated;
grant select, insert on public.support_tickets to authenticated;

-- =========================================================
-- FIN
-- =========================================================
