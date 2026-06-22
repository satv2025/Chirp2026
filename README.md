# Chirp Rosin Custom Native

Versión multi-page real, sin SPA, sin `#` en rutas, con diseño rosa moderno y controles custom.

## Correr local

```bash
cd chirp-rosin-custom-native
npx serve -l 3000 .
```

Abrí:

```txt
http://localhost:3000/
http://localhost:3000/register/
http://localhost:3000/home/
```

## Deploy en Vercel

Subí la carpeta completa. Incluye `vercel.json` con `cleanUrls` y rewrites específicos para:

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

Esto evita depender de `db.chirp.com.ar` para Auth mientras el custom domain no esté fino.

## SQL importante

Pegá este archivo en Supabase SQL Editor:

```txt
supabase/chirp-fix-patch.sql
```

Además de los ajustes anteriores, ahora incluye:

- `handle_new_user()` seguro: el trigger ya no debería bloquear el signup si falla `profiles` o `account_settings`.
- `ensure_current_user_profile()`: función RPC para crear/reparar el perfil del usuario logueado desde el frontend.
- `security_events` y `support_tickets`.
- buckets/policies para `avatars`, `banners`, `chirp-media`.
- policies de Storage sin usar `alter table storage.objects enable row level security`.

## Auth / crear cuenta

El registro usa `supabase.auth.signUp()` con timeout más largo para signup.

Si `Confirm email` está OFF, al crear cuenta redirige al timeline.
Si `Confirm email` está ON, muestra el mensaje para revisar el correo.

Si vuelve a tardar mucho, el problema suele estar en SMTP/Confirm email, no en la UI.

## Controles nativos vs custom

- Login y registro usan inputs nativos para email/password/nombre, por seguridad, autocompletado y accesibilidad.
- El resto de campos visibles de la app usan controles custom:
  - composer de Chirps con `div.contenteditable` custom.
  - búsqueda custom.
  - settings custom.
  - soporte custom.
  - dropdown custom con teclado.
  - switch custom con teclado.
  - upload custom con input file invisible.
- No hay `<select>` ni checkbox nativo visible.

## Media

- Fotos: se muestran como media social normal, estilizadas con CSS.
- Videos: usan Plyr estilizado rosa, con look de player social, sin controles nativos visibles.

## Emails

Los templates están en:

```txt
emails/
```

Asuntos sugeridos:

```txt
emails/SUBJECTS.md
```

Todos los emails usan solo:

```css
font-family:'Google Sans';
```

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
