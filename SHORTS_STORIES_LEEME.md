# Chirp Shorts + Stories — integración

## Qué trae

Conserva la estructura original de Chirp 2026 (HTML/CSS/JavaScript, Supabase y rutas Vercel). Se agregaron `shorts.html`, `stories.html`, `assets/css/sh-st.css`, `assets/js/sh-st.js`, iconos originales SVG para ambas secciones y accesos desde la navegación de la aplicación. El inicio muestra Stories y accesos a las nuevas secciones; el perfil incluye atajos.

**Shorts:** publicar videos MP4/WebM de hasta 3 minutos y 100 MB; feed vertical con snap, reproducción automática, pausa, mute, likes, comentarios, seguimiento de usuarios, compartir mediante enlace, visualizaciones únicas y borrado por autor. Los videos se sirven desde un bucket privado por URL firmada. Para archivos mayores de 6 MB se usa `tus-js-client` con reintentos y progreso; la librería se descarga **solamente cuando se sube un video grande**, no al abrir la página.

**Stories:** fotos JPEG/PNG/WebP y videos MP4/WebM de hasta 3 minutos y 50 MB; fila de cuentas con historias, visor de progreso, avance manual y automático, respuestas privadas al autor, estadísticas de vistas y respuestas, borrado propio y vencimiento de 24 horas. El SQL fuerza la duración de la publicación y limita la lectura de Stories vencidas.

## Cámara integrada (Shorts y Stories)

- **Shorts:** botón **Usar cámara**, vista previa en vivo, permisos de cámara/micrófono, cambiar cámara frontal/posterior, elegir entre varias cámaras del equipo, silenciar micrófono antes de grabar, grabar y detener; tope automático de 3 minutos, previsualizar y publicar o repetir.
- **Stories:** los mismos controles, con pestañas **Foto** y **Video**; fotos capturadas en formato vertical JPG (recorte central, sin estirar) y grabación de videos de hasta 3 minutos.
- Sigue existiendo **Subir archivo** en ambos módulos. La cámara **no se inicia** hasta que el usuario toca el botón. Al cerrar el editor o terminar de grabar se liberan los dispositivos.
- Permisos de cámara y micrófono: requieren **HTTPS** o `localhost` y la autorización del usuario. Si no hay micrófono, se intenta abrir solo la cámara. El navegador elige el formato compatible entre MP4 y WebM mediante `MediaRecorder.isTypeSupported`. Según el equipo, dispositivo y navegador, puede variar la reproducción del archivo generado.
- No hacen falta nuevas tablas SQL: los archivos grabados se publican con las mismas tablas y buckets ya creados para SH y ST. El navegador graba localmente; solo se sube el resultado cuando tocás **Publicar**.
- Los límites del hosting/Supabase Storage siguen aplicando. Esta función no incorpora filtros, edición avanzada de clips ni transcodificación.

## Instalación

1. **Si ya instalaste SH/ST y ejecutaste el SQL**, ejecutá primero `sql/chirp_SH_ST_3min_actualizar.sql` para ampliar las restricciones de duración. No hace falta repetir las políticas RLS ni crear nuevas tablas. Si es una instalación nueva, usá `sql/chirp_shorts_stories.sql` (ya incluye el límite de 180 segundos); hacé una copia de seguridad antes de aplicar el SQL.
2. Abrí **Supabase > SQL Editor**, pegá todo `sql/chirp_shorts_stories.sql` y ejecutalo **una sola vez**. La migración crea siete tablas nuevas (`sh_videos`, `sh_likes`, `sh_comments`, `sh_views`, `st_stories`, `st_views`, `st_replies`) y dos buckets privados (`chirp-shorts`, `chirp-stories`). Reutiliza `public.profiles` y `public.follows`. Incluye políticas de acceso RLS.
3. En **Supabase > Storage > Settings**, verificá que el límite global de carga admita el máximo que querés permitir (los límites del bucket no pueden superar el global). Si tu plan admite menos, reducí el límite de bytes en `sh-st.js` y en los buckets del SQL. La grabadora utiliza un bitrate moderado para favorecer que 3 minutos entren en 50 MB, pero cada navegador puede generar tamaños distintos.
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

## Nuevo: Shorts y Stories de 3 minutos

- La cámara y los videos seleccionados en galería aceptan **hasta 03:00** tanto en Shorts como en Stories; el grabador se detiene al alcanzar el límite.
- Las fotos publicadas como Stories siguen mostrándose 5 segundos; las Stories siguen vigentes 24 horas desde su publicación.
- **Si ya ejecutaste el SQL anterior**, tenés que ejecutar `sql/chirp_SH_ST_3min_actualizar.sql`, porque los CHECK antiguos (90s/30s) rechazarían videos más largos.
- Para grabación se solicita bitrate aproximado de 1.65 Mbps de video y 96 kbps de audio, para reducir el riesgo de superar el máximo de 50 MB del bucket de Stories. Algunos dispositivos pueden ignorar ese valor.
- Se conservan los límites de archivo existentes: **100 MB para Shorts**, **50 MB para Stories**. En Supabase Free, el máximo global es 50 MB: si tu proyecto es Free, verificá que los límites de bucket no excedan el global.
- No se necesitan nuevas tablas, nuevas credenciales ni nuevas rutas.

## Feed: solo perfiles seguidos y orientación de cámara

- Home y la página Stories muestran únicamente historias de los perfiles que seguís en `public.follows` (`follower_id` = usuario conectado, `following_id` = autor), además de las propias.
- Se filtra **antes** de pedir las historias al servidor: no aparecen cuentas desconocidas, aunque publiquen contenido reciente.
- Esto es un filtro del **feed**, no un sistema de privacidad que impida consultar otras Stories por API. Para Stories privadas se necesitarían políticas RLS adicionales.
- La cámara detecta automáticamente formato vertical u horizontal a partir de las dimensiones reales del video; el visor se adapta sin estirar ni recortar. Las fotos preservan la proporción original del sensor. La orientación de los videos grabados depende también del navegador y del dispositivo.
- Shorts y Stories mantienen el máximo de **3:00**; no hace falta ejecutar SQL adicional para este filtro si la migración 3 minutos ya se aplicó.
- Conservá `assets/fonts/ChirpSans` del proyecto original: los ZIP de entrega no redistribuyen tipografías.
