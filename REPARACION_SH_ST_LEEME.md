# Chirp Shorts y Stories — reparación de carga, cámara y creación

## Instalación
Preferí aplicar el parche sobre la versión instalada para conservar todos los archivos originales, especialmente las fuentes de `assets/fonts/ChirpSans`.
El ZIP de código completo no incluye los archivos binarios de tipografía.
No se requiere SQL nuevo para este arreglo; siguen siendo válidos el SQL inicial y la actualización a 3 minutos.

## Cambios
- Home carga 12 Chirps inicialmente, no 50. Resuelve en paralelo las URLs firmadas y publica el timeline sin esperar las tres consultas de likes/bookmarks/rechirps.
- Evita cargar el timeline completo ante eventos no relacionados (mensajes, notificaciones, seguidores).
- Supabase CDN diferida y CSS del reproductor cargado de forma no bloqueante en Home, Shorts y Stories.
- «Crear Short», «Grabar Short» y «Subir video» accesibles en Shorts aun sin contenido, además de enlace desde Home.
- «Grabar Short» abre directamente el editor y solicita cámara con interacción explícita.
- Detección del teléfono en vertical/horizontal por viewport real; en PC por resolución de la cámara.
- Grabación canvas cuando está disponible: preserva la proporción sin estiramientos, con orientación fijada al comienzo de cada toma (girar el dispositivo antes de grabar).
- Fotos de Stories con orientación del dispositivo; máximo de 3 minutos para videos de Shorts y Stories.
- Stories de seguidos y propias, sin cambios de esquema.

## Verificación
El rendimiento real depende del servidor y del acceso a Supabase; validar en producción desde Chrome DevTools > Network. La cámara y el micrófono reales necesitan HTTPS y permisos.
