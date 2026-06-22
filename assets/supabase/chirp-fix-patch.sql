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


-- =========================================================
-- CHIRP - HASHTAG/MENTION SYNC RPC
-- Permite que el frontend fuerce la sincronización de hashtags
-- después de crear un Chirp, además del trigger existente.
-- =========================================================

create or replace function public.sync_chirp_entities_for(chirp_id_to_sync uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  chirp_record public.chirps;
  username_text text;
  tag_text text;
  found_hashtag_id uuid;
  tag_count int := 0;
  mention_count int := 0;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select *
  into chirp_record
  from public.chirps
  where id = chirp_id_to_sync;

  if chirp_record.id is null then
    raise exception 'chirp_not_found';
  end if;

  if chirp_record.author_id <> auth.uid() then
    raise exception 'not_chirp_author';
  end if;

  delete from public.mentions
  where chirp_id = chirp_record.id;

  delete from public.chirp_hashtags
  where chirp_id = chirp_record.id;

  if chirp_record.deleted_at is not null or chirp_record.content is null then
    return jsonb_build_object('hashtags', 0, 'mentions', 0);
  end if;

  for username_text in
    select distinct lower(t.match_result[2])
    from regexp_matches(
      chirp_record.content,
      '(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{3,30})',
      'g'
    ) as t(match_result)
  loop
    insert into public.mentions (
      chirp_id,
      mentioned_user_id
    )
    select
      chirp_record.id,
      p.id
    from public.profiles p
    where lower(p.username::text) = username_text
    on conflict do nothing;

    mention_count := mention_count + 1;
  end loop;

  for tag_text in
    select distinct lower(t.match_result[2])
    from regexp_matches(
      chirp_record.content,
      '(^|[^a-zA-Z0-9_])#([a-zA-Z0-9_]{1,50})',
      'g'
    ) as t(match_result)
  loop
    insert into public.hashtags (tag)
    values (tag_text)
    on conflict (tag) do nothing;

    select id
    into found_hashtag_id
    from public.hashtags
    where tag = tag_text;

    insert into public.chirp_hashtags (
      chirp_id,
      hashtag_id
    )
    values (
      chirp_record.id,
      found_hashtag_id
    )
    on conflict do nothing;

    tag_count := tag_count + 1;
  end loop;

  return jsonb_build_object('hashtags', tag_count, 'mentions', mention_count);
end;
$$;

grant execute on function public.sync_chirp_entities_for(uuid) to authenticated;


-- =========================================================
-- CHIRP - TOP HASHTAGS RPC
-- Devuelve hashtags reales, ordenados por cantidad de usuarios
-- distintos que los usaron y cantidad de Chirps.
-- =========================================================

create or replace function public.get_top_hashtags(limit_count int default 6)
returns table (
  tag text,
  chirps_count int,
  users_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    h.tag::text as tag,
    count(distinct ch.chirp_id)::int as chirps_count,
    count(distinct c.author_id)::int as users_count
  from public.hashtags h
  join public.chirp_hashtags ch
    on ch.hashtag_id = h.id
  join public.chirps c
    on c.id = ch.chirp_id
  where c.deleted_at is null
  group by h.id, h.tag
  having count(distinct ch.chirp_id) > 0
  order by
    count(distinct c.author_id) desc,
    count(distinct ch.chirp_id) desc,
    lower(h.tag::text) asc
  limit greatest(1, least(coalesce(limit_count, 6), 24));
$$;

grant execute on function public.get_top_hashtags(int) to anon, authenticated;


-- =========================================================
-- CHIRP - DIRECT MESSAGES
-- Chat privado simple entre usuarios.
-- =========================================================

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) <= 2000),
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.direct_messages enable row level security;

create index if not exists direct_messages_sender_idx on public.direct_messages(sender_id, created_at desc);
create index if not exists direct_messages_receiver_idx on public.direct_messages(receiver_id, created_at desc);

drop policy if exists "dm_select_participants" on public.direct_messages;
create policy "dm_select_participants"
on public.direct_messages
for select
to authenticated
using (
  auth.uid() = sender_id
  or auth.uid() = receiver_id
);

drop policy if exists "dm_insert_sender" on public.direct_messages;
create policy "dm_insert_sender"
on public.direct_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and sender_id <> receiver_id
  and not exists (
    select 1
    from public.blocks b
    where
      (b.blocker_id = receiver_id and b.blocked_id = sender_id)
      or
      (b.blocker_id = sender_id and b.blocked_id = receiver_id)
  )
);

drop policy if exists "dm_update_receiver_read" on public.direct_messages;
create policy "dm_update_receiver_read"
on public.direct_messages
for update
to authenticated
using (auth.uid() = receiver_id)
with check (auth.uid() = receiver_id);

