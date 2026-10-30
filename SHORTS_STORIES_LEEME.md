# Chirp Shorts + Stories — integración

## Qué trae

Conserva la estructura original de Chirp 2026 (HTML/CSS/JavaScript, Supabase y rutas Vercel). Se agregaron `shorts.html`, `stories.html`, `assets/css/sh-st.css`, `assets/js/sh-st.js`, iconos originales SVG para ambas secciones y accesos desde la navegación de la aplicación. El inicio muestra Stories y accesos a las nuevas secciones; el perfil incluye atajos.

**Shorts:** publicar videos MP4/WebM de hasta 90 segundos y 100 MB; feed vertical con snap, reproducción automática, pausa, mute, likes, comentarios, seguimiento de usuarios, compartir mediante enlace, visualizaciones únicas y borrado por autor. Los videos se sirven desde un bucket privado por URL firmada. Para archivos mayores de 6 MB se usa `tus-js-client` con reintentos y progreso; la librería se descarga **solamente cuando se sube un video grande**, no al abrir la página.

**Stories:** fotos JPEG/PNG/WebP y videos MP4/WebM de hasta 30 segundos y 50 MB; fila de cuentas con historias, visor de progreso, avance manual y automático, respuestas privadas al autor, estadísticas de vistas y respuestas, borrado propio y vencimiento de 24 horas. El SQL fuerza la duración de la publicación y limita la lectura de Stories vencidas.

## Instalación

1. **Hacé una copia de la base de datos** de Chirp antes de aplicar cambios.
2. Abrí **Supabase > SQL Editor**, pegá todo `sql/chirp_shorts_stories.sql` y ejecutalo **una sola vez**. La migración crea siete tablas nuevas (`sh_videos`, `sh_likes`, `sh_comments`, `sh_views`, `st_stories`, `st_views`, `st_replies`) y dos buckets privados (`chirp-shorts`, `chirp-stories`). Reutiliza `public.profiles` y `public.follows`. Incluye políticas de acceso RLS.
3. En **Supabase > Storage > Settings**, verificá que el límite global de carga admita el máximo que querés permitir (los límites del bucket no pueden superar el global). Si tu plan admite menos, reducí los valores en `sh-st.js` y en los buckets del SQL.
4. Publicá el contenido del proyecto actualizado en tu alojamiento habitual (Vercel u otro servidor que sirva HTML estático); respetá la ruta de inicio `/home.html`.
5. Entrá autenticado a **`/shorts.html`** o **`/stories.html`**, probá primero un archivo pequeño, y verificá en Supabase que se crea la fila y el objeto en el bucket.
6. **IMPORTANTE:** usá el ZIP **PARCHE** y extraelo **sobre el directorio original de Chirp**, SIN borrar ni reemplazar previamente el directorio. Así se conservan `assets/fonts/` y `.git`. El ZIP completo es una copia de archivos de aplicación y no incluye archivos tipográficos. Si lo usás, conservá `assets/fonts/` de tu proyecto original.

## Limpieza de archivos de Stories vencidas (opcional pero aconsejada)

Las Stories dejan de mostrarse tras 24 horas gracias a RLS/consulta. **El archivo físico NO desaparece automáticamente** con la expiración de la fila. Para liberar espacio:

- Se incluye `supabase/functions/st-cleanup/index.ts` para desplegar como Edge Function.
- Configurá un secreto largo y aleatorio en el entorno de la función: `ST_CLEANUP_SECRET`.
- Desplegá la función (p. ej. `supabase functions deploy st-cleanup --no-verify-jwt`, ya que la función exige su propio secreto de cabecera). Si preferís verificar JWT, llamala también con un token autorizado del servidor.
- Programá una llamada **desde un sistema de cron confiable** a `/functions/v1/st-cleanup` con la cabecera privada `x-cron-secret`. No pongas ese secreto en código frontend ni en Git.
- La función elimina primero el objeto de Storage y después la fila de la base de datos, hasta 1000 Stories por ejecución. No se ha ejecutado ni programado automáticamente.

## Consideraciones

- Las URLs firmadas de los videos tienen una vida limitada; se generan al visualizar el contenido.
- Los Short no comprimen/transcodifican por sí solos; usar MP4 H.264/AAC o WebM compatible facilita la reproducción en móviles.
- El código no incluye un algoritmo de recomendaciones, ni moderación automática, ni conversión automática de formatos. El feed de Shorts es por fecha descendente.
- El SQL fue preparado para la estructura observada del ZIP, no se ejecutó en tu Supabase real: probá las políticas con dos usuarios antes de pasar a producción.
- Si el reproductor de video requiere alta escala, conviene añadir un transcoder/CDN de streaming con calidades adaptables; aquí se utilizan los archivos de Supabase Storage.
- El CSS fuerza exclusivamente `Chirp Sans` en todos los elementos, sin fallbacks (`* { font-family: "Chirp Sans" !important; }`). El directorio `assets/fonts` debe permanecer intacto desde el proyecto original.
- Las rutas existentes no se borraron. El directorio `.git` se omite deliberadamente del entregable para evitar redistribuir historial interno y referencias remotas; el código fuente de la web sí se incluye.

## Corrección de tiempos de carga (octubre 2026)

- Se eliminó la carga de `tus-js-client` en el arranque de Home, Shorts y Stories; ahora se obtiene a demanda al subir archivos de más de 6 MB.
- Las Stories de Home se consultan en segundo plano cuando el navegador queda libre, con un máximo de 48 registros recientes.
- Trending y contadores de DMs ya no bloquean la visualización del timeline.
- Se eliminó la importación CSS externa de Gilroy (no se usa en la UI de Chirp); se mantiene exclusivamente Chirp Sans, definido por las fuentes locales del proyecto original.
- Ninguno de estos cambios reemplaza medir el tiempo de respuesta de tu servidor/Supabase real. Si persiste una carga de minutos, revisá Network en DevTools para identificar las solicitudes lentas.
