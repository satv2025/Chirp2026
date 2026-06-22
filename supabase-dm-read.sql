-- Chirp · Mensajes leídos / badges de DM
-- Ejecutar completo en Supabase SQL Editor para que los badges de mensajes sin leer
-- se sincronicen entre dispositivos.

alter table public.direct_messages
  add column if not exists read_at timestamptz;

create index if not exists direct_messages_receiver_sender_read_at_idx
  on public.direct_messages(receiver_id, sender_id, read_at);

create or replace function public.mark_dm_thread_read(peer uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.direct_messages
  set read_at = coalesce(read_at, now())
  where receiver_id = auth.uid()
    and sender_id = peer
    and read_at is null;
$$;

grant execute on function public.mark_dm_thread_read(uuid) to authenticated;
