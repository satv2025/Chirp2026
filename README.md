# Chirp frontend

Frontend estático de Chirp.

## Chirpy

El frontend apunta a la función ya desplegada:

```txt
https://db.chirp.com.ar/functions/v1/chirpy
```

La OpenAI key no va en este ZIP ni en el frontend. Va como secret del backend/Edge Function.

## Estructura

- HTMLs en raíz.
- Assets dentro de `assets/`.
- No se incluye carpeta `assets/supabase/`.
- No se incluye SQL.
- No se incluye función backend.

## Local

```bash
npx serve -l 3000 .
```


## Chirpy debug fix

`generateChirpyReply()` ahora soporta respuestas debug de la Edge Function:

```json
{
  "hasOpenAIKey": true,
  "model": "gpt-4.1-mini",
  "deployment": "..."
}
```

Si la función devuelve JSON sin `reply`, ahora lo muestra en el chat en vez de caer directo al fallback.


## Chirp pretty route repair

Arreglo aplicado sin modificar CSS de diseño.

- Respuestas usan `/chirp/ID`.
- `/chirp/ID` carga `chirp.html` y `chirp.js` lee el ID desde el pathname.
- Se eliminó el fallback global peligroso `/** -> u.html` de `serve.json`.
- `404.html` carga dinámicamente `chirp.html` o `u.html` según la ruta sin pisar la URL.


## Respuestas dentro del Chirp

Incluye:
- URL linda `/chirp/ID`.
- Composer dentro de `chirp.html` para responder al Chirp.
- Lista de respuestas debajo del Chirp.
- Realtime para `chirp_replies`.
- SQL en `supabase-replies.sql`.

Ejecutar `supabase-replies.sql` en Supabase SQL Editor antes de probar respuestas.


## Contenedores visibles de respuestas

`chirp.html` ahora incluye:
- `#replyComposerCard`
- `#replyComposer`
- `#replyListCard`
- `#replyList`

No se modificó ningún CSS.


## Autoverificación por 10k seguidores

Agregado sin tocar el diseño base:

- `supabase-autoverificacion.sql`
- `assets/css/autoverification.css`
- `assets/js/autoverification.js`
- Panel agregado en `settings.html`
- Includes agregados en los HTML:
  - `/assets/css/autoverification.css`
  - `/assets/js/autoverification.js`

### Supabase

Ejecutar completo:

```sql
supabase-autoverificacion.sql
```

La configuración queda en:

```txt
public.verification_settings
```

Campo principal modificable desde Supabase Table Editor:

```txt
min_followers = 10000
```

Para verificar manualmente un perfil desde Supabase Table Editor:

```txt
profiles.is_verified = true
profiles.verification_status = manual_verified
profiles.verified_at = now()
```

Para bloquear autoverificación de un perfil:

```txt
profiles.is_verified = false
profiles.verification_status = rejected
```
