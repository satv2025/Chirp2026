// Limpieza opcional de archivos de Stories vencidas.
// Implementar como Supabase Edge Function y programar una llamada autenticada
// desde el cron de preferencia. Nunca exponer el service_role al navegador.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request: Request) => {
  const secret = Deno.env.get('ST_CLEANUP_SECRET');
  if (!secret || request.headers.get('x-cron-secret') !== secret) {
    return new Response('Unauthorized', { status: 401 });
  }
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return new Response('Missing server configuration', { status: 500 });
  const sb = createClient(url, key, { auth: { persistSession: false } });
  let deleted = 0;
  let errors = 0;
  for (let page = 0; page < 10; page++) {
    const { data, error } = await sb.from('st_stories')
      .select('id,media_path').lte('expires_at', new Date().toISOString())
      .order('expires_at').limit(100);
    if (error) return Response.json({ deleted, error: error.message }, { status: 500 });
    if (!data?.length) break;
    const { error: removeError } = await sb.storage.from('chirp-stories').remove(data.map(s => s.media_path));
    if (removeError) { errors++; console.error(removeError); break; }
    const ids = data.map(s => s.id);
    const { error: dbError } = await sb.from('st_stories').delete().in('id', ids);
    if (dbError) { errors++; console.error(dbError); break; }
    deleted += ids.length;
    if (data.length < 100) break;
  }
  return Response.json({ deleted, errors });
});
