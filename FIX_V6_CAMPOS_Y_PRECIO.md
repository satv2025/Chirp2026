# Chirp v6 - Fix campos de pago y precio mensual

Cambios:
- Los campos seguros de tarjeta ahora tienen CSS reforzado para permitir foco/escritura.
- Los wrappers de número, vencimiento y código dejaron de ser `<label>` y pasan a `<div>` para no interferir con iframes seguros.
- El precio muestra `/ mes` en todos los labels dinámicos.
- La UI no nombra al procesador salvo el badge de pago seguro.
