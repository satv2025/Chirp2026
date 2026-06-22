# Chirp Pink Pro

App web vanilla para **Chirp**, una red social tipo Twitter/X donde las publicaciones son **Chirps** y la acción es **Chirpear**.

Está hecha con:

- HTML por secciones
- CSS separado por capas
- JS modular con ES Modules
- Supabase Auth
- Supabase Database
- Supabase Storage
- Supabase Realtime
- Theme rosa
- Fuente Gilroy desde `https://solargentinotv.com.ar/assets/fonts/Gilroy/Gilroy.css`
- `font-family: Gilroy` aplicado solamente en el selector `*`
- Favicon SVG de patito rosa
- Generador de favicon en `tools/favicon-generator.html`

## Estructura

```txt
chirp-pink-pro/
├─ index.html
├─ README.md
├─ assets/
│  ├─ favicon.svg
│  ├─ app-icon.svg
│  ├─ duck-logo.svg
│  └─ avatar-placeholder.svg
├─ css/
│  ├─ base.css
│  ├─ layout.css
│  ├─ components.css
│  └─ responsive.css
├─ js/
│  ├─ app.js
│  ├─ auth.js
│  ├─ chirps.js
│  ├─ config.js
│  ├─ notifications.js
│  ├─ realtime.js
│  ├─ state.js
│  ├─ storage.js
│  ├─ supabaseClient.js
│  └─ ui.js
└─ tools/
   └─ favicon-generator.html
```

## Cómo correr local

No abras el HTML directo con doble click, porque usa módulos JS. Levantalo con servidor local:

```bash
python3 -m http.server 3000
```

Después abrí:

```txt
http://localhost:3000
```

## Supabase conectado

El proyecto ya está apuntado a:

```txt
https://db.chirp.com.ar
```

La anon key está en:

```txt
js/config.js
```

## Lo que tiene la app

- Login
- Registro
- Recuperar contraseña
- Crear perfil
- Editar username
- Editar nombre visible
- Editar bio
- Editar web
- Editar ubicación
- Cuenta privada
- Subir avatar
- Subir banner
- Crear Chirp
- Adjuntar imagen, GIF, video o audio
- Feed
- Likes
- Rechirps
- Bookmarks
- Respuestas
- Borrar Chirp con soft delete
- Notificaciones
- Marcar notificaciones leídas
- Buscar texto, hashtags o usuarios de forma básica
- Trending hashtags
- Realtime para feed y notificaciones

## Buckets esperados

La app espera estos buckets:

```txt
avatars
banners
chirp-media
```

Rutas usadas:

```txt
avatars/{user_id}/avatar-timestamp.ext
banners/{user_id}/banner-timestamp.ext
chirp-media/{user_id}/{chirp_id}/archivo.ext
```

## Tablas esperadas

La app está pensada para el SQL de Chirp con estas tablas principales:

```txt
profiles
account_settings
chirps
chirp_media
likes
bookmarks
rechirps
follows
follow_requests
blocks
mutes
notifications
mentions
hashtags
chirp_hashtags
reports
```

## Importante

- No pongas una service role key en frontend.
- Esta app usa anon key, como corresponde para cliente web.
- La seguridad depende de que RLS esté bien activado en Supabase.
- Email, teléfono, contraseña y sesiones los maneja Supabase Auth.
- Los datos sociales los manejan las tablas públicas.

## Favicon

El favicon default está en:

```txt
assets/favicon.svg
```

También incluí un generador visual en:

```txt
tools/favicon-generator.html
```

Ahí podés elegir pollito o patito, cambiar el rosa y descargar el SVG.