create or replace function public.get_dm_threads()
returns table (
  peer_id uuid,
  peer_username text,
  peer_display_name text,
  peer_avatar_url text,
  last_message text,
  last_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with my_messages as (
    select
      case
        when sender_id = auth.uid() then receiver_id
        else sender_id
      end as peer_id,
      body,
      created_at,
      row_number() over (
        partition by case when sender_id = auth.uid() then receiver_id else sender_id end
        order by created_at desc
      ) as rn
    from public.direct_messages
    where sender_id = auth.uid() or receiver_id = auth.uid()
  )
  select
    p.id as peer_id,
    p.username::text as peer_username,
    p.display_name::text as peer_display_name,
    p.avatar_url::text as peer_avatar_url,
    m.body as last_message,
    m.created_at as last_at
  from my_messages m
  join public.profiles p on p.id = m.peer_id
  where m.rn = 1
  order by m.created_at desc
  limit 50;
$$;

grant execute on function public.get_dm_threads() to authenticated;


-- =========================================================
-- CHIRP - PUBLIC PROFILE COUNTS
-- Recalcula contadores de seguidores/seguidos para perfil público.
-- =========================================================

create or replace function public.refresh_profile_follow_counts(profile_id_to_refresh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles p
  set
    followers_count = (
      select count(*)::int
      from public.follows f
      where f.following_id = profile_id_to_refresh
    ),
    following_count = (
      select count(*)::int
      from public.follows f
      where f.follower_id = profile_id_to_refresh
    )
  where p.id = profile_id_to_refresh;
end;
$$;

grant execute on function public.refresh_profile_follow_counts(uuid) to authenticated;

create or replace function public.refresh_follow_counts_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_profile_follow_counts(new.follower_id);
    perform public.refresh_profile_follow_counts(new.following_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.refresh_profile_follow_counts(old.follower_id);
    perform public.refresh_profile_follow_counts(old.following_id);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists refresh_follow_counts_after_insert on public.follows;
create trigger refresh_follow_counts_after_insert
after insert on public.follows
for each row
execute function public.refresh_follow_counts_after_change();

drop trigger if exists refresh_follow_counts_after_delete on public.follows;
create trigger refresh_follow_counts_after_delete
after delete on public.follows
for each row
execute function public.refresh_follow_counts_after_change();

-- Backfill general
update public.profiles p
set
  followers_count = (
    select count(*)::int
    from public.follows f
    where f.following_id = p.id
  ),
  following_count = (
    select count(*)::int
    from public.follows f
    where f.follower_id = p.id
  );


-- =========================================================
-- CHIRP - REALTIME COUNTS PATCH
-- Hace que likes, bookmarks, rechirps, follows, DM, etc.
-- disparen eventos de Supabase Realtime y mantiene contadores.
-- =========================================================

-- 1) Contadores de Chirps
create or replace function public.refresh_chirp_social_counts(chirp_id_to_refresh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if chirp_id_to_refresh is null then
    return;
  end if;

  update public.chirps c
  set
    likes_count = (
      select count(*)::int
      from public.likes l
      where l.chirp_id = chirp_id_to_refresh
    ),
    bookmarks_count = (
      select count(*)::int
      from public.bookmarks b
      where b.chirp_id = chirp_id_to_refresh
    ),
    rechirps_count = (
      select count(*)::int
      from public.rechirps r
      where r.chirp_id = chirp_id_to_refresh
    )
  where c.id = chirp_id_to_refresh;
end;
$$;

grant execute on function public.refresh_chirp_social_counts(uuid) to authenticated;

create or replace function public.refresh_chirp_social_counts_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_chirp_id uuid;
begin
  if tg_op = 'INSERT' then
    target_chirp_id := new.chirp_id;
  else
    target_chirp_id := old.chirp_id;
  end if;

  perform public.refresh_chirp_social_counts(target_chirp_id);

  if tg_op = 'INSERT' then
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists refresh_likes_count_after_insert on public.likes;
create trigger refresh_likes_count_after_insert
after insert on public.likes
for each row
execute function public.refresh_chirp_social_counts_after_change();

drop trigger if exists refresh_likes_count_after_delete on public.likes;
create trigger refresh_likes_count_after_delete
after delete on public.likes
for each row
execute function public.refresh_chirp_social_counts_after_change();

drop trigger if exists refresh_bookmarks_count_after_insert on public.bookmarks;
create trigger refresh_bookmarks_count_after_insert
after insert on public.bookmarks
for each row
execute function public.refresh_chirp_social_counts_after_change();

drop trigger if exists refresh_bookmarks_count_after_delete on public.bookmarks;
create trigger refresh_bookmarks_count_after_delete
after delete on public.bookmarks
for each row
execute function public.refresh_chirp_social_counts_after_change();

drop trigger if exists refresh_rechirps_count_after_insert on public.rechirps;
create trigger refresh_rechirps_count_after_insert
after insert on public.rechirps
for each row
execute function public.refresh_chirp_social_counts_after_change();

drop trigger if exists refresh_rechirps_count_after_delete on public.rechirps;
create trigger refresh_rechirps_count_after_delete
after delete on public.rechirps
for each row
execute function public.refresh_chirp_social_counts_after_change();


-- 2) Contadores de seguidores / seguidos
create or replace function public.refresh_profile_follow_counts(profile_id_to_refresh uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if profile_id_to_refresh is null then
    return;
  end if;

  update public.profiles p
  set
    followers_count = (
      select count(*)::int
      from public.follows f
      where f.following_id = profile_id_to_refresh
    ),
    following_count = (
      select count(*)::int
      from public.follows f
      where f.follower_id = profile_id_to_refresh
    )
  where p.id = profile_id_to_refresh;
end;
$$;

grant execute on function public.refresh_profile_follow_counts(uuid) to authenticated;

create or replace function public.refresh_follow_counts_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.refresh_profile_follow_counts(new.follower_id);
    perform public.refresh_profile_follow_counts(new.following_id);
    return new;
  end if;

  if tg_op = 'DELETE' then
    perform public.refresh_profile_follow_counts(old.follower_id);
    perform public.refresh_profile_follow_counts(old.following_id);
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists refresh_follow_counts_after_insert on public.follows;
create trigger refresh_follow_counts_after_insert
after insert on public.follows
for each row
execute function public.refresh_follow_counts_after_change();

drop trigger if exists refresh_follow_counts_after_delete on public.follows;
create trigger refresh_follow_counts_after_delete
after delete on public.follows
for each row
execute function public.refresh_follow_counts_after_change();


-- 3) Backfill de contadores existentes
update public.chirps c
set
  likes_count = (
    select count(*)::int from public.likes l where l.chirp_id = c.id
  ),
  bookmarks_count = (
    select count(*)::int from public.bookmarks b where b.chirp_id = c.id
  ),
  rechirps_count = (
    select count(*)::int from public.rechirps r where r.chirp_id = c.id
  );

update public.profiles p
set
  followers_count = (
    select count(*)::int from public.follows f where f.following_id = p.id
  ),
  following_count = (
    select count(*)::int from public.follows f where f.follower_id = p.id
  );


-- 4) Habilitar tablas para Supabase Realtime
-- Evita error si ya estaban agregadas.
do $$
declare
  target_table text;
  tables_to_add text[] := array[
    'profiles',
    'chirps',
    'chirp_media',
    'likes',
    'bookmarks',
    'rechirps',
    'follows',
    'blocks',
    'hashtags',
    'chirp_hashtags',
    'direct_messages',
    'notifications'
  ];
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    foreach target_table in array tables_to_add loop
      if exists (
        select 1
        from information_schema.tables
        where table_schema = 'public'
          and table_name = target_table
      ) and not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = target_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', target_table);
      end if;
    end loop;
  end if;
end;
$$;

-- 5) Para eventos UPDATE/DELETE más completos en Realtime
alter table if exists public.profiles replica identity full;
alter table if exists public.chirps replica identity full;
alter table if exists public.likes replica identity full;
alter table if exists public.bookmarks replica identity full;
alter table if exists public.rechirps replica identity full;
alter table if exists public.follows replica identity full;
alter table if exists public.blocks replica identity full;
alter table if exists public.direct_messages replica identity full;
alter table if exists public.notifications replica identity full;


