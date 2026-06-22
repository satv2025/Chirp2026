# Chirp Rosin Social

Versión multi-page real, sin SPA y sin `#` en las rutas.

## Correr local

```bash
cd chirp-rosin-social
npx serve -l 3000 .
```

Abrí:

```txt
http://localhost:3000/
http://localhost:3000/register/
http://localhost:3000/home/
```

## Deploy en Vercel

Subí la carpeta completa. El proyecto incluye `vercel.json` con `cleanUrls` y rewrites específicos para:

- `/u/:username`
- `/chirp/:id`

No hay fallback global de SPA.

## Supabase

La conexión está en:

```txt
js/config.js
```

Usa el Project URL directo:

```txt
https://kdohnkpykpcmnoyxhkte.supabase.co
```

Esto evita el 504 que venía de `https://db.chirp.com.ar/auth/v1/signup`.

## SQL

Pegá este archivo en Supabase SQL Editor:

```txt
supabase/chirp-fix-patch.sql
```

Crea/ajusta:

- `security_events`
- `support_tickets`
- columnas `storage_bucket` y `storage_path` para media
- buckets `avatars`, `banners`, `chirp-media`
- policies de Storage sin tocar `alter table storage.objects enable row level security`

## Emails

Los templates están en:

```txt
emails/
```

Asuntos sugeridos:

```txt
emails/SUBJECTS.md
```

Todos los emails usan:

```css
font-family:'Google Sans';
```

sin fallback.

## Diseño

- Rosa moderno, más limpio.
- Bordes moderados: nada exageradamente redondeado.
- No se usan `<select>` ni inputs checkbox nativos visibles.
- Los toggles/dropdowns son componentes custom con `div`/`button`.
- Los botones de archivo son custom; el input file queda invisible dentro del label.
- Las fotos se muestran como media social normal con CSS.
- Los videos usan Plyr estilizado rosa, sin controles nativos de HTML.

## Storage paths esperados

```txt
avatars/{user_id}/avatar-*.webp
banners/{user_id}/banner-*.webp
chirp-media/{user_id}/{chirp_id}/archivo.mp4
chirp-media/{user_id}/{chirp_id}/archivo.webp
```

## Configuración de Auth recomendada

En Supabase → Authentication → URL Configuration:

```txt
Site URL:
https://chirp.com.ar

Redirect URLs:
https://chirp.com.ar/**
http://localhost:3000/**
```


## Extras visuales

- Logo oficial incluido: `assets/logo-duck.png`
- Favicons incluidos: `assets/favicon-32.png`, `assets/favicon.ico`, `assets/favicon-192.png`, `assets/favicon-512.png`
- Manifest: `assets/manifest.webmanifest`


## Favicon final

Este paquete usa el patito rosa exacto provisto por SKB como identidad visual:

- `assets/logo-duck.png`
- `assets/favicon.ico`
- `assets/favicon-16.png`
- `assets/favicon-32.png`
- `assets/favicon-64.png`
- `assets/favicon-192.png`
- `assets/favicon-512.png`
- `assets/apple-touch-icon.png`

El fondo exterior fue recortado a transparente preservando detalles internos blancos del logo.


## Mobile responsive v2

- `js/device.js` detecta mobile/tablet por User-Agent y agrega `html[data-device="mobile"]`.
- El `mobile-nav` y `mobile-topbar` quedan ocultos por defecto y solo aparecen en mobile/tablet detectado.
- En desktop no se muestra el mobile-nav aunque la ventana esté angosta.
- UI mobile agrandada: tabs inferiores con label, composer más grande, botones más visibles, cards más cómodas y safe-area para iPhone.


## Responsive mobile + hashtags

- `js/device.js` detecta mobile/tablet por User-Agent. En desktop el `mobile-nav` no aparece aunque achiques la ventana.
- Mobile UI más grande y visible: bottom nav con labels, composer más alto, botones más cómodos y soporte safe-area.
- Los hashtags se renderizan clickeables en el feed.
- Al crear un Chirp, el frontend llama a `sync_chirp_entities_for(...)` para asegurar que hashtags/menciones se guarden aunque el trigger ya lo haya hecho.
- Para activar el fix de hashtags, pegá `supabase/chirp-fix-patch.sql` en Supabase.


## Redirect automático de sesión

- Si el usuario ya está logueado y entra a `/`, `/login/`, `/signin/`, `/register/` o `/signup/`, Chirp lo manda automáticamente a `/home/`.
- Las páginas privadas siguen validando sesión con `requireUser()`.

## Responsive híbrido final

- Se mantiene detección por User-Agent/touch en `js/device.js`.
- La UI sigue respondiendo por ancho de pantalla en todo momento.
- Desktop angosto usa sidebar compacto, no bottom nav.
- Mobile/tablet real usa topbar + bottom nav grande y visible.


## Legal HTML

Se agregó una sección legal completa en HTML, no PDF:

- `/legal/` documento completo estilizado.
- `/terms/` redirige a términos.
- `/privacy/` redirige a privacidad.
- Registro muestra enlaces a términos y privacidad.

El documento fue reescrito para la nueva versión de Chirp: ahora contempla cuenta, login, perfil, media, hashtags, menciones, notificaciones, privacidad, soporte y proveedores técnicos.
