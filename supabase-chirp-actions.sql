-- Chirp · Editar, borrar y compartir publicaciones
-- Ejecutar completo en Supabase SQL Editor.
-- Agrega soporte para edición, borrado lógico y embeds públicos de Chirps públicos.

create extension if not exists pgcrypto;

alter table public.chirps
  add column if not exists updated_at timestamptz,
  add column if not exists deleted_at timestamptz;

update public.chirps
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.chirps
  alter column updated_at set default now(),
  alter column updated_at set not null;

create index if not exists chirps_author_deleted_created_idx
  on public.chirps(author_id, deleted_at, created_at desc);

create or replace function public.touch_chirp_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_chirps_touch_updated_at on public.chirps;
create trigger trg_chirps_touch_updated_at
before update on public.chirps
for each row execute function public.touch_chirp_updated_at();

alter table public.chirps enable row level security;

drop policy if exists "chirps_update_own" on public.chirps;
create policy "chirps_update_own"
on public.chirps
for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

drop policy if exists "chirps_delete_own" on public.chirps;
create policy "chirps_delete_own"
on public.chirps
for delete
to authenticated
using (author_id = auth.uid());

-- Para que los iframes /embed.html?chirp=ID puedan mostrar Chirps públicos sin login.
drop policy if exists "chirps_select_public_visible" on public.chirps;
create policy "chirps_select_public_visible"
on public.chirps
for select
to anon, authenticated
using (
  deleted_at is null
  and coalesce(visibility, 'public') = 'public'
);

-- El embed necesita leer el perfil público del autor.
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
on public.profiles
for select
to anon, authenticated
using (true);

-- El embed necesita leer filas de multimedia asociadas a Chirps públicos.
alter table public.chirp_media enable row level security;

drop policy if exists "chirp_media_select_public_chirps" on public.chirp_media;
create policy "chirp_media_select_public_chirps"
on public.chirp_media
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.chirps c
    where c.id = chirp_media.chirp_id
      and c.deleted_at is null
      and coalesce(c.visibility, 'public') = 'public'
  )
);

-- Si el bucket chirp-media es privado, esta policy permite firmar/leer objetos
-- que pertenecen a Chirps públicos insertables.
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute $policy$
      drop policy if exists "chirp_media_storage_select_public_chirps" on storage.objects
    $policy$;

    execute $policy$
      create policy "chirp_media_storage_select_public_chirps"
      on storage.objects
      for select
      to anon, authenticated
      using (
        bucket_id = 'chirp-media'
        and exists (
          select 1
          from public.chirp_media cm
          join public.chirps c on c.id = cm.chirp_id
          where cm.storage_bucket = storage.objects.bucket_id
            and cm.storage_path = storage.objects.name
            and c.deleted_at is null
            and coalesce(c.visibility, 'public') = 'public'
        )
      )
    $policy$;
  end if;
end $$;

grant select, update, delete on public.chirps to authenticated;
grant select on public.chirps to anon;
grant select on public.profiles to anon, authenticated;
grant select on public.chirp_media to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.chirps;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
