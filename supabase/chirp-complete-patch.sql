-- =========================================================
-- CHIRP - SQL COMPLETO / PATCH IDÉMPOTENTE SUPABASE
-- Pegar en Supabase SQL Editor.
-- No desactiva RLS.
-- No ejecuta ALTER TABLE storage.objects ENABLE RLS.
-- =========================================================

create extension if not exists pgcrypto;
create extension if not exists citext;

-- =========================================================
-- TABLAS BASE NECESARIAS PARA LA APP
-- =========================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
  display_name text not null,
  bio text,
  avatar_url text,
  banner_url text,
  website text,
  location text,
  is_private boolean not null default false,
  is_verified boolean not null default false,
  is_suspended boolean not null default false,
  chirps_count int not null default 0,
  followers_count int not null default 0,
  following_count int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username citext;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists banner_url text;
alter table public.profiles add column if not exists website text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists is_private boolean not null default false;
alter table public.profiles add column if not exists is_verified boolean not null default false;
alter table public.profiles add column if not exists is_suspended boolean not null default false;
alter table public.profiles add column if not exists chirps_count int not null default 0;
alter table public.profiles add column if not exists followers_count int not null default 0;
alter table public.profiles add column if not exists following_count int not null default 0;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

create table if not exists public.account_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  allow_dm_from text not null default 'following',
  show_email boolean not null default false,
  show_phone boolean not null default false,
  theme text not null default 'system',
  language text not null default 'es',
  email_notifications boolean not null default true,
  push_notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.account_settings add column if not exists allow_dm_from text not null default 'following';
alter table public.account_settings add column if not exists show_email boolean not null default false;
alter table public.account_settings add column if not exists show_phone boolean not null default false;
alter table public.account_settings add column if not exists theme text not null default 'system';
alter table public.account_settings add column if not exists language text not null default 'es';
alter table public.account_settings add column if not exists email_notifications boolean not null default true;
alter table public.account_settings add column if not exists push_notifications boolean not null default true;
alter table public.account_settings add column if not exists created_at timestamptz not null default now();
alter table public.account_settings add column if not exists updated_at timestamptz not null default now();

create table if not exists public.chirps (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text,
  reply_to_id uuid references public.chirps(id) on delete set null,
  root_chirp_id uuid references public.chirps(id) on delete set null,
  quote_chirp_id uuid references public.chirps(id) on delete set null,
  visibility text not null default 'public',
  is_sensitive boolean not null default false,
  is_edited boolean not null default false,
  likes_count int not null default 0,
  replies_count int not null default 0,
  rechirps_count int not null default 0,
  quotes_count int not null default 0,
  bookmarks_count int not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.chirps add column if not exists author_id uuid references public.profiles(id) on delete cascade;
alter table public.chirps add column if not exists content text;
alter table public.chirps add column if not exists reply_to_id uuid references public.chirps(id) on delete set null;
alter table public.chirps add column if not exists root_chirp_id uuid references public.chirps(id) on delete set null;
alter table public.chirps add column if not exists quote_chirp_id uuid references public.chirps(id) on delete set null;
alter table public.chirps add column if not exists visibility text not null default 'public';
alter table public.chirps add column if not exists is_sensitive boolean not null default false;
alter table public.chirps add column if not exists is_edited boolean not null default false;
alter table public.chirps add column if not exists likes_count int not null default 0;
alter table public.chirps add column if not exists replies_count int not null default 0;
alter table public.chirps add column if not exists rechirps_count int not null default 0;
alter table public.chirps add column if not exists quotes_count int not null default 0;
alter table public.chirps add column if not exists bookmarks_count int not null default 0;
alter table public.chirps add column if not exists deleted_at timestamptz;
alter table public.chirps add column if not exists created_at timestamptz not null default now();
alter table public.chirps add column if not exists updated_at timestamptz not null default now();

create table if not exists public.chirp_media (
  id uuid primary key default gen_random_uuid(),
  chirp_id uuid not null references public.chirps(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_bucket text not null default 'chirp-media',
  storage_path text,
  media_url text,
  media_type text not null default 'image',
  alt_text text,
  width int,
  height int,
  duration_seconds int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.chirp_media add column if not exists storage_bucket text not null default 'chirp-media';
alter table public.chirp_media add column if not exists storage_path text;
alter table public.chirp_media add column if not exists media_url text;
alter table public.chirp_media add column if not exists media_type text not null default 'image';
alter table public.chirp_media add column if not exists alt_text text;
alter table public.chirp_media add column if not exists width int;
alter table public.chirp_media add column if not exists height int;
alter table public.chirp_media add column if not exists duration_seconds int;
alter table public.chirp_media add column if not exists sort_order int not null default 0;
alter table public.chirp_media add column if not exists created_at timestamptz not null default now();

create table if not exists public.likes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chirp_id uuid not null references public.chirps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, chirp_id)
);

create table if not exists public.bookmarks (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chirp_id uuid not null references public.chirps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, chirp_id)
);

