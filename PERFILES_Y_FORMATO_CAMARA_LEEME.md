# Chirp — enlaces de perfiles + selector de formato de cámara

## Cambios
- URL pública: `/profile/{username}` (p. ej. `https://chirp.com.ar/profile/SKB`).
- `/profile` abre el perfil propio (si la sesión está iniciada).
- Los enlaces de Chirps, menciones, usuarios, Shorts, comentarios y Stories usan el formato nuevo.
- Los enlaces antiguos `/u/{username}` y `/{username}` continúan resolviendo al perfil público.
- Rutas configuradas en `vercel.json`, `_redirects` (Netlify) y `serve.json` (desarrollo local).
- El perfil público no exige sesión para cargar los datos que permitan las políticas RLS de Supabase. Para seguir o interactuar sí se requiere iniciar sesión.
- Selector en la cámara de SH y ST: **Vertical 9:16** o **Horizontal 16:9**. Su elección prevalece sobre la detección automática. La elección se bloquea mientras se graba.
- La grabación con Canvas y las fotos usan la orientación elegida para el archivo final, no solo para la vista previa. Si la fuente tiene otra proporción, se mantiene completa con bandas para evitar estiramientos.
- Duración máxima: 180 segundos para Shorts y Stories.

## Instalación
Si Chirp ya está desplegado, aplicar el ZIP de parche sobre el proyecto actual sin borrar los archivos existentes, especialmente `assets/fonts/ChirpSans`.
Si se usa el ZIP de código completo, conservar/copy de la instalación anterior los archivos propios de fuentes (los binarios de fuente NO se redistribuyen en el ZIP).
Publicar nuevamente en el hosting que use Chirp para activar las reglas de rutas.
No hace falta aplicar un SQL adicional. Los perfiles públicos dependen de las políticas RLS ya existentes.

## Importante
Para dispositivos reales, acceder por HTTPS, habilitar cámara y micrófono y probar grabación vertical y horizontal. Los navegadores pueden dar dimensiones del sensor diferentes de la orientación física; el selector manual controla el formato de salida (con bandas, sin deformar).
