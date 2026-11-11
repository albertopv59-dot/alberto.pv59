# CabezApp

La barbería de Cabezas: los colegas piden cita, ven cuántos cortes les quedan del bono y dejan reseñas.
Cabezas lo gestiona todo desde su panel.

- Web: https://cabezapp.netlify.app
- Panel de admin: https://cabezapp.netlify.app/admin (pide la clave la primera vez)

## Pantallas

| Dirección | Para quién | Qué hace |
|---|---|---|
| `/` | Cualquiera | Pide corte para esta semana o la que viene, con nombre y móvil |
| `/c/<código>` | Cada colega (enlace personal) | Pide corte, pilla uno de los huecos que le pasa Cabezas, ve su bono y deja reseña |
| `/admin` | Cabezas | Peticiones, huecos libres, clientes y bonos, reseñas, ajustes |

## Cómo va

1. El colega pide corte para **una semana** (y si le va mejor tarde, mañana o finde). Avisa a Cabezas por WhatsApp.
2. Cabezas marca sus huecos libres en **Huecos**.
3. En **Peticiones** elige qué huecos le pasa y pulsa **Mandar huecos**: se abre WhatsApp con la lista y su enlace.
4. El colega abre su enlace y **pilla un hueco** (el primero que lo pilla se lo queda). El corte queda confirmado.
5. Cabezas pulsa **Mandar confirmación** (con el aviso legal de la maquinilla) y, al terminar, **Corte hecho**, que descuenta uno del bono y pide reseña.

## Versión app

Se instala desde el navegador (Android: «Instalar app»; iPhone: Compartir → «Añadir a pantalla de inicio»).
La app instalada abre la página desde la que se instaló: la zona personal de cada uno o el panel de admin.

## Técnica

- `public/`: la web (HTML, CSS y JS sin dependencias), logo, iconos y `sw.js` para que funcione como app.
- `netlify/functions/api.mjs`: el servidor. Guarda todo en Netlify Blobs (almacén `cabezapp`).
- La clave del panel está en la variable de entorno `ADMIN_KEY` de Netlify, no en el código.
- Publicar: `netlify deploy --prod --dir public --functions netlify/functions` desde esta carpeta.
