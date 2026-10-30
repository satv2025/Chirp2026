# Chirp 2026 · Shorts como Chirps + Stories por DM

## Instalar

1. Sobre tu proyecto Chirp actual, extraé el **parche** sin borrar tus carpetas ni `assets/fonts`.
2. Ejecutá en Supabase SQL Editor **`sql/chirp_SH_ST_DM_DISLIKES_CHIRPS.sql`**, una sola vez (admite repetición).
3. Si ya publicaste Shorts antes de esta actualización y querés que también aparezcan como Chirps en el timeline y perfiles, ejecutá **`sql/chirp_SH_BACKFILL_ANTIGUOS_OPCIONAL.sql`**. Es opcional e idempotente.
4. Publicá el sitio. No vuelvas a ejecutar los SQL iniciales si ya tenés Shorts y Stories funcionando.

## Comportamiento

- **Story:** respuesta de texto -> fila en `direct_messages` para el autor de la Story, con `story_id`. El chat muestra un enlace a la Story mientras siga disponible. La Story sigue expirando a las 24 horas.
- **Short nuevo:** se sube una sola copia a `chirp-shorts`, se genera un `chirps` público con su fila `chirp_media`, y se crea `sh_videos` vinculado mediante `chirp_id`.
- **Likes y comentarios de Shorts nuevos:** se guardan en `likes` y `chirp_replies` del Chirp asociado. Por eso coinciden entre el timeline, el perfil y el feed de Shorts.
- **Dislikes:** `sh_dislikes` tiene su propio contador y RLS. El SQL incluye disparadores para impedir tener simultáneamente like y dislike sobre el mismo Short.
- **Shorts anteriores:** conservan sus tablas `sh_likes` y `sh_comments` si no ejecutás el backfill. Si lo ejecutás, también se trasladan sus interacciones al Chirp asociado.
- **Duraciones y cámara:** se conservan los 180 s, la selección de orientación 9:16/16:9 y la grabación con cámara.
- **Stories en Home:** continúan mostrándose solamente de perfiles seguidos, además de las propias.

## Importante

- No hay una migración retroactiva automática de `st_replies` a DMs: las respuestas antiguas siguen visibles en el panel histórico de su Story mientras esta exista. **Las respuestas nuevas llegan a DMs**.
- El ZIP **no contiene archivos binarios de fuentes**. Debés conservar `assets/fonts` de la versión original.
- Requiere Supabase real para validar permisos RLS, grabación, uploads y envío de mensajes; las pruebas estáticas y locales no sustituyen ese ensayo en producción.
