# CabezApp

La barbería de Cabezas: los colegas piden cita, ven cuántos cortes les quedan del bono y dejan reseñas.
Cabezas lo gestiona todo desde su panel.

- Web: https://cabezapp.netlify.app
- Panel de admin: https://cabezapp.netlify.app/admin (pide la clave la primera vez)

## Pantallas

| Dirección | Para quién | Qué hace |
|---|---|---|
| `/` | Cualquiera | Pide cita con nombre y móvil, ve el precio del bono y las reseñas |
| `/c/<código>` | Cada colega (enlace personal) | Su bono en forma de tarjeta de sellos, sus citas, pedir cita, su reseña |
| `/admin` | Cabezas | Validar citas, horario, clientes y bonos, reseñas, ajustes |

## Cómo va

1. Cabezas marca en **Horario** las horas que puede.
2. Manda el enlace general (o el personal de cada uno) por WhatsApp.
3. El colega pide día, hora y corte. Le sale un botón para avisar a Cabezas por WhatsApp.
4. Cabezas pulsa **Validar y avisar**: se abre WhatsApp con la confirmación (y el aviso legal de la maquinilla).
5. Al terminar, **Corte hecho** descuenta uno del bono y le manda un WhatsApp pidiendo reseña.

## Técnica

- `public/`: la web (HTML, CSS y JS sin dependencias).
- `netlify/functions/api.mjs`: el servidor. Guarda todo en Netlify Blobs (almacén `cabezapp`).
- La clave del panel está en la variable de entorno `ADMIN_KEY` de Netlify, no en el código.
- Publicar: `netlify deploy --prod --dir public --functions netlify/functions` desde esta carpeta.
