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

## Registro y errores de Auth

Esta versión muestra los errores reales de Supabase Auth en el formulario de registro y en la consola del navegador.

Si aparece `email rate limit exceeded`, el problema está en Authentication → Rate Limits.
Si aparece timeout o 504, revisá Authentication → Logs, SMTP y triggers de signup.
El timeout visual del frontend está en `js/config.js` como `authTimeoutMs: 30000`.

Para probar en local:

```bash
npx serve -l 3000 .
```