create table if not exists public.rechirps (
  user_id uuid not null references public.profiles(id) on delete cascade,
  chirp_id uuid not null references public.chirps(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, chirp_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  following_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id)
);

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create table if not exists public.mutes (
  muter_id uuid not null references public.profiles(id) on delete cascade,
  muted_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (muter_id, muted_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete cascade,
  chirp_id uuid references public.chirps(id) on delete cascade,
  type text not null,
  is_read boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  dedupe_key text unique,
  created_at timestamptz not null default now()
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  type text not null default 'other',
  subject text not null,
  message text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- ÍNDICES
-- =========================================================

create index if not exists profiles_username_idx on public.profiles (username);
create index if not exists chirps_author_created_idx on public.chirps (author_id, created_at desc);
create index if not exists chirps_created_idx on public.chirps (created_at desc) where deleted_at is null;
create index if not exists chirps_reply_to_idx on public.chirps (reply_to_id);
create index if not exists chirp_media_chirp_idx on public.chirp_media (chirp_id);
create index if not exists chirp_media_storage_idx on public.chirp_media (storage_bucket, storage_path);
create index if not exists likes_chirp_idx on public.likes (chirp_id);
create index if not exists bookmarks_user_created_idx on public.bookmarks (user_id, created_at desc);
create index if not exists rechirps_chirp_idx on public.rechirps (chirp_id);
create index if not exists follows_follower_idx on public.follows (follower_id);
create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists security_events_user_created_idx on public.security_events (user_id, created_at desc);
create index if not exists support_requests_user_created_idx on public.support_requests (user_id, created_at desc);
create index if not exists support_requests_status_created_idx on public.support_requests (status, created_at desc);

-- =========================================================
-- FUNCIONES
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

create or replace function public.is_following(viewer_id uuid, target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when viewer_id is null or target_id is null then false
    else exists (
      select 1 from public.follows f
      where f.follower_id = viewer_id and f.following_id = target_id
    )
  end;
$$;

create or replace function public.is_blocked(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when user_a is null or user_b is null then false
    else exists (
      select 1 from public.blocks b
      where (b.blocker_id = user_a and b.blocked_id = user_b)
         or (b.blocker_id = user_b and b.blocked_id = user_a)
    )
  end;
$$;

create or replace function public.can_read_chirp_row(chirp_row public.chirps)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  author_private boolean := false;
begin
  if chirp_row.id is null or chirp_row.deleted_at is not null then
    return false;
  end if;

  if current_user_id = chirp_row.author_id then
    return true;
  end if;

  if public.is_blocked(current_user_id, chirp_row.author_id) then
    return false;
  end if;

  select p.is_private into author_private from public.profiles p where p.id = chirp_row.author_id;

  if author_private then
    return current_user_id is not null and public.is_following(current_user_id, chirp_row.author_id);
  end if;

  if chirp_row.visibility = 'public' then
    return true;
  end if;

  if chirp_row.visibility = 'followers' then
    return current_user_id is not null and public.is_following(current_user_id, chirp_row.author_id);
  end if;

  return false;
end;
$$;

create or replace function public.can_read_chirp(chirp_id_to_check uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  chirp_record public.chirps;
begin
  if chirp_id_to_check is null then return false; end if;
  select * into chirp_record from public.chirps where id = chirp_id_to_check;
  if chirp_record.id is null then return false; end if;
  return public.can_read_chirp_row(chirp_record);
end;
$$;

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
      split_part(coalesce(new.email, 'usuario'), '@', 1),
      'Nuevo usuario'
    ),
    50
  );

  insert into public.profiles (id, username, display_name, avatar_url)
  values (new.id, generated_username, generated_display_name, new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;

  insert into public.account_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create or replace function public.handle_chirp_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set chirps_count = chirps_count + 1 where id = new.author_id;
    if new.reply_to_id is not null then update public.chirps set replies_count = replies_count + 1 where id = new.reply_to_id; end if;
    if new.quote_chirp_id is not null then update public.chirps set quotes_count = quotes_count + 1 where id = new.quote_chirp_id; end if;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles set chirps_count = greatest(0, chirps_count - 1) where id = old.author_id;
    if old.reply_to_id is not null then update public.chirps set replies_count = greatest(0, replies_count - 1) where id = old.reply_to_id; end if;
    if old.quote_chirp_id is not null then update public.chirps set quotes_count = greatest(0, quotes_count - 1) where id = old.quote_chirp_id; end if;
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.handle_like_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then update public.chirps set likes_count = likes_count + 1 where id = new.chirp_id; return new; end if;
  if tg_op = 'DELETE' then update public.chirps set likes_count = greatest(0, likes_count - 1) where id = old.chirp_id; return old; end if;
  return null;
end;
$$;

create or replace function public.handle_bookmark_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then update public.chirps set bookmarks_count = bookmarks_count + 1 where id = new.chirp_id; return new; end if;
  if tg_op = 'DELETE' then update public.chirps set bookmarks_count = greatest(0, bookmarks_count - 1) where id = old.chirp_id; return old; end if;
  return null;
end;
$$;

create or replace function public.handle_rechirp_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then update public.chirps set rechirps_count = rechirps_count + 1 where id = new.chirp_id; return new; end if;
  if tg_op = 'DELETE' then update public.chirps set rechirps_count = greatest(0, rechirps_count - 1) where id = old.chirp_id; return old; end if;
  return null;
end;
$$;

create or replace function public.handle_follow_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
    return new;
  end if;
  if tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.following_id;
    return old;
  end if;
  return null;
end;
$$;

-- =========================================================
-- TRIGGERS
-- =========================================================

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists account_settings_set_updated_at on public.account_settings;
create trigger account_settings_set_updated_at before update on public.account_settings for each row execute function public.set_updated_at();

drop trigger if exists support_requests_set_updated_at on public.support_requests;
create trigger support_requests_set_updated_at before update on public.support_requests for each row execute function public.set_updated_at();

drop trigger if exists chirps_counts on public.chirps;
create trigger chirps_counts after insert or delete on public.chirps for each row execute function public.handle_chirp_counts();

drop trigger if exists likes_counts on public.likes;
create trigger likes_counts after insert or delete on public.likes for each row execute function public.handle_like_counts();

drop trigger if exists bookmarks_counts on public.bookmarks;
create trigger bookmarks_counts after insert or delete on public.bookmarks for each row execute function public.handle_bookmark_counts();

drop trigger if exists rechirps_counts on public.rechirps;
create trigger rechirps_counts after insert or delete on public.rechirps for each row execute function public.handle_rechirp_counts();

drop trigger if exists follows_counts on public.follows;
create trigger follows_counts after insert or delete on public.follows for each row execute function public.handle_follow_counts();

-- =========================================================
-- MIGRACIÓN DE USUARIOS EXISTENTES
-- =========================================================

insert into public.profiles (id, username, display_name)
select
  u.id,
  'user_' || substr(replace(u.id::text, '-', ''), 1, 24),
  left(coalesce(nullif(u.raw_user_meta_data->>'display_name',''), nullif(u.raw_user_meta_data->>'name',''), split_part(coalesce(u.email,'usuario'),'@',1), 'Nuevo usuario'), 50)
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
on conflict (id) do nothing;

insert into public.account_settings (user_id)
select p.id from public.profiles p
left join public.account_settings s on s.user_id = p.id
where s.user_id is null
on conflict (user_id) do nothing;

-- =========================================================
-- STORAGE BUCKETS
-- =========================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars','avatars',true,5242880,array['image/jpeg','image/png','image/webp','image/gif']),
  ('banners','banners',true,10485760,array['image/jpeg','image/png','image/webp','image/gif']),
  ('chirp-media','chirp-media',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/webm','audio/wav'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- =========================================================
-- GRANTS
-- =========================================================

grant usage on schema public to anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant insert, update on public.profiles to authenticated;
grant select, update on public.account_settings to authenticated;
grant select on public.chirps to anon, authenticated;
grant insert, update, delete on public.chirps to authenticated;
grant select on public.chirp_media to anon, authenticated;
grant insert, update, delete on public.chirp_media to authenticated;
grant select on public.likes to anon, authenticated;
grant insert, delete on public.likes to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant select on public.rechirps to anon, authenticated;
grant insert, delete on public.rechirps to authenticated;
grant select on public.follows to anon, authenticated;
grant insert, delete on public.follows to authenticated;
grant select, insert, delete on public.blocks to authenticated;
grant select, insert, delete on public.mutes to authenticated;
grant select, update, delete on public.notifications to authenticated;
grant select, insert on public.security_events to authenticated;
grant select, insert on public.support_requests to authenticated;

-- =========================================================
-- RLS
-- =========================================================

alter table public.profiles enable row level security;
alter table public.account_settings enable row level security;
alter table public.chirps enable row level security;
alter table public.chirp_media enable row level security;
alter table public.likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.rechirps enable row level security;
alter table public.follows enable row level security;
alter table public.blocks enable row level security;
alter table public.mutes enable row level security;
alter table public.notifications enable row level security;
alter table public.security_events enable row level security;
alter table public.support_requests enable row level security;

-- Profiles

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public" on public.profiles for select to anon, authenticated
using (auth.uid() = id or (is_suspended = false and public.is_blocked(auth.uid(), id) = false));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Account settings

drop policy if exists "account_settings_select_own" on public.account_settings;
create policy "account_settings_select_own" on public.account_settings for select to authenticated using (auth.uid() = user_id);

drop policy if exists "account_settings_update_own" on public.account_settings;
create policy "account_settings_update_own" on public.account_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Chirps

drop policy if exists "chirps_select_visible" on public.chirps;
create policy "chirps_select_visible" on public.chirps for select to anon, authenticated using (public.can_read_chirp_row(chirps));

drop policy if exists "chirps_insert_own" on public.chirps;
create policy "chirps_insert_own" on public.chirps for insert to authenticated with check (auth.uid() = author_id);

drop policy if exists "chirps_update_own" on public.chirps;
create policy "chirps_update_own" on public.chirps for update to authenticated using (auth.uid() = author_id) with check (auth.uid() = author_id);

drop policy if exists "chirps_delete_own" on public.chirps;
create policy "chirps_delete_own" on public.chirps for delete to authenticated using (auth.uid() = author_id);

-- Media

drop policy if exists "chirp_media_select_visible" on public.chirp_media;
create policy "chirp_media_select_visible" on public.chirp_media for select to anon, authenticated using (public.can_read_chirp(chirp_id));

drop policy if exists "chirp_media_insert_own" on public.chirp_media;
create policy "chirp_media_insert_own" on public.chirp_media for insert to authenticated with check (
  auth.uid() = user_id and exists (select 1 from public.chirps c where c.id = chirp_id and c.author_id = auth.uid())
);

drop policy if exists "chirp_media_update_own" on public.chirp_media;
create policy "chirp_media_update_own" on public.chirp_media for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "chirp_media_delete_own" on public.chirp_media;
create policy "chirp_media_delete_own" on public.chirp_media for delete to authenticated using (auth.uid() = user_id);

-- Likes/bookmarks/rechirps

drop policy if exists "likes_select_visible" on public.likes;
create policy "likes_select_visible" on public.likes for select to anon, authenticated using (public.can_read_chirp(chirp_id));

drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own" on public.likes for insert to authenticated with check (auth.uid() = user_id and public.can_read_chirp(chirp_id));

drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own" on public.likes for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "bookmarks_select_own" on public.bookmarks;
create policy "bookmarks_select_own" on public.bookmarks for select to authenticated using (auth.uid() = user_id);

drop policy if exists "bookmarks_insert_own" on public.bookmarks;
create policy "bookmarks_insert_own" on public.bookmarks for insert to authenticated with check (auth.uid() = user_id and public.can_read_chirp(chirp_id));

drop policy if exists "bookmarks_delete_own" on public.bookmarks;
create policy "bookmarks_delete_own" on public.bookmarks for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "rechirps_select_visible" on public.rechirps;
create policy "rechirps_select_visible" on public.rechirps for select to anon, authenticated using (public.can_read_chirp(chirp_id));

drop policy if exists "rechirps_insert_own" on public.rechirps;
create policy "rechirps_insert_own" on public.rechirps for insert to authenticated with check (auth.uid() = user_id and public.can_read_chirp(chirp_id));

drop policy if exists "rechirps_delete_own" on public.rechirps;
create policy "rechirps_delete_own" on public.rechirps for delete to authenticated using (auth.uid() = user_id);

-- Social graph

drop policy if exists "follows_select_public" on public.follows;
create policy "follows_select_public" on public.follows for select to anon, authenticated using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own" on public.follows for insert to authenticated with check (auth.uid() = follower_id and follower_id <> following_id and public.is_blocked(follower_id, following_id) = false);

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own" on public.follows for delete to authenticated using (auth.uid() = follower_id);

drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own" on public.blocks for select to authenticated using (auth.uid() = blocker_id);

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own" on public.blocks for insert to authenticated with check (auth.uid() = blocker_id and blocker_id <> blocked_id);

drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own" on public.blocks for delete to authenticated using (auth.uid() = blocker_id);

drop policy if exists "mutes_select_own" on public.mutes;
create policy "mutes_select_own" on public.mutes for select to authenticated using (auth.uid() = muter_id);

drop policy if exists "mutes_insert_own" on public.mutes;
create policy "mutes_insert_own" on public.mutes for insert to authenticated with check (auth.uid() = muter_id and muter_id <> muted_id);

drop policy if exists "mutes_delete_own" on public.mutes;
create policy "mutes_delete_own" on public.mutes for delete to authenticated using (auth.uid() = muter_id);

-- Notifications

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select to authenticated using (auth.uid() = recipient_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications for update to authenticated using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications for delete to authenticated using (auth.uid() = recipient_id);

-- Security/support

drop policy if exists "security_events_select_own" on public.security_events;
create policy "security_events_select_own" on public.security_events for select to authenticated using (auth.uid() = user_id);

drop policy if exists "security_events_insert_own" on public.security_events;
create policy "security_events_insert_own" on public.security_events for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "support_requests_select_own" on public.support_requests;
create policy "support_requests_select_own" on public.support_requests for select to authenticated using (auth.uid() = user_id);

drop policy if exists "support_requests_insert_own" on public.support_requests;
create policy "support_requests_insert_own" on public.support_requests for insert to authenticated with check (auth.uid() = user_id);

-- =========================================================
-- STORAGE POLICIES
-- Rutas:
-- avatars/{user_id}/avatar.ext
-- banners/{user_id}/banner.ext
-- chirp-media/{user_id}/{chirp_id}/archivo.ext
-- =========================================================

drop policy if exists "storage_public_read_avatars_banners" on storage.objects;
create policy "storage_public_read_avatars_banners" on storage.objects for select to anon, authenticated
using (bucket_id in ('avatars', 'banners'));

drop policy if exists "storage_read_visible_chirp_media" on storage.objects;
create policy "storage_read_visible_chirp_media" on storage.objects for select to anon, authenticated
using (bucket_id = 'chirp-media' and public.can_read_chirp(public.try_uuid((storage.foldername(name))[2])));

drop policy if exists "storage_insert_own_assets" on storage.objects;
create policy "storage_insert_own_assets" on storage.objects for insert to authenticated
with check (
  bucket_id in ('avatars', 'banners', 'chirp-media')
  and auth.uid()::text = (storage.foldername(name))[1]
  and (
    bucket_id in ('avatars','banners')
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
create policy "storage_update_own_assets" on storage.objects for update to authenticated
using (bucket_id in ('avatars', 'banners', 'chirp-media') and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id in ('avatars', 'banners', 'chirp-media') and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "storage_delete_own_assets" on storage.objects;
create policy "storage_delete_own_assets" on storage.objects for delete to authenticated
using (bucket_id in ('avatars', 'banners', 'chirp-media') and auth.uid()::text = (storage.foldername(name))[1]);

-- =========================================================
-- REALTIME OPCIONAL, idempotente
-- =========================================================

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chirps') then
      alter publication supabase_realtime add table public.chirps;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='notifications') then
      alter publication supabase_realtime add table public.notifications;
    end if;
  end if;
end $$;

-- =========================================================
-- IMPORTANTE
-- Las plantillas de email no se configuran por SQL.
-- Pegarlas manualmente en:
-- Authentication > Email Templates.
-- Archivos en /emails del ZIP.
-- =========================================================