-- =========================================================
-- CHIRP - PERSISTENT VOTE STATE PATCH
-- Asegura que likes, guardados y rechirps persistan por usuario
-- y no se dupliquen.
-- =========================================================

-- Si tu esquema ya tiene primary keys compuestas, estos índices no rompen nada.
create unique index if not exists likes_user_chirp_unique
on public.likes(user_id, chirp_id);

create unique index if not exists bookmarks_user_chirp_unique
on public.bookmarks(user_id, chirp_id);

create unique index if not exists rechirps_user_chirp_unique
on public.rechirps(user_id, chirp_id);

-- Permisos para que el frontend pueda leer el estado propio y marcar botones al recargar.
grant select, insert, delete on public.likes to authenticated;
grant select, insert, delete on public.bookmarks to authenticated;
grant select, insert, delete on public.rechirps to authenticated;

-- RLS robusto: cada usuario ve/modifica sus propias acciones.
alter table public.likes enable row level security;
alter table public.bookmarks enable row level security;
alter table public.rechirps enable row level security;

drop policy if exists "likes_select_own" on public.likes;
create policy "likes_select_own"
on public.likes
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own"
on public.likes
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own"
on public.likes
for delete
to authenticated
using (auth.uid() = user_id);


drop policy if exists "bookmarks_select_own" on public.bookmarks;
create policy "bookmarks_select_own"
on public.bookmarks
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "bookmarks_insert_own" on public.bookmarks;
create policy "bookmarks_insert_own"
on public.bookmarks
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "bookmarks_delete_own" on public.bookmarks;
create policy "bookmarks_delete_own"
on public.bookmarks
for delete
to authenticated
using (auth.uid() = user_id);


drop policy if exists "rechirps_select_own" on public.rechirps;
create policy "rechirps_select_own"
on public.rechirps
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "rechirps_insert_own" on public.rechirps;
create policy "rechirps_insert_own"
on public.rechirps
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "rechirps_delete_own" on public.rechirps;
create policy "rechirps_delete_own"
on public.rechirps
for delete
to authenticated
using (auth.uid() = user_id);
