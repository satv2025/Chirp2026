# Chirp Flat Final Clean

Estructura plana final.

## Raíz

```txt
index.html
login.html
signin.html
register.html
signup.html
reset.html
update-password.html
auth-callback.html
home.html
explore.html
notifications.html
bookmarks.html
profile.html
settings.html
support.html
u.html
chirp.html
legal.html
assets/
serve.json
vercel.json
package.json
README.md
```

Todo lo legal vive únicamente en:

```txt
legal.html
```

## Probar

```bash
cd chirp-flat-final-clean
npx serve -l 3000 .
```

Abrí:

```txt
http://localhost:3000/index.html
```

## SQL

```txt
assets/supabase/chirp-fix-patch.sql
```


## Hashtag fix

Todo hashtag navega explícitamente a:

```txt
explore.html?tag=nombre
```

También hay un handler global en `assets/js/chirp.js` para forzar que no se pierda el query `tag`.


## CSS dividido

Los estilos están separados por área:

```txt
assets/css/base.css
assets/css/components.css
assets/css/landing.css
assets/css/auth.css
assets/css/app-shell.css
assets/css/feed.css
assets/css/player.css
assets/css/legal.css
assets/css/responsive.css
```

No se usa `assets/css/chirp.css`.


## Social extras

- Se reemplazó el copy genérico por “Explorá hashtags, Chirps y usuarios”.
- Se agregó `messages.html` para DM privado.
- Se agregó `chirpy.html`, bot de ayuda con la imagen `assets/img/chirpy.png`.
- En perfil público se agregaron botones: Seguir, Dejar de seguir, Mensaje y Bloquear.
- SQL de DM agregado en `assets/supabase/chirp-fix-patch.sql`.


## Chirpy IA pro

- Chirpy ya no usa respuestas predefinidas por `if/else`.
- El frontend llama a `CFG.chirpyEndpoint`.
- Endpoint configurado en `assets/js/config.js`.
- Función backend incluida en `assets/supabase/functions/chirpy/index.ts`.
- Si no configurás proveedor IA, responde con fallback local temporal.
- Diseño de `chirpy.html` mejorado con hero, panel lateral, chat pro y estado online.


## Perfil público espectador

`u.html?username=usuario` ahora muestra:

- header de perfil público
- botón Seguir / Dejar de seguir
- botón Mensaje
- botón Bloquear / Desbloquear
- pestaña Chirps
- pestaña Seguidores
- pestaña Seguidos

CSS agregado:

```txt
assets/css/profile.css
```

SQL agregado para refrescar contadores de followers/following.


## Perfil tipo Instagram

La ruta pública principal de perfiles ahora es:

```txt
/{usuario}
```

Ejemplo:

```txt
http://localhost:3000/estapasando
```

También sigue funcionando como fallback:

```txt
u.html?username=estapasando
```

`u.html` lee el username desde query string o desde el pathname.


## Fix local /{usuario}

`npx serve` no entiende bien `/:username` como Vercel, por eso `/estapasando` podía dar 404 local.

Ahora `serve.json` tiene fallback:

```txt
/** -> /u.html
```

Así en local funciona:

```txt
http://localhost:3000/estapasando
```

y `u.html` lee el usuario desde `location.pathname`.

En producción Vercel usa:

```txt
/:username -> /u.html
```


## Chirpy backend real

Chirpy usa Supabase Edge Function + OpenAI Responses API.

1. Crear/pegar la función:

```txt
assets/supabase/functions/chirpy/index.ts
```

2. Deploy:

```bash
supabase functions deploy chirpy
```

3. Agregar secrets:

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set CHIRPY_MODEL=gpt-4.1-mini
```

`CHIRPY_MODEL` es opcional.

## Realtime de números

El frontend escucha cambios con Supabase Realtime en:

```txt
likes
bookmarks
rechirps
follows
blocks
chirps
chirp_media
chirp_hashtags
hashtags
direct_messages
notifications
```

Re-ejecutá:

```txt
assets/supabase/chirp-fix-patch.sql
```

Ese patch agrega tablas a `supabase_realtime`, crea triggers de contadores y hace backfill.


## Persistent vote state

Al renderizar Chirps, el frontend consulta:

```txt
likes
bookmarks
rechirps
```

para el usuario actual y marca los botones activos aunque se recargue la página.

También se agregaron índices únicos y políticas RLS en:

```txt
assets/supabase/chirp-fix-patch.sql
```
