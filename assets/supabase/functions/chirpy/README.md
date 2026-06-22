# Chirpy Backend

Chirpy usa Supabase Edge Function + OpenAI Responses API.

## Secrets

```bash
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set CHIRPY_MODEL=gpt-4.1-mini
```

`CHIRPY_MODEL` es opcional.

## Deploy

```bash
supabase functions deploy chirpy
```

El frontend llama a:

```txt
https://TU_PROYECTO.supabase.co/functions/v1/chirpy
```
