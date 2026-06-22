# Chirp Rosin MPA + mails Supabase

App multi-page real para Chirp, sin SPA, sin hash `#`, con rutas por carpetas y `vercel.json`.

## Probar local

```bash
cd chirp-rosin-mail-mpa
npx serve -l 3000 .
```

Rutas locales que funcionan directo:

- `/`
- `/login/`
- `/register/`
- `/reset/`
- `/auth/callback/`
- `/update-password/`
- `/home/`
- `/explore/`
- `/notifications/`
- `/bookmarks/`
- `/profile/`
- `/settings/`
- `/u/` local con `?username=usuario`
- `/chirp/` local con `?id=uuid`

En Vercel también funcionan:

- `/u/:username`
- `/chirp/:id`

porque están en `vercel.json` como rewrites específicos, no como SPA fallback global.

## Supabase

La conexión está en:

```txt
js/config.js
```

Ya está seteada con:

```txt
https://db.chirp.com.ar
```

## SQL

Pegá este archivo en Supabase SQL Editor:

```txt
supabase/chirp-complete-patch.sql
```

Este patch:

- no desactiva RLS;
- no ejecuta `alter table storage.objects enable row level security`;
- agrega `security_events`;
- agrega `support_requests`;
- mejora el trigger de creación de perfil;
- crea perfiles/settings faltantes para usuarios existentes;
- crea/fija buckets de Storage;
- crea/fija policies de Storage;
- deja listo el flujo de reset/update password y soporte.

## Templates de email

Los HTML están en:

```txt
emails/
```

Pegar manualmente en:

```txt
Supabase Dashboard > Authentication > Email Templates
```

Incluye:

- `confirm-signup.html`
- `invite.html`
- `magic-link.html`
- `change-email-confirm.html`
- `reset-password.html`
- `otp.html`
- `password-changed.html`
- `email-changed.html`
- `SUBJECTS.md`

Todos usan solamente:

```css
font-family:'Google Sans';
```

sin fallback.

## Redirect URLs recomendadas en Supabase

En Authentication > URL Configuration:

```txt
Site URL: https://tu-dominio.vercel.app
Redirect URLs:
http://localhost:3000/**
https://tu-dominio.vercel.app/**
https://chirp.com.ar/**
```

Para reset password, la app usa:

```txt
/auth/callback/?next=/update-password/
```

## Storage paths

Usar estas rutas:

```txt
avatars/{user_id}/avatar.ext
banners/{user_id}/banner.ext
chirp-media/{user_id}/{chirp_id}/archivo.ext
```

## Mails y funciones

La app contempla:

- confirmación de cuenta;
- magic link;
- recuperación de contraseña;
- pantalla para crear nueva contraseña;
- cambio de email desde ajustes;
- cambio de contraseña desde ajustes;
- eventos de seguridad en `security_events`;
- formulario de soporte en `support_requests`.
