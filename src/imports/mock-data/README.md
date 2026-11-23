# Datos de ejemplo para el frontend de la demo

Respuestas **reales** de la API, capturadas en un solo recorrido del ciclo de abastecimiento. Sirven para prototipar las pantallas en Figma o como mocks del frontend mientras no hay un backend a mano. El contrato que explican está en [../frontend-contrato.md](../frontend-contrato.md).

## Cómo se obtuvieron

1. Stack local con `docker compose up --build` desde `develop` (`0b62743`), base nueva (migraciones V1 a V40).
2. Datos sembrados con `tools/demo/sembrar_demo.py` (2 variantes, 2 CD, 2 tiendas, niveles y un usuario por rol).
3. Recorrido por HTTP con el token de cada rol: venta, recomendación, aprobación, despacho completo y parcial, viajes, salida, llegada, recepción total y con discrepancia, reapertura, segundo ciclo, cierre con faltante y cancelación. También se provocaron los errores de cada paso.
4. Fecha: 22 de noviembre de 2026; el servidor trabaja en UTC, por eso las fechas dicen 23 nov, 00:37 a 00:38 (19:37 a 19:38 hora de Colombia).

Para tener un usuario fuera de alcance se agregó a mano una tercera tienda (Sur) con un vendedor, un planificador y un encargado asignados solo a ella, y un usuario con MFA activo.

## Qué se cambió respecto a la captura

Nada en la forma ni en los números. Solo se reemplazó lo sensible o lo que depende de la corrida:

| Original | En estos archivos |
| :--- | :--- |
| Access token, token de desafío MFA y cualquier JWT | `<ACCESS_TOKEN>`, `<MFA_CHALLENGE_TOKEN>`, `<JWT>` |
| Valor de la cookie `refresh_token` | `<REFRESH_TOKEN>` (se conservan sus atributos) |
| Contraseñas y códigos TOTP enviados | `<CONTRASEÑA_DEMO>`, `<CODIGO_TOTP>` |
| Secreto TOTP, QR y códigos de respaldo | `<SECRETO_TOTP_BASE32>`, `data:image/png;base64,<IMAGEN_QR>`, `<CODIGO_RESPALDO_n>` |
| Emails de los usuarios de demo (`demo.<rol>.<sufijo>@supplychain.local`) | `<rol>@demo.local`, por ejemplo `vendedor@demo.local`, `encargado-bodega@demo.local` |
| Sufijo de la corrida del sembrador (fecha y hora) | `S3`, por ejemplo `DEMO-S3-AZ-M`, `Tienda Demo Centro S3` |

Los ids (UUID) son los reales y son **consistentes entre archivos**: la tienda, la orden o el viaje de un archivo es el mismo en los demás.

## Formato de cada archivo

```json
{"pantalla": "…", "descripcion": "…", "origen": "…",
 "llamadas": [
   {"caso": "p7_recepcion_201_discrepancia_parcial", "rol": "ENCARGADO_BODEGA",
    "request": {"metodo": "POST", "ruta": "/api/v1/viajes/…/paradas/…/recepcion", "cuerpo": {"cantidadRecibida": 8}},
    "status": 201, "nota": "…", "body": { … }}]}
```

`caso` empieza por el paso del guion (`p1` a `p8`), o por `auth`, `lookup`, `inv`, `pag` o `err` para lo transversal. `rol` dice con qué usuario se hizo (`(otra tienda)` = usuario de la tienda Sur). Las llamadas van en el orden en que se hicieron.

## Archivos

| Archivo | Pantalla |
| :--- | :--- |
| `00-ids-de-referencia.json` | Ids de variantes, CD, tiendas (con Almacén y Bodega), órdenes y viajes del recorrido |
| `01-login-mfa.json` | Login, segundo factor, renovación, cierre y activación de MFA |
| `02-registrar-venta.json` | Registrar venta (paso 1) |
| `03-inventario-por-nodo.json` | Inventario por nodo, kardex, traspasos, ajustes y la **secuencia de las cinco magnitudes** en cada momento del recorrido |
| `04-recomendaciones.json` | Listar, aprobar, editar, rechazar y evaluar (pasos 1 y 2) |
| `05-detalle-orden.json` | Orden con intentos de CD, sin CD, cancelada, reabierta y cerrada (paso 3 y siguientes) |
| `06-despacho.json` | Despacho completo y parcial, segundo ciclo y ciclos pendientes de viaje (paso 4) |
| `07-armar-viaje.json` | Armar viaje (paso 5) |
| `08-salida-llegada.json` | Salida y llegada (paso 6) |
| `09-recepcion.json` | Paradas por recibir y recepción con y sin discrepancia (paso 7) |
| `10-cerrar-con-faltante.json` | Cerrar con faltante y camino del segundo ciclo (paso 8) |
| `11-navegacion-y-roles.json` | Scopes reales de cada rol, claims del token, lookups permitidos y prohibidos, errores con el cuerpo por defecto de Spring |

## Las órdenes del recorrido

| Orden | Tienda y variante | Qué muestra |
| :--- | :--- | :--- |
| A (`2e3d0e2d…`) | Centro · AZ-M · 19 | Caso feliz: fallback (Sin Stock → Principal), despacho completo, recepción total, CERRADA |
| B (`97f1888b…`) | Centro · BL-L · 19 | Merma en el CD, despacho PARCIAL (10/19, 0.5263), recepción 8 de 10, REABIERTA con 11, segundo ciclo de 11, CERRADA |
| C (`24ddd9f9…`) | Norte · AZ-M · 15 (editada desde 19) | Recepción 12 de 15, REABIERTA con 3, cerrada con faltante |
| D (`32beaddb…`) | Norte · BL-L · 5000 | Ningún CD alcanza: GENERADA sin CD, luego CANCELADA |
| E (`bd68f77c…`) | Norte · BL-L · 2 | Asignada al CD de prioridad 1 (Sin Stock); su viaje (V3) quedó ARMADO, sin salir |

Al final del recorrido queda una recomendación BORRADOR de 17 para Norte · BL-L: nació sola al aprobar solo 2 unidades de la orden E.

## Cómo regenerarlos

Los scripts de captura no están en el repositorio. Para volver a capturar: levantar el stack, correr el sembrador y repetir las llamadas del [recorrido de la sección 12 del contrato](../frontend-contrato.md#12-recorrido-de-la-demo-llamada-por-llamada). Los ids cambiarán.
