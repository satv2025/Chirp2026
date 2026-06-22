-- Chirp · Respuestas dentro del Chirp
-- Ejecutar completo en Supabase SQL Editor.

create extension if not exists pgcrypto;

alter table public.chirps
  add column if not exists replies_count integer not null default 0;

create table if not exists public.chirp_replies (
  id uuid primary key default gen_random_uuid(),
  chirp_id uuid not null references public.chirps(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chirp_replies_content_not_blank check (char_length(btrim(content)) > 0),
  constraint chirp_replies_content_len check (char_length(content) <= 280)
);

create index if not exists chirp_replies_chirp_id_created_at_idx
  on public.chirp_replies(chirp_id, created_at);

create index if not exists chirp_replies_author_id_created_at_idx
  on public.chirp_replies(author_id, created_at desc);

alter table public.chirp_replies enable row level security;

drop policy if exists "chirp_replies_select_visible" on public.chirp_replies;
create policy "chirp_replies_select_visible"
on public.chirp_replies
for select
to authenticated
using (
  deleted_at is null
  and exists (
    select 1
    from public.chirps c
    where c.id = chirp_replies.chirp_id
      and c.deleted_at is null
  )
);

drop policy if exists "chirp_replies_insert_own" on public.chirp_replies;
create policy "chirp_replies_insert_own"
on public.chirp_replies
for insert
to authenticated
with check (
  author_id = auth.uid()
  and deleted_at is null
  and exists (
    select 1
    from public.chirps c
    where c.id = chirp_replies.chirp_id
      and c.deleted_at is null
  )
);

drop policy if exists "chirp_replies_update_own" on public.chirp_replies;
create policy "chirp_replies_update_own"
on public.chirp_replies
for update
to authenticated
using (author_id = auth.uid())
with check (author_id = auth.uid());

drop policy if exists "chirp_replies_delete_own" on public.chirp_replies;
create policy "chirp_replies_delete_own"
on public.chirp_replies
for delete
to authenticated
using (author_id = auth.uid());

create or replace function public.touch_chirp_reply_updated_at()
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

drop trigger if exists trg_chirp_replies_touch_updated_at on public.chirp_replies;
create trigger trg_chirp_replies_touch_updated_at
before update on public.chirp_replies
for each row execute function public.touch_chirp_reply_updated_at();

create or replace function public.refresh_chirp_replies_count(target_chirp_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.chirps c
  set replies_count = (
    select count(*)::integer
    from public.chirp_replies r
    where r.chirp_id = target_chirp_id
      and r.deleted_at is null
  )
  where c.id = target_chirp_id;
$$;

create or replace function public.chirp_replies_after_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.chirp_id, old.chirp_id);
  perform public.refresh_chirp_replies_count(target_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_chirp_replies_after_insert on public.chirp_replies;
create trigger trg_chirp_replies_after_insert
after insert on public.chirp_replies
for each row execute function public.chirp_replies_after_change();

drop trigger if exists trg_chirp_replies_after_update on public.chirp_replies;
create trigger trg_chirp_replies_after_update
after update on public.chirp_replies
for each row execute function public.chirp_replies_after_change();

drop trigger if exists trg_chirp_replies_after_delete on public.chirp_replies;
create trigger trg_chirp_replies_after_delete
after delete on public.chirp_replies
for each row execute function public.chirp_replies_after_change();

create or replace function public.notify_chirp_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient uuid;
begin
  select c.author_id
  into recipient
  from public.chirps c
  where c.id = new.chirp_id;

  if recipient is not null and recipient <> new.author_id and to_regclass('public.notifications') is not null then
    execute
      'insert into public.notifications (recipient_id, actor_id, type, chirp_id)
       values ($1, $2, $3, $4)'
    using recipient, new.author_id, 'reply', new.chirp_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_chirp_replies_notify on public.chirp_replies;
create trigger trg_chirp_replies_notify
after insert on public.chirp_replies
for each row execute function public.notify_chirp_reply();

-- Recalcular contadores existentes por si ya había respuestas.
update public.chirps c
set replies_count = coalesce(x.qty, 0)
from (
  select chirp_id, count(*)::integer as qty
  from public.chirp_replies
  where deleted_at is null
  group by chirp_id
) x
where c.id = x.chirp_id;

-- Activar realtime para respuestas.
do $$
begin
  alter publication supabase_realtime add table public.chirp_replies;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

grant select, insert, update, delete on public.chirp_replies to authenticated;
