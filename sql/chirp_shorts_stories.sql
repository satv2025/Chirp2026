-- Chirp 2026 | Shorts (SH) y Stories (ST)
-- Ejecutar en Supabase > SQL Editor, como propietario del proyecto.
-- Reutiliza public.profiles(id) y public.follows ya existentes.
-- No modifica ni borra tablas preexistentes.

create extension if not exists pgcrypto;

create table if not exists public.sh_videos (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  caption text not null default '' check (char_length(caption) <= 500),
  media_path text not null unique,
  duration_seconds numeric(7,2) not null check (duration_seconds > 0 and duration_seconds <= 90),
  created_at timestamptz not null default now(),
  constraint sh_video_path check (media_path ~ ('^' || author_id::text || '/[a-f0-9-]{36}\.(mp4|webm)$'))
);

create table if not exists public.sh_likes (
  video_id uuid not null references public.sh_videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table if not exists public.sh_comments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.sh_videos(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.sh_views (
  video_id uuid not null references public.sh_videos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (video_id, user_id)
);

create table if not exists public.st_stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  media_path text not null unique,
  media_kind text not null check (media_kind in ('image', 'video')),
  caption text not null default '' check (char_length(caption) <= 250),
  duration_seconds numeric(6,2) not null default 5 check (duration_seconds between 1 and 30),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  constraint st_media_path check (media_path ~ ('^' || author_id::text || '/[a-f0-9-]{36}\.(jpg|jpeg|png|webp|mp4|webm)$'))
);

create table if not exists public.st_views (
  story_id uuid not null references public.st_stories(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create table if not exists public.st_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.st_stories(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 250),
  created_at timestamptz not null default now()
);

create index if not exists sh_videos_recent on public.sh_videos(created_at desc);
create index if not exists sh_videos_author on public.sh_videos(author_id, created_at desc);
create index if not exists sh_comments_video_recent on public.sh_comments(video_id, created_at desc);
create index if not exists st_stories_active on public.st_stories(expires_at, created_at desc);
create index if not exists st_stories_author on public.st_stories(author_id, created_at desc);
create index if not exists st_replies_story on public.st_replies(story_id, created_at desc);

-- El servidor fuerza la expiración; un cliente no puede prolongar una Story.
create or replace function public.st_fix_lifetime()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.expires_at := new.created_at + interval '24 hours';
  else
    new.created_at := old.created_at;
    new.expires_at := old.expires_at;
  end if;
  return new;
end;
$$;
drop trigger if exists st_enforce_lifetime on public.st_stories;
create trigger st_enforce_lifetime before insert or update on public.st_stories
for each row execute function public.st_fix_lifetime();

alter table public.sh_videos enable row level security;
alter table public.sh_likes enable row level security;
alter table public.sh_comments enable row level security;
alter table public.sh_views enable row level security;
alter table public.st_stories enable row level security;
alter table public.st_views enable row level security;
alter table public.st_replies enable row level security;

-- Videos públicos para usuarios autenticados; publicaciones y borrados por dueño.
drop policy if exists sh_videos_read on public.sh_videos;
create policy sh_videos_read on public.sh_videos for select to authenticated using (true);
drop policy if exists sh_videos_insert on public.sh_videos;
create policy sh_videos_insert on public.sh_videos for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists sh_videos_delete on public.sh_videos;
create policy sh_videos_delete on public.sh_videos for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists sh_likes_read on public.sh_likes;
create policy sh_likes_read on public.sh_likes for select to authenticated using (true);
drop policy if exists sh_likes_add on public.sh_likes;
create policy sh_likes_add on public.sh_likes for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists sh_likes_remove on public.sh_likes;
create policy sh_likes_remove on public.sh_likes for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists sh_comments_read on public.sh_comments;
create policy sh_comments_read on public.sh_comments for select to authenticated using (true);
drop policy if exists sh_comments_add on public.sh_comments;
create policy sh_comments_add on public.sh_comments for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists sh_comments_remove on public.sh_comments;
create policy sh_comments_remove on public.sh_comments for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists sh_views_read on public.sh_views;
create policy sh_views_read on public.sh_views for select to authenticated using (true);
drop policy if exists sh_views_add on public.sh_views;
create policy sh_views_add on public.sh_views for insert to authenticated with check (user_id = (select auth.uid()));

-- Stories solo mientras estén vigentes; el dueño puede borrar.
drop policy if exists st_stories_read on public.st_stories;
create policy st_stories_read on public.st_stories for select to authenticated using (expires_at > now());
drop policy if exists st_stories_insert on public.st_stories;
create policy st_stories_insert on public.st_stories for insert to authenticated with check (author_id = (select auth.uid()));
drop policy if exists st_stories_delete on public.st_stories;
create policy st_stories_delete on public.st_stories for delete to authenticated using (author_id = (select auth.uid()));

drop policy if exists st_views_read on public.st_views;
create policy st_views_read on public.st_views for select to authenticated using (
  viewer_id = (select auth.uid()) or exists (
    select 1 from public.st_stories s where s.id = story_id and s.author_id = (select auth.uid())
  )
);
drop policy if exists st_views_add on public.st_views;
create policy st_views_add on public.st_views for insert to authenticated with check (
  viewer_id = (select auth.uid()) and exists (
    select 1 from public.st_stories s where s.id = story_id and s.expires_at > now()
  )
);

drop policy if exists st_replies_read on public.st_replies;
create policy st_replies_read on public.st_replies for select to authenticated using (
  author_id = (select auth.uid()) or exists (
    select 1 from public.st_stories s where s.id = story_id and s.author_id = (select auth.uid())
  )
);
drop policy if exists st_replies_add on public.st_replies;
create policy st_replies_add on public.st_replies for insert to authenticated with check (
  author_id = (select auth.uid()) and exists (
    select 1 from public.st_stories s where s.id = story_id and s.expires_at > now()
  )
);

-- Buckets PRIVADOS, con URLs firmadas de corta duración desde el cliente.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chirp-shorts', 'chirp-shorts', false, 104857600, array['video/mp4','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chirp-stories', 'chirp-stories', false, 52428800, array['image/jpeg','image/png','image/webp','video/mp4','video/webm'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- La primera carpeta del archivo DEBE ser el UID autenticado.
drop policy if exists chirp_shst_objects_read on storage.objects;
create policy chirp_shst_objects_read on storage.objects for select to authenticated using (
  bucket_id in ('chirp-shorts','chirp-stories')
);
drop policy if exists chirp_shst_objects_insert on storage.objects;
create policy chirp_shst_objects_insert on storage.objects for insert to authenticated with check (
  bucket_id in ('chirp-shorts','chirp-stories')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
drop policy if exists chirp_shst_objects_delete on storage.objects;
create policy chirp_shst_objects_delete on storage.objects for delete to authenticated using (
  bucket_id in ('chirp-shorts','chirp-stories')
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Necesario si tu proyecto ha revocado permisos por defecto.
grant select, insert, delete on public.sh_videos, public.sh_likes, public.sh_comments, public.sh_views,
  public.st_stories, public.st_views, public.st_replies to authenticated;

-- Para eliminar archivos de Stories vencidas, programar una limpieza periódica
-- usando una Edge Function con service_role (NO exponer esa clave en el navegador).
-- Sin limpieza automática, las Stories desaparecen del feed tras 24h,
-- pero sus archivos seguirán ocupando espacio en el bucket privado.
