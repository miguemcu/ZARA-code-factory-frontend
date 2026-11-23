# Guion del review: ciclo de abastecimiento (Sprint 3)

Recorre en unos 10 minutos los siete pasos del ciclo con un usuario por rol. Cada paso se puede hacer en Swagger (`/swagger-ui.html`, botón **Authorize** con el token del rol) o con la llamada indicada.

## 0. Preparación (antes del review)

1. La API debe tener aplicadas todas las migraciones del Sprint 3 (hasta V40).
2. Sembrar los datos con un usuario ADMIN:

   ```bash
   python3 tools/demo/sembrar_demo.py --api <URL de la API> --email <email del admin> --salida demo.json
   ```

   El script pide por consola la contraseña del admin (y el código MFA si aplica) y la contraseña que tendrán los usuarios de demo. Crea todo por la API, con nombres únicos por corrida:

   | Qué | Detalle |
   | :--- | :--- |
   | 2 variantes | `DEMO-<sufijo>-AZ-M` y `DEMO-<sufijo>-BL-L` |
   | 2 CD | **Principal** con 200 por variante; **Sin Stock** con 3 |
   | 2 tiendas | Almacén con 2 y Bodega con 6 por variante; prioridad: primero el CD Sin Stock, después el Principal |
   | Niveles | Umbral interno 3/6 (Almacén) y nivel al CD 5/20 (Bodega) por variante |
   | 6 usuarios | VENDEDOR, SUPERVISOR_TIENDA, PLANIFICADOR_ABASTECIMIENTO y ENCARGADO_BODEGA (en las dos tiendas), OPERADOR_CD y COORDINADOR_TRANSPORTE |

3. `demo.json` trae los ids y los emails creados, sin contraseñas. La contraseña de demo se comparte con el equipo por otro medio.
4. Iniciar sesión con cada usuario (`POST /api/v1/auth/login`) y tener los seis tokens a mano. Duran 15 minutos.

## 1. Recomendar (HU-43): la venta dispara todo

**VENDEDOR** · `POST /api/v1/ventas`

```json
{"transaccionId": "<uuid nuevo>", "tiendaId": "<tienda Centro>", "forzarSinStock": false,
 "items": [{"sku": "DEMO-<sufijo>-AZ-M", "cantidad": 1, "precioUnitario": 89900}]}
```

Qué mostrar:
* El Almacén baja a 1, bajo su mínimo de 3. El traspaso automático lo repone a 6 desde la Bodega (HU-48 del Sprint 2), y la Bodega queda en 1.
* Con la Bodega en 1, por debajo de su nivel de 5, nace una recomendación BORRADOR de 20 − 1 = **19**.

**PLANIFICADOR** · `GET /api/v1/recomendaciones?tiendaId=<tienda Centro>&estado=BORRADOR`

## 2. Aprobar (HU-44) y 3. Orden con fallback de CD (HU-45)

**PLANIFICADOR** · `POST /api/v1/recomendaciones/{id}/aprobar` (sin cuerpo, o con `{"cantidadAprobada": N}`)

Qué mostrar en `orden`:
* `intentos`: el **CD Sin Stock** aparece como `SIN_STOCK` (tiene 3 y pide 19) y el **Principal** como `ASIGNADO`.
* La orden queda APROBADA. En el CD sube `saliente` en 19 y en la Bodega sube `entrante` en 19. Se ve con `GET /api/v1/nodos/{nodoId}/inventario`.

## 4. Despachar (HU-46)

**OPERADOR_CD** · `POST /api/v1/ordenes-reabastecimiento/{ordenId}/despachos` (sin cuerpo)

* El ciclo queda COMPLETO, con fill rate 1.0000. El CD baja `a_la_mano` (kardex DESPACHO) y libera su reserva.
* Variante para mostrar un ciclo PARCIAL: antes de despachar, el ADMIN registra una merma en el CD (`POST /api/v1/nodos/{nodoCd}/inventario/ajustes` con `delta` negativo y motivo `MERMA`).

## 5. Armar viaje (HU-47)

**COORDINADOR** · `GET /api/v1/ciclos-despacho?sinViaje=true` y luego `POST /api/v1/viajes`

```json
{"cdId": "<CD Principal>", "vehiculo": "Camión DEMO-001", "paradas": [{"cicloDespachoId": "<ciclo>"}]}
```

Se pueden agregar ciclos de las dos tiendas en el mismo viaje. Un ciclo de otro CD responde **422**, y uno que ya está en otro viaje, **409**.

## 6. Salida y llegada (HU-48)

**COORDINADOR**
* `POST /api/v1/viajes/{id}/salida`: el viaje queda EN_CURSO y las paradas y la orden, EN_TRANSITO.
* `POST /api/v1/viajes/{id}/paradas/{paradaId}/llegada`: la parada queda ENTREGADO. Con la última, el viaje se CIERRA.
* Las dos aceptan una hora del cliente (`fechaSalida` o `fechaLlegada`). Una hora futura responde **400**; una llegada anterior a la salida, **422**.

## 7. Recibir (HU-49)

**ENCARGADO_BODEGA** · `GET /api/v1/paradas-por-recibir` y luego `POST /api/v1/viajes/{id}/paradas/{paradaId}/recepcion`

```json
{"cantidadRecibida": 17}
```

* Se recibieron 17 de 19: la **discrepancia** es 2 (pérdida en tránsito, sin kardex). La orden queda **REABIERTA** con 2 pendientes.
* La Bodega queda con `a_la_mano` 1 + 17 = 18 y `entrante` 2.

## 8. Cerrar el ciclo

Hay dos caminos para la orden REABIERTA:
* **Despachar el pendiente**: se repiten los pasos 4 a 7, se crea el ciclo 2 de la misma orden y, al recibir los 2, la orden queda CERRADA.
* **Cerrar con faltante (HU-53)**: el **PLANIFICADOR** hace `POST /api/v1/ordenes-reabastecimiento/{id}/cerrar` con `{"motivo": "..."}`. Se liberan el `entrante` pendiente de la Bodega y la reserva que quedara en el CD.

## Qué cuadra en cada paso (sección 2.5 del plan)

Para una orden de S unidades, con ΣD despachado y ΣR recibido:

| Invariante | Dónde se ve |
| :--- | :--- |
| Pendiente = S − ΣR | `cantidadPendiente` de la orden |
| `entrante` de la Bodega = S − ΣR (salvo lo liberado al cerrar con faltante) | Inventario de la Bodega |
| Reserva en el CD (`saliente`) = max(S − ΣD, 0) | Inventario del CD |
| ΣD = ΣR + Σ discrepancia | Ciclos y recepciones de la orden |

La prueba `CicloAbastecimientoTest` comprueba estos invariantes después de cada paso, en un recorrido con despacho parcial, pérdida en tránsito y reapertura.
