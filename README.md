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
