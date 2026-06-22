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

-- =========================================================
-- SIGNUP FIX: el trigger de auth.users NO debe bloquear registros.
-- Compatible con el SQL base de Chirp usado para crear profiles/account_settings.
-- =========================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  generated_username text;
  generated_display_name text;
begin
  generated_username := 'user_' || substr(replace(new.id::text, '-', ''), 1, 24);

  generated_display_name := left(
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(new.raw_user_meta_data->>'name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Nuevo usuario'
    ),
    50
  );

  begin
    insert into public.profiles (
      id,
      username,
      display_name,
      avatar_url
    )
    values (
      new.id,
      generated_username,
      generated_display_name,
      new.raw_user_meta_data->>'avatar_url'
    )
    on conflict (id) do nothing;
  exception
    when others then
      raise warning 'Chirp handle_new_user/profiles failed for user %: %', new.id, sqlerrm;
  end;

  begin
    insert into public.account_settings (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  exception
    when others then
      raise warning 'Chirp handle_new_user/account_settings failed for user %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

create or replace function public.ensure_current_user_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  jwt jsonb := auth.jwt();
  email_text text := coalesce(jwt->>'email', '');
  generated_username text;
  generated_display_name text;
  profile_row public.profiles;
begin
  if current_user_id is null then
    raise exception 'Not authenticated';
  end if;

  generated_username := 'user_' || substr(replace(current_user_id::text, '-', ''), 1, 24);

  generated_display_name := left(
    coalesce(
      nullif(jwt->'user_metadata'->>'display_name', ''),
      nullif(jwt->'user_metadata'->>'name', ''),
      nullif(split_part(email_text, '@', 1), ''),
      'Nuevo usuario'
    ),
    50
  );

  insert into public.profiles (
    id,
    username,
    display_name,
    avatar_url
  )
  values (
    current_user_id,
    generated_username,
    generated_display_name,
    jwt->'user_metadata'->>'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.account_settings (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select *
  into profile_row
  from public.profiles
  where id = current_user_id;

  return profile_row;
end;
$$;

grant execute on function public.ensure_current_user_profile() to authenticated;

-- Permisos mínimos extra por si el proyecto quedó con grants estrictos.
grant insert on public.profiles to authenticated;
grant select on public.profiles to anon, authenticated;
grant select on public.account_settings to authenticated;
