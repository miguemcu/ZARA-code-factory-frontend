# Contrato de la API para el frontend de la demo (Sprint 3)

Este documento es para quien programa el frontend (`ZARA-code-factory-frontend`, React 19 + Vite + Tailwind 4). Cubre lo que necesita la demo del ciclo de abastecimiento (los pasos del [guion](guion-review-sprint3.md)) y lo transversal.

**De dónde sale.** El código de `develop` (`0b62743`) y un stack real levantado con `docker compose up --build`. Los datos se sembraron con `tools/demo/sembrar_demo.py` y después se recorrió el ciclo completo por HTTP, con un usuario por rol. Cada JSON de este documento es una respuesta capturada en ese recorrido el 22 de noviembre de 2026 (hora del servidor en UTC: 23 nov, 00:37 a 00:38). Las respuestas completas están en [`mock-data/`](mock-data/README.md), con los mismos ids. Lo que no se pudo comprobar está marcado **NO VERIFICADO**.

**Swagger manda sobre este documento** cuando dicen lo mismo con otras palabras. Cuando dicen cosas distintas, este documento describe lo que hace el código; las diferencias están en la sección 15.

Contenido:

1. [Base URL, versión, CORS y Swagger](#1-base-url-versión-cors-y-swagger)
2. [Autenticación](#2-autenticación)
3. [Roles, scopes y qué ve cada uno](#3-roles-scopes-y-qué-ve-cada-uno)
4. [Formato de error](#4-formato-de-error)
5. [Paginación](#5-paginación)
6. [Máquinas de estado](#6-máquinas-de-estado)
7. [Enums](#7-enums)
8. [Magnitudes de inventario e invariantes](#8-magnitudes-de-inventario-e-invariantes)
9. [Fechas y reglas de tiempo](#9-fechas-y-reglas-de-tiempo)
10. [Efectos encadenados por eventos](#10-efectos-encadenados-por-eventos)
11. [Endpoints del ciclo, uno por uno](#11-endpoints-del-ciclo-uno-por-uno)
12. [Recorrido de la demo, llamada por llamada](#12-recorrido-de-la-demo-llamada-por-llamada)
13. [Lookups: de dónde sacar tiendas, CD, variantes y nodos](#13-lookups-de-dónde-sacar-tiendas-cd-variantes-y-nodos)
14. [Huecos del contrato](#14-huecos-del-contrato)
15. [Diferencias entre la documentación y el código](#15-diferencias-entre-la-documentación-y-el-código)

---

## 1. Base URL, versión, CORS y Swagger

| Qué | Valor |
| :--- | :--- |
| Base local | `http://localhost:8080` (puerto `API_PORT` del `.env`; por defecto 8080) |
| Prefijo de la API | `/api/v1` en todas las rutas de negocio. Ninguna otra versión existe |
| Producción | `https://supplychain-api-dzmc.onrender.com`. El PR #68 (`develop` → `main`, Sprint 3) se mergeó el 22 nov. **NO VERIFICADO** que Render ya sirva el Sprint 3: desde aquí no respondió en 90 s |
| Swagger UI | `GET /swagger-ui.html` (público) |
| OpenAPI | `GET /v3/api-docs` (público, OpenAPI 3.1). Hoy: 77 rutas y 113 operaciones |
| Salud | `GET /actuator/health` (público) → `{"groups":["liveness","readiness"],"status":"UP"}` |
| Formato | Solo JSON. Enviar `Content-Type: application/json` en todo POST o PUT con cuerpo |

**CORS.** Los orígenes permitidos salen de la variable `CORS_ALLOWED_ORIGINS` (lista separada por comas). Si no se define, el único origen permitido es **`http://localhost:8443`**, que coincide con el puerto del `vite.config.ts` del frontend. El `docker-compose.yml` no pasa esa variable, así que con el stack de Docker solo funciona el 8443. Preflight capturado:

| Origen | Respuesta |
| :--- | :--- |
| `http://localhost:8443` | `200` con `Access-Control-Allow-Origin: http://localhost:8443`, `Allow-Credentials: true`, `Allow-Methods: GET,POST,PUT,DELETE,OPTIONS`, `Expose-Headers: Location`, `Max-Age: 3600` |
| `http://localhost:5173` (puerto por defecto de Vite) | `403` con cuerpo de texto `Invalid CORS request` |

Cabeceras de request permitidas: `Authorization`, `Content-Type`, `Accept`. Cualquier otra cabecera personalizada hace fallar el preflight. No hay `PATCH`.

En producción el origen del frontend desplegado tiene que estar en `CORS_ALLOWED_ORIGINS` de Render. **NO VERIFICADO** cuál es hoy.

---

## 2. Autenticación

### 2.1 Flujo

```
POST /auth/login {email, password}
 ├─ mfaRequerido=false → accessToken + cookie refresh_token  → app
 └─ mfaRequerido=true  → mfaChallengeToken (5 min)
        POST /auth/login/mfa {mfaChallengeToken, codigo} → accessToken + cookie → app
```

| Endpoint | Cuerpo | Éxito | Errores |
| :--- | :--- | :--- | :--- |
| `POST /api/v1/auth/login` | `{"email", "password"}` | `200` `LoginResponse` | `400` validación; `401` `"Credenciales inválidas"` (también para usuario inactivo y cuenta bloqueada, a propósito) |
| `POST /api/v1/auth/login/mfa` | `{"mfaChallengeToken", "codigo"}` (TOTP de 6 dígitos o código de respaldo de 10) | `200` `LoginResponse` | `400` `"El código ingresado no es válido"`; `401` `"Sesión inválida o expirada"` (desafío vencido o inválido) |
| `POST /api/v1/auth/refresh` | sin cuerpo; usa la cookie | `200` `{"accessToken"}` y cookie nueva | `401` `"Sesión inválida o expirada"` (sin cookie, vencida, revocada o **reusada**) |
| `POST /api/v1/auth/logout` | sin cuerpo; usa la cookie | `204` siempre | — |
| `POST /api/v1/mfa/activar` | sin cuerpo; con Bearer | `200` `{"secreto", "qrCodeDataUri"}` | `400` si MFA ya está activo |
| `POST /api/v1/mfa/confirmar` | `{"codigo"}` | `200` `{"codigosRespaldo": [8 códigos]}` (solo se muestran esta vez) | `400` `"El código ingresado no es válido"` |

Respuesta de login capturada (token reemplazado):

```json
{"mfaRequerido": false, "mfaChallengeToken": null, "accessToken": "<ACCESS_TOKEN>",
 "usuario": {"id": "76b6faf5-7844-41b9-8943-c05a65fdc3fa", "email": "vendedor@demo.local",
             "nombreCompleto": "Demo Vendedor", "estado": "ACTIVO", "creadoEn": "2026-11-23T00:37:45.108142Z"}}
```

Con MFA: `{"mfaRequerido": true, "mfaChallengeToken": "<MFA_CHALLENGE_TOKEN>", "accessToken": null, "usuario": null}`.

### 2.2 Tokens y cookie

* **Access token:** JWT HS512 de **15 minutos** (`exp − iat = 900` en el token capturado). Va en `Authorization: Bearer <token>`. Sus claims son solo `sub` (id del usuario), `email`, `typ`, `iat` y `exp`: **no trae roles, scopes ni tiendas** (ver sección 3.3).
* **Refresh token:** cookie `refresh_token` de 7 días, capturada así: `Path=/api/v1/auth; Max-Age=604799; Secure; HttpOnly; SameSite=None`. El frontend no la lee ni la guarda: la maneja el navegador.
* **Qué necesita el front:** `fetch(url, { credentials: 'include' })` en `/auth/login`, `/auth/login/mfa`, `/auth/refresh` y `/auth/logout`, para que el navegador guarde y mande la cookie. El cliente actual (`src/api.ts`) ya lo hace en todas las llamadas.
* **Rotación:** cada `/auth/refresh` revoca la cookie usada y entrega otra. Presentar una cookie ya rotada responde `401` y **revoca toda la familia de sesiones** (capturado: el segundo refresh con la misma cookie dio `401`). Consecuencia: no lanzar dos refresh en paralelo; si varias peticiones reciben `401` a la vez, deben esperar un único refresh compartido.
* **Logout:** revoca el refresh y borra la cookie. El access token sigue sirviendo hasta que vence; el front debe olvidarlo.
* **Bloqueo progresivo:** tras 3, 5, 7 y 10 intentos fallidos, la cuenta queda bloqueada 1, 5, 15 y 60 minutos, y el login responde `401` aunque la contraseña sea correcta (según Swagger; **NO VERIFICADO** en el recorrido para no bloquear a los usuarios de demo). Un código MFA incorrecto también cuenta.
* **Cookie `Secure` en `http://localhost`:** el refresh por cookie se probó mandando la cabecera `Cookie` a mano. **NO VERIFICADO** en un navegador real. Chrome y Firefox aceptan cookies `Secure` en `http://localhost`; front (8443) y API (8080) son el mismo sitio (`localhost`), así que `SameSite=None` no estorba.

### 2.3 Cómo manejar el 401

Todo endpoint protegido sin token, con token inválido o vencido, o con un usuario que dejó de estar `ACTIVO` responde:

```
401  WWW-Authenticate: Bearer
{"mensaje": "Se requiere autenticación"}
```

Regla para el cliente:

1. Ante un `401` de un endpoint que no sea de `/auth/`, llamar **una vez** a `POST /auth/refresh` (con `credentials: 'include'`).
2. Si responde `200`, guardar el nuevo `accessToken` y repetir la petición original una sola vez.
3. Si responde `401`, limpiar el estado y mandar al login con el mensaje "Tu sesión terminó. Inicia sesión de nuevo".
4. Un `401` de `/auth/login` o `/auth/login/mfa` no dispara refresh: es un error de credenciales o de desafío.

`403` no es un problema de sesión: es falta de scope y no se arregla refrescando (sección 4).

---

## 3. Roles, scopes y qué ve cada uno

La API autoriza **por scope**. Los roles solo agrupan scopes. Hay además una **restricción por tienda**: los roles de tienda operan solo en las tiendas que tienen asignadas (o en todas si tienen `tiendas:operar-todas`, que solo tiene ADMIN). Un recurso de otra tienda responde `404`, como si no existiera (con una excepción en ventas, ver 11.1).

### 3.1 Scopes de los 7 roles sembrados (leídos de `GET /roles/{id}/scopes` en el stack)

| Rol | Scopes | ¿Restringido por tienda? |
| :--- | :--- | :--- |
| ADMIN | los 19: todos los de abajo más `catalogo:administrar`, `cd:administrar`, `tiendas:administrar`, `tiendas:operar-todas`, `usuarios:administrar`, `roles:administrar`, `scopes:administrar` | No (`tiendas:operar-todas`) |
| VENDEDOR | `ventas:registrar`, `ventas:consultar`, `ventas:forzar-sin-stock`, `inventario:consultar` | Sí |
| SUPERVISOR_TIENDA | los del vendedor más `ventas:anular`, `inventario:administrar` | Sí |
| PLANIFICADOR_ABASTECIMIENTO | `reposicion:planificar`, `reposicion:administrar`, `inventario:consultar` | Sí |
| OPERADOR_CD | `despacho:operar`, `inventario-cd:administrar`, `inventario:consultar` | Ve todos los CD; no tiene tiendas |
| COORDINADOR_TRANSPORTE | `transporte:operar`, `inventario:consultar` | No filtra viajes ni ciclos por tienda; no ve inventario de tiendas ni de CD (ver 14) |
| ENCARGADO_BODEGA | `recepcion:registrar`, `inventario:consultar` | Sí |

El sembrador asigna las tiendas Centro y Norte a VENDEDOR, SUPERVISOR_TIENDA, PLANIFICADOR_ABASTECIMIENTO y ENCARGADO_BODEGA. OPERADOR_CD y COORDINADOR_TRANSPORTE quedan sin tiendas.

### 3.2 Endpoints del ciclo que puede usar cada rol (comprobado con 403 y 200 reales)

| Endpoint | Scope | VEND | SUP | PLAN | OPER | COORD | ENC | ADMIN |
| :--- | :--- | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `POST /ventas`, `GET /ventas` | `ventas:registrar` / `ventas:consultar` | ✓ | ✓ | – | – | – | – | ✓ |
| `GET /nodos/{nodoId}/inventario`, `/movimientos`, `GET /variantes/{id}/inventario` | `inventario:consultar` (+ alcance) | ✓ tiendas | ✓ tiendas | ✓ tiendas | ✓ CD | vacío* | ✓ tiendas | ✓ |
| `POST /nodos/{nodoId}/inventario/ajustes` | `inventario:administrar` (tienda) o `inventario-cd:administrar` (CD) | – | ✓ tiendas | – | ✓ CD | – | – | ✓ |
| `GET /recomendaciones`, `/{id}`, `POST /evaluar`, `/aprobar`, `/rechazar` | `reposicion:planificar` | – (403) | – | ✓ | – | – | – | ✓ |
| `GET /ordenes-reabastecimiento`, `/{id}`, `POST /cerrar`, `/cancelar` | `reposicion:planificar` | – | – | ✓ | – (403) | – | – | ✓ |
| `GET /tiendas/{id}/traspasos-internos` | `reposicion:administrar` | – | – | ✓ | – | – | – | ✓ |
| `POST /ordenes-reabastecimiento/{id}/despachos` | `despacho:operar` | – | – | – | ✓ | – | – (403) | ✓ |
| `GET /ciclos-despacho`, `/{id}` | `despacho:operar` o `transporte:operar` | – | – | – | ✓ | ✓ | – | ✓ |
| `POST /viajes`, `GET /viajes`, `/{id}`, `POST /salida`, `/llegada` | `transporte:operar` | – | – | – | – (403) | ✓ | – | ✓ |
| `GET /paradas-por-recibir`, `POST .../recepcion` | `recepcion:registrar` | – | – | – | – | – (403) | ✓ | ✓ |

\* El coordinador tiene `inventario:consultar`, pero sin tiendas asignadas y sin ser de CD su consulta de stock de una variante sale vacía (`[]`, capturado).

### 3.3 Cómo sabe el front qué menú mostrar

**No hay un endpoint que diga qué scopes o tiendas tiene el usuario autenticado** (no existe `/me`, el JWT no los trae y `GET /usuarios/{id}/roles` y `/tiendas` exigen `usuarios:administrar`). Opciones, de menor a mayor esfuerzo:

1. **Para la demo:** un selector de rol (sección del brief) que define el menú en el front con la tabla 3.2, más el usuario de demo de ese rol. Si el usuario pulsa algo que no puede hacer, la API responde `403` y se muestra.
2. Probar endpoints al entrar (por ejemplo `GET /recomendaciones?size=1` → 200 o 403) para inferir el rol. Funciona, pero suma llamadas.
3. Pedir al backend un `GET /api/v1/auth/yo` con scopes y tiendas. No existe hoy; sería una HU nueva (ver 14).

---

## 4. Formato de error

### 4.1 Lo normal: `ErrorResponse`

Casi todos los errores (los que lanza el dominio, la validación de Bean Validation, la seguridad) traen un único campo:

```json
{"mensaje": "La cantidad recibida (20) supera la despachada (19)"}
```

El `mensaje` está en español y es para la persona usuaria. Ejemplos reales por código:

| Código | Cuándo | Ejemplo capturado |
| :--- | :--- | :--- |
| 400 | Validación del cuerpo | `{"mensaje": "paradas: must not be empty"}` · `{"mensaje": "cantidadAprobada: La cantidad aprobada debe ser mayor que cero"}` |
| 400 | JSON ilegible o tipo equivocado (incluye fecha mal formada) | `{"mensaje": "El cuerpo de la solicitud no es un JSON válido para esta operación"}` |
| 400 | Regla de negocio del request | `{"mensaje": "La hora de salida no puede ser posterior a la actual"}` |
| 401 | Sin sesión | `{"mensaje": "Se requiere autenticación"}` |
| 403 | Falta el scope | `{"mensaje": "No tiene permisos para realizar esta acción"}` |
| 404 | No existe o está fuera de alcance | `{"mensaje": "No existe una orden de reabastecimiento con id 2e3d0e2d-…"}` |
| 409 | Estado del recurso | `{"mensaje": "No se puede aprobar la recomendación c2280d0d-…: está en estado APROBADA"}` |
| 409 | Concurrencia agotada | `{"mensaje": "Otra operación modificó el mismo registro; intente de nuevo"}` (según el código; **NO VERIFICADO** en el recorrido) |
| 422 | Regla sobre un recurso válido | `{"mensaje": "El ciclo de despacho 36a64773-… no sale del CD 37918b02-…"}` |

Los mensajes de validación mezclan idiomas: los que traen texto propio salen en español y los genéricos de Bean Validation salen en inglés (`must not be empty`, `must not be blank`, `must be greater than 0`). Vienen como `campo: mensaje; campo: mensaje`.

### 4.2 Lo que **no** trae `mensaje`

Estos casos responden con el cuerpo por defecto de Spring, sin `mensaje`:

```json
{"timestamp": "2026-11-23T00:38:10.588Z", "status": 400, "error": "Bad Request",
 "path": "/api/v1/ordenes-reabastecimiento/no-es-uuid"}
```

| Caso | Código |
| :--- | :--- |
| UUID mal formado en la ruta o en un query param (`/ordenes-reabastecimiento/no-es-uuid`, `?ordenId=x`) | 400 |
| Enum inválido en un query param (`?estado=FOO`) | 400 |
| Ruta inexistente | 404 |
| Método no soportado (`DELETE /ventas`) | 405 |
| `sort` por un campo inexistente (`/tiendas?sort=noexiste,asc`) | **500** (bug, ver 14) |
| Preflight CORS rechazado | 403 con texto plano `Invalid CORS request` |

### 4.3 Cómo mostrarlo

```ts
const texto = body?.mensaje ?? MENSAJE_POR_CODIGO[status] ?? 'Ocurrió un error inesperado';
```

Con `MENSAJE_POR_CODIGO` como respaldo: 400 "Revisa los datos e intenta de nuevo", 403 "Tu rol no permite esta acción", 404 "No encontramos lo que buscas", 409 "El estado cambió; actualiza la pantalla", 422 "La operación no se puede hacer así", 500 "Error del servidor". Para 409 y 422 conviene mostrar el `mensaje` tal cual y **recargar el recurso**, porque el estado en pantalla está desactualizado. Si el mensaje trae un UUID, el front puede reemplazarlo por el nombre que ya tenga en memoria.

---

## 5. Paginación

Parámetros (Spring Data): `page` (desde 0, por defecto 0), `size` (por defecto 20, **máximo 100**: un valor mayor se reduce a 100 sin error, capturado con `size=500`), `sort=campo,asc|desc` (se puede repetir).

Forma exacta (capturada en `GET /nodos/{nodoId}/inventario`):

```json
{"content": [ … ],
 "empty": false, "first": true, "last": true, "number": 0, "numberOfElements": 2,
 "pageable": {"offset": 0, "pageNumber": 0, "pageSize": 20, "paged": true,
              "sort": {"empty": true, "sorted": false, "unsorted": true}, "unpaged": false},
 "size": 20, "sort": {"empty": true, "sorted": false, "unsorted": true},
 "totalElements": 2, "totalPages": 1}
```

* Para la paginación basta con `content`, `number`, `size`, `totalElements` y `totalPages`.
* Una página fuera de rango responde `200` con `content: []` y `first: false`.
* Un `sort` por un campo que no existe responde **500**. El front solo debe mandar `sort` por campos que sabe que existen, o no mandarlo.
* En `GET /ciclos-despacho` el `sort` no aplica (siempre del más reciente al más antiguo).

**No paginados** (responden un arreglo JSON): `GET /paradas-por-recibir`, `GET /variantes/{id}/inventario`, `GET /tiendas/{id}/traspasos-internos`, `GET /tiendas/{id}/prioridad-cd`, `GET /roles`, `GET /roles/{id}/scopes`, `GET /usuarios`, `GET /usuarios/{id}/roles`, `GET /usuarios/{id}/tiendas`.

---

## 6. Máquinas de estado

### 6.1 Recomendación

```
            aprobar (planificador)
BORRADOR ─────────────────────────▶ APROBADA   (crea la orden en la misma llamada)
    │
    └──── rechazar ─────────────────▶ RECHAZADA (no crea orden; se conserva)
```

Aprobar o rechazar algo que no está en BORRADOR → `409`. Nace sola (ver 10) o con `POST /recomendaciones/evaluar`.

### 6.2 Orden de reabastecimiento

```
                         ┌──────────── cancelar ──────────▶ CANCELADA
               sin CD    │
aprobar ──▶ GENERADA ────┘   (reintento de asignación: HU-52, NO existe en el código)
   │
   └─ con CD ─▶ APROBADA ─despachar─▶ DESPACHADA ─salida del viaje─▶ EN_TRANSITO
                    ▲                                                  │ recepción
                    │                                   ┌──────────────┴───────────────┐
                    │                              pendiente = 0                pendiente > 0
                    │                                   ▼                              ▼
                    └──────── despachar (ciclo 2) ── REABIERTA                     CERRADA
                                                        │
                                                        └── cerrar con faltante ──▶ CERRADA
```

| Transición | Endpoint | Rol |
| :--- | :--- | :--- |
| (nace) APROBADA o GENERADA | `POST /recomendaciones/{id}/aprobar` | PLANIFICADOR |
| APROBADA o REABIERTA → DESPACHADA | `POST /ordenes-reabastecimiento/{id}/despachos` | OPERADOR_CD |
| DESPACHADA → EN_TRANSITO | `POST /viajes/{id}/salida` | COORDINADOR |
| EN_TRANSITO → CERRADA o REABIERTA | `POST /viajes/{v}/paradas/{p}/recepcion` | ENCARGADO_BODEGA |
| REABIERTA → CERRADA (con faltante) | `POST /ordenes-reabastecimiento/{id}/cerrar` | PLANIFICADOR |
| GENERADA → CANCELADA | `POST /ordenes-reabastecimiento/{id}/cancelar` | PLANIFICADOR |

`EN_DESPACHO`, `RECIBIDA_TOTAL` y `RECIBIDA_PARCIAL` existen en el enum pero son pasos dentro de la misma transacción: **nunca aparecen en una respuesta**. El front debe aceptarlos (por si acaso) pero no diseñar pantallas para ellos. La llegada de una parada no cambia el estado de la orden: sigue EN_TRANSITO hasta la recepción.

Una CERRADA puede ser "completa" o "con faltante": se distinguen por `motivoCierre` (null o con texto) y `cantidadPendiente` (0 o mayor que 0). Capturado: orden C cerrada con faltante → `estado: CERRADA`, `cantidadPendiente: 3`, `motivoCierre: "Se acepta la pérdida de 3 unidades en tránsito"`, `cerradaPor`, `fechaCierre`.

### 6.3 Intentos de CD (dentro de la orden)

Al aprobar se recorren los CD de la tienda por prioridad. Cada CD evaluado queda en `intentos[]`:

* `SIN_STOCK`: su `disponible` no cubre toda la cantidad. `motivo` explica, por ejemplo `"Disponible 3 menor que lo requerido 19"`.
* `ASIGNADO`: el primero que cubre toda la cantidad. `motivo: null`. La orden queda con `cdAsignadoId` y `motivoAsignacion: "Asignado al CD de prioridad 2"`.
* Si ninguno alcanza, todos quedan `SIN_STOCK`, `cdAsignadoId: null`, `motivoAsignacion: "Ningún CD cubre la cantidad solicitada"` y la orden en GENERADA.

No se asigna parcial: un CD cubre todo o se descarta. Los intentos traen solo `cdId` (ni nombre ni ubicación; ver 14).

### 6.4 Ciclo de despacho

Cada despacho crea un ciclo con `numeroCiclo` 1, 2, …. Sale `min(pendiente de la orden, a la mano real del CD)`:

* `COMPLETO`: salió todo lo solicitado del ciclo. `fillRate: 1.0`.
* `PARCIAL`: salió menos. `fillRate = despachado / solicitado` con 4 decimales (capturado: 10 de 19 → `0.5263`).

Una orden tiene a lo sumo un ciclo activo. Un ciclo `PARCIAL` deja la orden en DESPACHADA, no en REABIERTA: lo no despachado se resuelve al recibir (pendiente = solicitado − recibido).

### 6.5 Viaje y parada

```
Viaje:  ARMADO ──salida──▶ EN_CURSO ──llegada de la última parada──▶ CERRADO
Parada: PENDIENTE ──salida del viaje──▶ EN_TRANSITO ──llegada──▶ ENTREGADO ──recepción──▶ (sigue ENTREGADO)
```

La recepción no cambia el estado de la parada; la parada sale de `GET /paradas-por-recibir` cuando ya tiene recepción. El viaje se cierra con la llegada más tardía como `fechaCierre`.

---

## 7. Enums

Valores tomados del código (`domain/model`) y confirmados en `/v3/api-docs` cuando aparecen allí.

| Enum | Valores | Dónde aparece |
| :--- | :--- | :--- |
| Estado de recomendación | `BORRADOR`, `APROBADA`, `RECHAZADA` | `estado` de recomendación; filtro `?estado=` |
| Estado de orden | `GENERADA`, `APROBADA`, `EN_DESPACHO`, `DESPACHADA`, `EN_TRANSITO`, `RECIBIDA_TOTAL`, `RECIBIDA_PARCIAL`, `REABIERTA`, `CERRADA`, `CANCELADA` | `estado` de orden; filtro `?estado=`; `estadoOrden` de la recepción |
| Resultado del intento de CD | `SIN_STOCK`, `ASIGNADO` | `intentos[].resultado` |
| Resultado del ciclo | `COMPLETO`, `PARCIAL` | `resultado` del ciclo de despacho |
| Estado del viaje | `ARMADO`, `EN_CURSO`, `CERRADO` | `estado` del viaje; filtro `?estado=` |
| Estado de la parada | `PENDIENTE`, `EN_TRANSITO`, `ENTREGADO` | `paradas[].estado` |
| Tipo de nodo | `CD`, `BODEGA_TIENDA`, `ALMACEN` | `nodo.tipo` de `GET /centros-distribucion/{id}` |
| Tipo de movimiento del kardex | `CARGA_INICIAL`, `AJUSTE`, `VENTA`, `ANULACION_VENTA`, `TRASPASO_SALIDA`, `TRASPASO_ENTRADA`, `DESPACHO`, `RECEPCION` | `tipo` del kardex; filtro `?tipo=` |
| Motivo de ajuste | `CONTEO_FISICO`, `INGRESO_MANUAL`, `MERMA`, `CORRECCION` (exige `comentario`) | cuerpo de `POST .../ajustes` |
| Origen del traspaso | `AUTOMATICO`, `MANUAL` | traspasos internos |
| Estado de la venta | `REGISTRADA`, `ANULADA` | `lineas[].estado`; filtro `?estado=` |
| Estado de tienda | `ACTIVA`, `INACTIVA` | tiendas |
| Estado de usuario | `ACTIVO`, `BLOQUEADO`, `INACTIVO` | `usuario.estado` del login |

`canal` de la venta **no es un enum**: es texto libre de hasta 30 caracteres. Si no se envía, vale `"FISICO"` (capturado).

---

## 8. Magnitudes de inventario e invariantes

### 8.1 Las cinco magnitudes

Las devuelve `StockResponse` en `GET /nodos/{nodoId}/inventario` y `GET /variantes/{varianteId}/inventario`:

```json
{"nodoId": "0fe4ef24-…", "varianteId": "ce457d78-…", "sku": "DEMO-S3-AZ-M",
 "aLaMano": 1, "disponibleParaUso": 1, "entrante": 19, "saliente": 0, "pronosticado": 20}
```

| Campo JSON | Nombre de negocio | Significado | Quién la mueve |
| :--- | :--- | :--- | :--- |
| `aLaMano` | A la mano | Unidades físicas en el nodo | Venta, traspaso, ajuste, despacho (CD), recepción (Bodega) |
| `saliente` | Saliente | Reservado para órdenes aprobadas que aún no salen (solo CD) | Sube al aprobar una orden con CD; baja al despachar o al cerrar con faltante |
| `entrante` | Entrante | Pedido al CD y todavía no recibido (solo Bodega) | Sube al aprobar; baja al recibir o al cerrar con faltante |
| `disponibleParaUso` | Disponible | `aLaMano − saliente`. Lo que el CD puede comprometer en una orden nueva | Calculado |
| `pronosticado` | Pronosticado | `aLaMano + entrante − saliente`. Lo que habrá cuando todo llegue | Calculado; es lo que compara la recomendación con el nivel mínimo |

En Almacén solo cambian `aLaMano` (y `disponibleParaUso` y `pronosticado`, iguales a él). `disponibleParaUso` y `pronosticado` **pueden ser negativos** en un CD: capturado tras la merma del recorrido parcial (`aLaMano 10`, `saliente 19`, `disponibleParaUso −9`). El front debe mostrar el negativo, no recortarlo a 0.

`BodegaTiendaResponse` (`GET /bodegas-tienda/...`) trae solo `aLaMano` y `disponibleParaUso` por variante. Para la demo conviene usar `GET /nodos/{bodegaId}/inventario`, que trae las cinco.

### 8.2 Qué cambia en cada paso (valores reales del recorrido)

Variante AZ-M, tienda Centro, orden A de 19 (caso feliz):

| Momento | CD Principal (`aLaMano` / `saliente` / `disponible`) | Bodega Centro (`aLaMano` / `entrante` / `pronosticado`) | Almacén Centro (`aLaMano`) |
| :--- | :--- | :--- | :--- |
| Inicial | 200 / 0 / 200 | 6 / 0 / 6 | 2 |
| Tras la venta de 1 | igual | **1** / 0 / 1 (traspaso de 5 al Almacén) | **6** |
| Tras aprobar 19 (y los 15 de la orden de Norte) | 200 / **34** / 166 | 1 / **19** / 20 | 6 |
| Tras despachar los 19 de Centro | **181** / 15 / 166 (los 15 son la reserva de Norte) | 1 / 19 / 20 | 6 |
| Tras recibir 19 | igual | **20** / **0** / 20 | 6 |

Variante BL-L, tienda Centro, orden B de 19 (caso parcial con reapertura):

| Momento | CD Principal (`aLaMano` / `saliente` / `disponible`) | Bodega Centro (`aLaMano` / `entrante`) | Orden B |
| :--- | :--- | :--- | :--- |
| Tras aprobar 19 | 200 / 19 / 181 | 1 / 19 | APROBADA, pendiente 19 |
| Merma de 190 en el CD (ADMIN) | 10 / 19 / **−9** | 1 / 19 | — |
| Despacho ciclo 1: 10 de 19 (PARCIAL, 0.5263) | 0 / 9 / −9 | 1 / 19 | DESPACHADA, despachado 10 |
| Recepción: 8 de 10 (discrepancia 2) | 0 / 9 / −9 | **9** / **11** | **REABIERTA**, pendiente 11 |
| Ingreso de 50 en el CD (ADMIN; el ajuste respondió `aLaMano 50`) | 50 / 9 / 41 (calculado, sin foto) | 9 / 11 | — |
| Despacho ciclo 2: 11 (COMPLETO) | **39** / **0** / 39 | 9 / 11 | DESPACHADA, despachado acumulado 21 |
| Recepción: 11 de 11 | 39 / 0 | **20** / **0** | **CERRADA**, pendiente 0 |

Variante AZ-M, tienda Norte, orden C aprobada en 15 (editada): recibe 12 de 15 → Bodega Norte `aLaMano 13`, `entrante 3`, orden REABIERTA con 3 → cerrar con faltante → `entrante 0`, orden CERRADA con `cantidadPendiente 3`.

### 8.3 Invariantes que el front puede mostrar (sección 2.5 del plan)

Para una orden de S unidades (`cantidadTotalSolicitada`), con ΣD despachado (`cantidadDespachadaAcumulada`) y ΣR recibido:

| Invariante | Cómo calcularlo con lo que devuelve la API | Valores de la orden B al cerrar |
| :--- | :--- | :--- |
| Pendiente = S − ΣR | `cantidadPendiente` de la orden | 19 − 19 = 0 |
| `entrante` de la Bodega = S − ΣR − lo liberado | `entrante` del stock de la Bodega para esa variante (si solo hay una orden viva de esa variante) | 0 |
| Reserva viva en el CD = max(S − ΣD, 0) | `saliente` del CD (si solo hay una orden viva de esa variante en ese CD) | max(19 − 21, 0) = 0 |
| ΣD = ΣR + Σdiscrepancia | Σ`cantidadDespachada` de los ciclos = Σ`cantidadRecibida` + Σ`discrepancia` de las recepciones | 21 = 19 + 2 |

Notas para mostrarlas:

* ΣR no viene en la orden: se obtiene como `S − cantidadPendiente`.
* El `entrante` y el `saliente` del inventario son la suma de **todas** las órdenes vivas de esa variante en ese nodo. Para la demo coincide con una sola orden porque cada tienda y variante tiene una.
* Despachar de nuevo lo perdido tras una reapertura descuenta `aLaMano` del CD pero no `saliente` (la reserva ya se consumió). Por eso ΣD (21) puede superar S (19).
* Las recepciones no tienen un endpoint de consulta; solo se ven en la respuesta del `POST .../recepcion` (ver 14).

---

## 9. Fechas y reglas de tiempo

* **Formato:** ISO-8601 con zona. La API responde siempre en **UTC** con sufijo `Z` y hasta 9 decimales de segundo (`"2026-11-23T00:38:05.456093071Z"`); la misma fecha leída después puede volver con 6 decimales (`"…05.456093Z"`). El front debe parsear con `new Date()` y no comparar cadenas.
* **Presentación:** convertir a la hora local (Colombia, UTC−5) en el front. La API no conoce la zona del usuario.
* **Enviar fechas:** con zona explícita, por ejemplo `new Date().toISOString()` (`…Z`) o `2026-11-22T19:30:00-05:00`. Un formato que no sea ISO (`"22/11/2026 10:00"`) responde `400` con el mensaje genérico de JSON inválido.
* **`fechaSalida` (salida del viaje) y `fechaLlegada` (llegada a una parada)** son opcionales; sin ellas el servidor usa su hora.

| Regla | Código | Mensaje capturado |
| :--- | :--- | :--- |
| Hora futura (más de 2 minutos de tolerancia sobre el reloj del servidor) | 400 | `"La hora de salida no puede ser posterior a la actual"` · `"La hora de llegada no puede ser posterior a la actual"` |
| Salida anterior al despacho de alguno de sus ciclos | 422 | `"La salida no puede ser anterior al despacho de sus ciclos (2026-11-23T00:38:04.471774Z)"` |
| Llegada anterior a la salida del viaje | 422 | `"La llegada no puede ser anterior a la salida del viaje (2026-11-23T00:38:05.456093Z)"` |

El mensaje del 422 trae la fecha límite en UTC; el front puede extraerla y mostrarla en hora local. Para un selector de fecha y hora: máximo = ahora, mínimo = `fechaDespacho` más reciente de los ciclos del viaje (salida) o `fechaSalida` del viaje (llegada).

Filtros de fecha en listados (`desde`, `hasta` de ventas y kardex): `date-time` ISO-8601, inclusive.

---

## 10. Efectos encadenados por eventos

Los listeners corren en el mismo hilo **después del commit y antes de responder al cliente**. Consecuencia práctica, comprobada en el recorrido: cuando el `POST` responde, sus efectos encadenados ya están en la base. **No hace falta polling**; basta con volver a pedir los datos después de la respuesta.

| Acción | Efecto que aparece solo | Qué refrescar |
| :--- | :--- | :--- |
| Venta que deja el Almacén bajo su mínimo (3) | Traspaso automático Bodega → Almacén hasta el objetivo (6). Kardex `VENTA` y `TRASPASO_ENTRADA` en el Almacén, `TRASPASO_SALIDA` en la Bodega | Inventario de Almacén y Bodega; traspasos de la tienda |
| …y ese traspaso deja la Bodega con `pronosticado` bajo el mínimo del nivel al CD (5) | Recomendación **BORRADOR** con `cantidadSugerida = objetivo − pronosticado` (20 − 1 = 19) y `cdSugeridoId` = primer CD de la prioridad | Lista de recomendaciones |
| Aprobar con una cantidad que deja el `pronosticado` aún bajo el mínimo | Otra recomendación BORRADOR para la misma tienda y variante. Capturado: aprobar 2 en Norte BL-L dejó `pronosticado 3` y nació una BORRADOR de 17 | Lista de recomendaciones |
| Aprobar | Orden creada (viene en la respuesta); `saliente` del CD y `entrante` de la Bodega suben | Detalle de orden, inventario del CD y de la Bodega |
| Despachar | `aLaMano` y `saliente` del CD bajan; kardex `DESPACHO`; orden DESPACHADA; el ciclo aparece en `GET /ciclos-despacho?sinViaje=true` | Órdenes, ciclos pendientes de viaje, inventario del CD |
| Salida del viaje | Paradas EN_TRANSITO y órdenes EN_TRANSITO | Detalle de orden |
| Llegada a una parada | La parada aparece en `GET /paradas-por-recibir` del encargado de esa tienda; con la última, el viaje queda CERRADO | Paradas por recibir |
| Recepción | `aLaMano` sube y `entrante` baja en la Bodega; kardex `RECEPCION` (solo por lo recibido; la discrepancia no deja kardex); orden CERRADA o REABIERTA | Inventario de la Bodega, detalle de orden, paradas por recibir |
| Cerrar con faltante | Se libera el `entrante` pendiente de la Bodega y la reserva que quede en el CD | Inventario de Bodega y CD |

Lo que **no** pasa solo: después de una recepción o de cerrar una orden **no** nace otra recomendación aunque el `pronosticado` siga bajo (comprobado: ninguna BORRADOR nueva tras las recepciones del recorrido). Crear un nivel de reposición tampoco evalúa nada (D-57): hay que esperar una venta o pulsar Evaluar.

Si un listener falla, la operación de origen igual queda confirmada (D-17) y el cliente no se entera. En la demo, si la recomendación no aparece tras la venta, el planificador puede usar `POST /recomendaciones/evaluar`.

---

## 11. Endpoints del ciclo, uno por uno

Convenciones: todas las rutas llevan el prefijo `/api/v1`. "Alcance por tienda" significa que el recurso de una tienda no asignada responde `404`. Los `401` (sin sesión) y `403` (sin scope) aplican a todos y solo se repiten cuando dicen algo especial. Los ejemplos completos están en el archivo de `mock-data/` indicado.

### 11.1 Registrar venta · `POST /ventas`

* **Scope:** `ventas:registrar` (y `ventas:forzar-sin-stock` si `forzarSinStock: true`). **Roles:** VENDEDOR, SUPERVISOR_TIENDA, ADMIN. **Alcance por tienda:** sí, pero responde **403** (no 404).
* **Cuerpo:**

```json
{"transaccionId": "3cf2cf81-c828-4799-a0af-01e46c65fd82",
 "tiendaId": "abed0b85-7532-4edd-9f0b-abcb3b885bad", "forzarSinStock": false,
 "items": [{"sku": "DEMO-S3-AZ-M", "cantidad": 1, "precioUnitario": 89900}]}
```

`transaccionId` (UUID que genera el front, obligatorio), `tiendaId` (obligatorio), `items` (1 a 200; `sku`, `cantidad > 0`, `precioUnitario ≥ 0`, sin SKU repetidos), `canal` (opcional, texto hasta 30, por defecto `FISICO`), `forzarSinStock` (opcional).

* **201** (capturado):

```json
{"transaccionId": "3cf2cf81-…", "tiendaId": "abed0b85-…", "vendedorId": "76b6faf5-…",
 "fecha": "2026-11-23T00:38:01.666182778Z", "total": 89900,
 "lineas": [{"id": "ff5c428d-…", "varianteId": "ce457d78-…", "cantidad": 1, "precioUnitario": 89900,
             "canal": "FISICO", "forzada": false, "estado": "REGISTRADA",
             "anuladaPor": null, "anuladaEn": null, "motivoAnulacion": null}]}
```

* **Errores:** `200` reintento con el mismo `transaccionId` y el mismo contenido (devuelve la venta original, no descuenta otra vez) · `400` ítems vacíos, cantidad 0, canal largo, tienda inactiva, JSON inválido · `403` sin scope, **tienda no asignada** (`"No tiene acceso a esta tienda"`) o forzar sin el scope · `404` `"No existe una variante con SKU NO-EXISTE-XX"` o tienda sin Almacén · `409` `"Stock insuficiente para el SKU DEMO-S3-AZ-M"` o `"La transacción … ya se usó con datos diferentes"`.
* **Idempotencia:** generar el `transaccionId` **una vez por intento de venta** (al abrir el carrito) y reusarlo en los reintentos; generar uno nuevo solo tras un 201/200.
* **Efectos:** ver sección 10 (traspaso y recomendación). Las líneas traen `varianteId`, no `sku`.
* **Mock:** `02-registrar-venta.json`.

### 11.2 Inventario de un nodo · `GET /nodos/{nodoId}/inventario`

* **Scope:** `inventario:consultar`. **Roles:** todos (el coordinador sin tiendas solo ve lo de CD si se le asignara; hoy no ve nada). **Alcance:** un nodo de tienda no asignada o un CD para un rol de tienda → `404` `"El nodo … no existe"`. El OPERADOR_CD sí ve los CD.
* **Query:** `page`, `size`, `sort`. Ordenado por variante.
* **200:** página de `StockResponse` (sección 8.1).
* **Errores:** `404` nodo inexistente o fuera de alcance.
* **Relacionados:** `GET /variantes/{varianteId}/inventario` (arreglo, sin paginar; solo nodos visibles; `[]` si ninguno) y `GET /nodos/{nodoId}/inventario/movimientos` (kardex, paginado, del más antiguo al más reciente; filtros `tipo`, `desde`, `hasta`). El kardex trae `id`, `varianteId`, `tipo`, `cantidad` (con signo: `-1` en una venta), `motivo`, `comentario`, `forzado`, `usuarioId`, `ocurridoEn`. **No trae saldo resultante ni `sku`**, y `usuarioId` llega `null` en ventas y traspasos automáticos (capturado).
* **Mock:** `03-inventario-por-nodo.json` (incluye la secuencia de magnitudes de todo el recorrido).

### 11.3 Ajuste de inventario · `POST /nodos/{nodoId}/inventario/ajustes`

Solo para preparar el caso parcial en la demo (lo hace el ADMIN o el OPERADOR_CD en un CD).

* **Scope:** `inventario-cd:administrar` en CD, `inventario:administrar` en tienda. **Alcance:** sí.
* **Cuerpo:** `{"sku": "DEMO-S3-BL-L", "delta": -190, "motivo": "MERMA", "comentario": "…"}`. `delta` ≠ 0; `comentario` obligatorio con `CORRECCION`.
* **201:** `{"movimientoId", "nodoId", "sku", "delta": -190, "motivo": "MERMA", "comentario", "aLaMano": 10, "ocurridoEn"}`.
* **Errores:** `400` `"El ajuste dejaría el stock en negativo: a la mano=10, delta=-1000"`, `"motivo: debe ser CONTEO_FISICO, INGRESO_MANUAL, MERMA o CORRECCION"`, delta 0, SKU inexistente · `404` nodo fuera de alcance.
* **Efectos:** puede dejar `disponibleParaUso` negativo en un CD con reservas. Dispara el mismo evento que una venta (en una tienda podría generar traspaso o recomendación).

### 11.4 Recomendaciones · `GET /recomendaciones`, `GET /recomendaciones/{id}`

* **Scope:** `reposicion:planificar`. **Rol:** PLANIFICADOR_ABASTECIMIENTO (y ADMIN). **Alcance:** sí.
* **Query:** `estado` (`BORRADOR`, `APROBADA`, `RECHAZADA`), `tiendaId`, `varianteId`, `page`, `size`, `sort`. Sin `tiendaId` lista las de todas las tiendas del usuario. Más reciente primero.
* **200:** página de:

```json
{"id": "c2280d0d-…", "tiendaId": "abed0b85-…", "varianteId": "ce457d78-…",
 "cdSugeridoId": "c41e9d7f-…", "cantidadSugerida": 19, "estado": "BORRADOR",
 "fechaCreacion": "2026-11-23T00:38:01.7…Z"}
```

* **Errores:** `400` `estado` inválido o UUID mal formado (cuerpo de Spring, sin `mensaje`) · `404` `"No existe una tienda con id …"` si se filtra por una tienda no asignada · un planificador sin esas tiendas recibe una página vacía al no filtrar.
* No trae nombre de tienda, SKU ni nombre del CD, ni el `pronosticado` o el nivel que la originó (ver 14). `cdSugeridoId` es el primer CD de la prioridad aunque no tenga stock.
* **Mock:** `04-recomendaciones.json`.

### 11.5 Evaluar recomendaciones · `POST /recomendaciones/evaluar?tiendaId=`

* **Scope:** `reposicion:planificar`. Sin cuerpo. `tiendaId` opcional (sin él, todas las tiendas del usuario).
* **200:** `{"recomendacionesCreadas": 1, "recomendaciones": [RecomendacionResponse]}` o `{"recomendacionesCreadas": 0, "recomendaciones": []}`.
* **Idempotente:** no duplica un BORRADOR ni recomienda si hay una orden GENERADA sin CD para esa tienda y variante (capturado: 0 creadas con una GENERADA viva).
* **Errores:** `400` UUID inválido · `404` tienda fuera de alcance.

### 11.6 Aprobar · `POST /recomendaciones/{id}/aprobar`

* **Scope:** `reposicion:planificar`. **Alcance:** sí (`404`).
* **Cuerpo:** opcional. Sin cuerpo aprueba la sugerida; `{"cantidadAprobada": 15}` aprueba otra (editar).
* **201** (capturado, caso feliz):

```json
{"recomendacionId": "c2280d0d-…", "estado": "APROBADA", "cantidadSugerida": 19, "cantidadAprobada": 19,
 "desviacion": 0, "aprobadoPor": "fe11482c-…", "fechaAprobacion": "2026-11-23T00:38:02.938580692Z",
 "orden": {"id": "2e3d0e2d-…", "recomendacionId": "c2280d0d-…", "tiendaId": "abed0b85-…",
           "varianteId": "ce457d78-…", "cdAsignadoId": "37918b02-…",
           "motivoAsignacion": "Asignado al CD de prioridad 2",
           "cantidadTotalSolicitada": 19, "cantidadPendiente": 19, "cantidadDespachadaAcumulada": 0,
           "estado": "APROBADA", "fechaCreacion": "…",
           "intentos": [
             {"cdId": "c41e9d7f-…", "ordenEvaluado": 1, "resultado": "SIN_STOCK",
              "motivo": "Disponible 3 menor que lo requerido 19", "timestamp": "…"},
             {"cdId": "37918b02-…", "ordenEvaluado": 2, "resultado": "ASIGNADO", "motivo": null, "timestamp": "…"}],
           "motivoCierre": null, "cerradaPor": null, "fechaCierre": null}}
```

`desviacion = cantidadAprobada − cantidadSugerida` (−4 al aprobar 15 de 19). Con una cantidad que ningún CD cubre, responde igual `201` con la orden en `GENERADA`, `cdAsignadoId: null` y todos los intentos `SIN_STOCK`.

* **Errores:** `400` `"cantidadAprobada: La cantidad aprobada debe ser mayor que cero"` o id mal formado · `403` (VENDEDOR, capturado) · `404` `"No existe una recomendación con id …"` · `409` `"No se puede aprobar la recomendación …: está en estado APROBADA"` (aprobar dos veces nunca crea otra orden).
* **Efectos:** sección 10.
* **Mock:** `04-recomendaciones.json`, `05-detalle-orden.json`.

### 11.7 Rechazar · `POST /recomendaciones/{id}/rechazar`

* Sin cuerpo. **200** con la `RecomendacionResponse` en `RECHAZADA`. **409** si no está en BORRADOR (`"No se puede rechazar la recomendación …: está en estado APROBADA"`). No pide motivo.

### 11.8 Órdenes · `GET /ordenes-reabastecimiento`, `GET /ordenes-reabastecimiento/{id}`

* **Scope:** `reposicion:planificar`. **Rol:** PLANIFICADOR (y ADMIN). **El OPERADOR_CD no puede listarlas (`403`, capturado)**: ver 14.
* **Query:** `estado` (los 10 valores), `tiendaId`, `page`, `size`, `sort`. Más reciente primero, con sus intentos.
* **200:** `OrdenReabastecimientoResponse` (la del 11.6, campo `orden`).
* **Errores:** `400` filtro inválido · `404` fuera de alcance o inexistente.
* No trae sus ciclos (se piden con `GET /ciclos-despacho?ordenId=`), ni sus recepciones, ni nombres.
* **Mock:** `05-detalle-orden.json`.

### 11.9 Despachar · `POST /ordenes-reabastecimiento/{ordenId}/despachos`

* **Scope:** `despacho:operar`. **Rol:** OPERADOR_CD (y ADMIN). No filtra por tienda ni por CD. Sin cuerpo.
* **201** (capturado, parcial):

```json
{"id": "19a09432-…", "ordenId": "97f1888b-…", "numeroCiclo": 1, "cantidadSolicitada": 19,
 "cantidadDespachada": 10, "cantidadPendiente": 9, "resultado": "PARCIAL", "fillRate": 0.5263,
 "fechaDespacho": "2026-11-23T00:38:04.436379335Z"}
```

`cantidadPendiente` del ciclo = solicitado − despachado **de ese ciclo**; no es el pendiente de la orden.

* **Errores:** `404` orden inexistente · `409` `"No se puede iniciar el despacho de la orden … en estado DESPACHADA"` (o GENERADA, etc.), otro despacho simultáneo ganó, o `"El CD no tiene unidades a la mano para despachar la orden …"` · `403` ENCARGADO_BODEGA (capturado).
* **Efectos:** sección 10. **Mock:** `06-despacho.json`.

### 11.10 Ciclos de despacho · `GET /ciclos-despacho`, `GET /ciclos-despacho/{id}`

* **Scope:** `despacho:operar` o `transporte:operar`. **Roles:** OPERADOR_CD, COORDINADOR_TRANSPORTE, ADMIN.
* **Query:** `ordenId` (UUID), `sinViaje` (`true` = solo los que aún no están en un viaje), `page`, `size`. `sort` no aplica.
* **200:** página de `CicloDespachoResponse`.
* No dicen de qué CD salen ni a qué tienda van: para armar el viaje el front necesita saber el CD de cada ciclo (ver 14).
* **Errores:** `400` `ordenId` mal formado (cuerpo de Spring) · `404` ciclo inexistente.

### 11.11 Armar viaje · `POST /viajes`

* **Scope:** `transporte:operar`. **Rol:** COORDINADOR_TRANSPORTE (y ADMIN).
* **Cuerpo:**

```json
{"cdId": "37918b02-357e-4a64-8f21-5a498541bfc7", "vehiculo": "Camión DEMO-001",
 "paradas": [{"cicloDespachoId": "3d6e13b3-…"}, {"cicloDespachoId": "6804ac60-…"}]}
```

`vehiculo` obligatorio, hasta 100 caracteres. `ordenParada` opcional (entero positivo); por defecto, la posición en la lista.

* **201:** `ViajeResponse` en ARMADO:

```json
{"id": "b0831076-…", "cdId": "37918b02-…", "vehiculo": "Camión DEMO-001", "estado": "ARMADO",
 "fechaCreacion": "2026-11-23T00:38:05.051002580Z", "fechaSalida": null, "fechaCierre": null,
 "paradas": [
   {"id": "b1aba102-…", "cicloDespachoId": "3d6e13b3-…", "tiendaId": "abed0b85-…", "ordenParada": 1,
    "estado": "PENDIENTE", "fechaSalidaCd": null, "fechaLlegada": null},
   {"id": "97138a0f-…", "cicloDespachoId": "6804ac60-…", "tiendaId": "8a7a1acc-…", "ordenParada": 2,
    "estado": "PENDIENTE", "fechaSalidaCd": null, "fechaLlegada": null}]}
```

(En Swagger las paradas de la respuesta salen con la forma del request; la forma real es esta. Ver 15.)

* **Errores:** `400` `"paradas: must not be empty"`, `"vehiculo: must not be blank"`, ciclo u orden de parada repetidos · `404` `"No existe un centro de distribución con id …"` o ciclo inexistente · `409` `"El ciclo de despacho … ya está en otro viaje"` · `422` `"El ciclo de despacho … no sale del CD …"` · `403` OPERADOR_CD (capturado).
* **Relacionados:** `GET /viajes?estado=` (página, más reciente primero) y `GET /viajes/{id}`.
* **Mock:** `07-armar-viaje.json`.

### 11.12 Salida · `POST /viajes/{id}/salida`

* **Scope:** `transporte:operar`. **Cuerpo:** opcional, `{"fechaSalida": "2026-11-22T19:38:00-05:00"}`.
* **200:** `ViajeResponse` en EN_CURSO, con `fechaSalida` y cada parada EN_TRANSITO con `fechaSalidaCd`.
* **Errores:** `400` hora futura o formato inválido · `404` viaje inexistente · `409` `"El viaje … está EN_CURSO, no ARMADO: ya salió"` o alguna orden no está DESPACHADA · `422` salida anterior al despacho.
* **Mock:** `08-salida-llegada.json`.

### 11.13 Llegada · `POST /viajes/{id}/paradas/{paradaId}/llegada`

* **Scope:** `transporte:operar`. **Cuerpo:** opcional, `{"fechaLlegada": "…"}`.
* **200:** `ViajeResponse` completo. La parada queda ENTREGADO con `fechaLlegada`; con la última, el viaje queda CERRADO con `fechaCierre`.
* **Errores:** `400` hora futura · `404` `"El viaje … no tiene la parada …"` · `409` `"El viaje … está ARMADO, no EN_CURSO"` o `"La parada … ya está ENTREGADO"` · `422` llegada anterior a la salida.

### 11.14 Paradas por recibir · `GET /paradas-por-recibir`

* **Scope:** `recepcion:registrar`. **Rol:** ENCARGADO_BODEGA (y ADMIN). **Alcance:** solo las paradas de sus tiendas (un encargado de otra tienda recibe `[]`, capturado).
* Sin parámetros, sin paginar. Paradas ENTREGADO sin recepción, ordenadas por viaje y parada.
* **200:**

```json
[{"paradaId": "fb33fda4-…", "viajeId": "80efbbb3-…", "tiendaId": "abed0b85-…",
  "cicloDespachoId": "19a09432-…", "ordenId": "97f1888b-…", "cantidadDespachada": 10}]
```

* No trae SKU, variante, nombre de la tienda, vehículo ni fecha de llegada (ver 14).

### 11.15 Recepción · `POST /viajes/{viajeId}/paradas/{paradaId}/recepcion`

* **Scope:** `recepcion:registrar`. **Alcance:** sí (`404` `"No existe la parada …"`).
* **Cuerpo:** `{"cantidadRecibida": 8}` (obligatorio, ≥ 0; según la validación del código, 0 es válido y significa que no llegó nada; no se probó en el recorrido).
* **201** (capturado, con discrepancia):

```json
{"id": "0cf909f7-…", "viajeParadaId": "fb33fda4-…", "cicloDespachoId": "19a09432-…",
 "cantidadDespachada": 10, "cantidadRecibida": 8, "discrepancia": 2, "registradoPor": "d81c9130-…",
 "fechaRecepcion": "2026-11-23T00:38:08.322441549Z", "estadoOrden": "REABIERTA", "cantidadPendienteOrden": 11}
```

* **Errores:** `200` reintento: la parada ya tenía recepción; devuelve la original y no suma de nuevo, **aunque la cantidad enviada sea otra** (comprobado: un segundo envío con 5 devolvió la recepción original de 19) · `400` `"cantidadRecibida: La cantidad recibida no puede ser negativa"` · `403` COORDINADOR (capturado) · `404` parada inexistente, de otro viaje o fuera de alcance · `409` `"La parada … todavía no se ha entregado"` o la orden no está EN_TRANSITO · `422` `"La cantidad recibida (20) supera la despachada (19)"`.
* **Efectos:** sección 10. **Mock:** `09-recepcion.json`.

### 11.16 Cerrar con faltante · `POST /ordenes-reabastecimiento/{id}/cerrar`

* **Scope:** `reposicion:planificar`. **Alcance:** sí.
* **Cuerpo:** `{"motivo": "Se acepta la pérdida de 3 unidades en tránsito"}` (obligatorio, hasta 500).
* **200:** la orden en CERRADA, con `cantidadPendiente` conservado, `motivoCierre`, `cerradaPor` y `fechaCierre`.
* **Errores:** `400` `"motivo: El motivo es obligatorio"` (también con solo espacios) · `409` `"No se puede cerrar con faltante de la orden … en estado APROBADA"` (solo REABIERTA) · `403` OPERADOR_CD (capturado).
* **Mock:** `10-cerrar-con-faltante.json`.

### 11.17 Cancelar · `POST /ordenes-reabastecimiento/{id}/cancelar`

* Igual que cerrar, pero solo para una orden GENERADA (sin CD). **200** con la orden CANCELADA. No toca inventario. **409** en cualquier otro estado (`"No se puede cancelar de la orden … en estado CANCELADA"`).

---

## 12. Recorrido de la demo, llamada por llamada

Datos: los de `demo.json` del sembrador. Aquí se usan los ids del recorrido capturado (`mock-data/00-ids-de-referencia.json`). `{CENTRO}` = tienda Centro, `{AZ}` = SKU `DEMO-<sufijo>-AZ-M`, etc. Cada rol entra con su usuario de demo (sección 2) y usa **su** token.

**0. Preparación (ADMIN, fuera de la demo).** Correr el sembrador. Para el caso parcial, antes del paso 4, el ADMIN registra la merma en el CD (11.3).

**1. Recomendar (VENDEDOR).**

1. `POST /ventas` con `{CENTRO}`, `{AZ}` × 1 y un `transaccionId` nuevo → `201`.
2. (Opcional, para mostrar el efecto) `GET /nodos/{almacenCentro}/inventario` → AZ-M `aLaMano 6`; `GET /nodos/{bodegaCentro}/inventario` → AZ-M `aLaMano 1`.

**2. Aprobar (PLANIFICADOR).**

1. `GET /recomendaciones?tiendaId={CENTRO}&estado=BORRADOR` → una de 19.
2. `POST /recomendaciones/{id}/aprobar` sin cuerpo (o `{"cantidadAprobada": N}`) → `201` con `orden`.

**3. Orden con fallback (PLANIFICADOR).**

1. Mostrar `orden.intentos` de la respuesta anterior: CD Sin Stock `SIN_STOCK`, CD Principal `ASIGNADO`.
2. (Opcional) `GET /nodos/{nodoCdPrincipal}/inventario` (con un rol que vea el CD: OPERADOR_CD o ADMIN) → `saliente 19`; `GET /nodos/{bodegaCentro}/inventario` → `entrante 19`.

**4. Despachar (OPERADOR_CD).**

1. Encontrar la orden: el operador no puede listar órdenes (14). Para la demo, el front pasa el `orden.id` del paso 2, o el ADMIN hace `GET /ordenes-reabastecimiento?estado=APROBADA`.
2. `POST /ordenes-reabastecimiento/{ordenId}/despachos` → `201`, ciclo COMPLETO (o PARCIAL si hubo merma).

**5. Armar viaje (COORDINADOR).**

1. `GET /ciclos-despacho?sinViaje=true` → ciclos disponibles.
2. `POST /viajes` con `cdId` = CD Principal, un vehículo y los ciclos elegidos → `201` ARMADO.

**6. Salida y llegada (COORDINADOR).**

1. `POST /viajes/{viajeId}/salida` (sin cuerpo o con `fechaSalida`) → `200` EN_CURSO.
2. `POST /viajes/{viajeId}/paradas/{paradaId}/llegada` por cada parada → `200`; la última deja el viaje CERRADO.

**7. Recibir (ENCARGADO_BODEGA).**

1. `GET /paradas-por-recibir` → la parada de su tienda.
2. `POST /viajes/{viajeId}/paradas/{paradaId}/recepcion` con `{"cantidadRecibida": 17}` → `201`, `discrepancia 2`, `estadoOrden REABIERTA`, `cantidadPendienteOrden 2`.
3. (Opcional) `GET /nodos/{bodegaCentro}/inventario` → `aLaMano 18`, `entrante 2`.

(Los números 17, 18 y 2 son los del guion. El recorrido capturado recibió 8 de 10 en la orden B y obtuvo `discrepancia 2`, `REABIERTA`, `cantidadPendienteOrden 11`: ver `mock-data/09-recepcion.json`.)

**8. Cerrar (PLANIFICADOR) o volver a despachar.**

* Cerrar: `POST /ordenes-reabastecimiento/{ordenId}/cerrar` con `{"motivo": "…"}` → `200` CERRADA; `GET /nodos/{bodegaCentro}/inventario` → `entrante 0`.
* Segundo ciclo: repetir los pasos 4 a 7 con la misma orden (el ciclo nuevo trae `numeroCiclo 2`); al recibir todo, `estadoOrden CERRADA`.

El recorrido capturado hizo lo mismo con números distintos para cubrir más casos (orden A total, orden B parcial con reapertura y segundo ciclo, orden C editada y cerrada con faltante, orden D sin CD cancelada, orden E asignada al CD de prioridad 1). La secuencia completa, con códigos, está en `mock-data/`.

---

## 13. Lookups: de dónde sacar tiendas, CD, variantes y nodos

| Dato | Endpoint | Quién puede | Problema |
| :--- | :--- | :--- | :--- |
| Tiendas (nombre, ubicación) | `GET /tiendas` | Solo `tiendas:administrar` (ADMIN) | **Ningún rol operativo puede listar tiendas** (403 para VENDEDOR y PLANIFICADOR, capturado) |
| Almacén y Bodega de una tienda | `GET /tiendas/{id}` → `almacenId`, `bodegaId` | Solo ADMIN | Sin esto el front no sabe qué `nodoId` pedir en inventario |
| Tiendas de un usuario | `GET /usuarios/{id}/tiendas` → `[{id, nombre, activa}]` | Solo `usuarios:administrar` | El usuario no puede ver las suyas |
| CD (nombre, nodo) | `GET /centros-distribucion`, `GET /centros-distribucion/{id}` → `nodo.id` | Solo `cd:administrar` (ADMIN) | OPERADOR_CD y COORDINADOR reciben 403 (capturado); el coordinador necesita el `cdId` para armar el viaje |
| Prioridad de CD de una tienda | `GET /tiendas/{id}/prioridad-cd` | Solo `inventario:administrar` | El PLANIFICADOR recibe 403 (capturado) |
| Variantes (SKU, talla, color, template, precio) | `GET /variantes?sku=`, `GET /variantes/{id}`, `GET /variantes/sku/{sku}` | Solo `catalogo:administrar` (ADMIN) | El VENDEDOR no puede buscar SKU (403, capturado); recomendaciones, órdenes y ventas traen `varianteId` sin SKU |
| SKU de un `varianteId` | `GET /variantes/{id}/inventario` o `GET /nodos/{n}/inventario` (traen `sku`) | `inventario:consultar` | Rodeo: sirve si la variante tiene stock en un nodo visible |
| Bodegas con nombre de tienda | `GET /bodegas-tienda` → `tiendaNombre`, `tiendaUbicacion` | Solo `tiendas:administrar` | 403 para ENCARGADO_BODEGA (capturado) |

**Recomendación para la demo (sin cambiar el backend):** cargar los lookups una vez desde `demo.json` del sembrador (que trae ids de tiendas, nodos, CD y variantes) o desde un archivo de configuración de la demo, y armar en el front diccionarios `id → nombre`. Los nombres de tienda, CD y SKU salen de lo que el sembrador creó (`Tienda Demo Centro <sufijo>`, `CD Demo Principal <sufijo>`, `DEMO-<sufijo>-AZ-M`). Así se evitan las llamadas por fila.

**N+1 a evitar:**

* No pedir `GET /variantes/{id}` por cada fila de recomendaciones u órdenes (además da 403 a los roles operativos). Resolver con el diccionario local.
* No pedir `GET /ordenes-reabastecimiento/{id}` por cada parada por recibir: la parada ya trae `ordenId` y `cantidadDespachada`; la variante se puede resolver una vez con el diccionario de órdenes que ya cargó el planificador, o mostrar solo la cantidad.
* Para el detalle de una orden, una llamada a `GET /ordenes-reabastecimiento/{id}` y otra a `GET /ciclos-despacho?ordenId={id}` bastan.
* `GET /variantes/{id}/inventario` devuelve todos los nodos visibles en una sola llamada; preferirlo a pedir nodo por nodo.

---

## 14. Huecos del contrato

Lo que el frontend debe tener presente. Ninguno se corrigió en este trabajo (solo documentación).

**Bloquean o complican pantallas de la demo**

1. **No hay "quién soy"**: ni scopes, ni roles, ni tiendas del usuario autenticado (3.3). El menú por rol tiene que salir de una configuración del front.
2. **Lookups solo para ADMIN** (13): tiendas, nodos de una tienda, CD, variantes, prioridad de CD y bodegas. Los roles operativos ven ids sin nombre.
3. **El OPERADOR_CD no puede listar órdenes** (`GET /ordenes-reabastecimiento` exige `reposicion:planificar`): no tiene cómo ver qué despachar. No existe un "órdenes por despachar" para su rol.
4. **Los ciclos de despacho no dicen de qué CD salen** (ni la orden ni el ciclo listado traen el CD, salvo `cdAsignadoId` en la orden, que el coordinador no puede leer). Para armar un viaje el coordinador necesita elegir el `cdId` y agrupar ciclos del mismo CD; hoy solo se entera por el `422`.
5. **El coordinador no ve inventario** ni de tiendas ni de CD (`[]`), aunque tenga `inventario:consultar`.
6. **No hay endpoint para consultar recepciones** de una orden o una parada: el detalle de la orden no puede mostrar Σrecibido ni las discrepancias, salvo calcularlas (`ΣR = S − cantidadPendiente`).

**Campos que faltan o llegan null**

7. Recomendación, orden, ciclo, parada por recibir: traen ids (`tiendaId`, `varianteId`, `cdId`) sin nombre ni SKU.
8. La recomendación no trae el `pronosticado`, el mínimo ni el objetivo que la originaron, así que la pantalla no puede explicar "por qué 19" sin otra llamada.
9. `cdSugeridoId` de la recomendación es el primer CD de la prioridad aunque no tenga stock (en la demo, el CD Sin Stock): no es "el CD que se va a asignar".
10. `intentos[].motivo` es `null` en el intento `ASIGNADO`.
11. Kardex: sin saldo resultante, sin `sku`, y `usuarioId: null` en ventas y traspasos automáticos.
12. `StockResponse` no dice el tipo de nodo (Almacén, Bodega o CD) ni la tienda: en `GET /variantes/{id}/inventario` el front no sabe etiquetar cada fila.
13. `ParadaPorRecibirResponse` no trae variante, vehículo ni hora de llegada.
14. `fillRate` es un número (`1.0`, `0.5263`), no un porcentaje ni un texto con 4 decimales.

**Errores con forma distinta**

15. 400 por UUID o enum mal formado en ruta o query, 404 de ruta, 405 y 500 llegan con el cuerpo por defecto de Spring, sin `mensaje` (4.2).
16. **`sort` por un campo inexistente responde 500** (bug): `GET /tiendas?sort=noexiste,asc`.
17. Algunos mensajes de validación salen en inglés (`must not be empty`).
18. Una venta en una tienda no asignada responde **403** `"No tiene acceso a esta tienda"`, mientras el resto de recursos de otra tienda responden 404.

**No existe (propuestas que no entraron)**

19. Reintentar la asignación de CD de una orden GENERADA (HU-52): la única salida para una GENERADA es cancelarla.
20. Reporte de cumplimiento y lead time (HU-50), umbral sugerido (HU-51), señales de demanda en la recomendación (HU-54).

**No verificado**

21. Producción con el Sprint 3 y su CORS (1). Refresh por cookie en un navegador real (2.2). Bloqueo progresivo (2.2). El 409 de concurrencia agotada (4.1).

---

## 15. Diferencias entre la documentación y el código

Listadas, no corregidas.

| # | Documento | Dice | El código hace |
| :--- | :--- | :--- | :--- |
| 1 | `docs/arquitectura/apis-priorizadas.md` | "89 endpoints en 21 controladores y 5 módulos (`logistica` todavía no expone endpoints)" | 113 operaciones en 77 rutas, 29 controladores y 6 módulos; `logistica` tiene 3 controladores (despacho, viajes, recepción). Faltan en ese documento los 24 endpoints del Sprint 3 (recomendaciones, órdenes, niveles de reposición al CD, despacho, ciclos, viajes, recepción) |
| 2 | `apis-priorizadas.md` (tabla de Inventario) | "Kardex con saldo resultante" | `MovimientoKardexResponse` no tiene saldo (lo dice su propio javadoc); solo `AjusteInventarioResponse` trae `aLaMano` resultante |
| 3 | `apis-priorizadas.md` (Paginación) | Ocho listados no paginados | Hay más: `GET /paradas-por-recibir` y `GET /variantes/{id}/inventario` también responden arreglos |
| 4 | `apis-priorizadas.md` | Numera HU-43 a HU-51 para ventas, solicitudes, ventanas, umbrales y traspasos (Sprint 2) | En el Sprint 3, HU-43 a HU-54 son otras historias (recomendación, aprobación, orden…). Los números chocan |
| 5 | Descripción general de OpenAPI (`OpenApiConfig`) | "Toda respuesta de error tiene el cuerpo `ErrorResponse`" | 400 por tipo inválido en ruta o query, 404 de ruta, 405 y 500 llegan con el cuerpo por defecto de Spring |
| 6 | Swagger, `ViajeResponse.paradas` | Esquema `Parada` con `cicloDespachoId` y `ordenParada` (el del request) | La respuesta trae `id`, `cicloDespachoId`, `tiendaId`, `ordenParada`, `estado`, `fechaSalidaCd`, `fechaLlegada`. Dos records se llaman `Parada` (`ArmarViajeRequest.Parada` y `ViajeResponse.Parada`) y springdoc publica uno solo |
| 7 | Swagger, `GET /recomendaciones` | Respuesta 200 sin esquema | Devuelve una página de `RecomendacionResponse` |
| 8 | Swagger, ejemplo de `POST /ventas` | `"canal": "POS"` | Sin `canal`, la venta queda con `"FISICO"`. El canal es texto libre |
| 9 | Regla general (404 fuera de alcance) y descripción de OpenAPI | Un recurso de otra tienda responde 404 | `POST /ventas` con una tienda no asignada responde 403 (`"No tiene acceso a esta tienda"`); su Swagger sí lo documenta así |
| 10 | `docs/demo/guion-review-sprint3.md` | Título "los siete pasos"; nombra las magnitudes `a_la_mano`, `entrante`, `saliente` | El guion tiene 8 pasos (el 8 es cerrar). En el JSON los campos son `aLaMano`, `entrante`, `saliente`, `disponibleParaUso` (no `disponible`) y `pronosticado` |
| 11 | Guion, paso 4 | "fill rate 1.0000" | La API devuelve el número `1.0` (y `0.5263` en un parcial) |
| 12 | Guion, preparación | `python3 tools/demo/sembrar_demo.py` | En Windows el comando es `python` (ya anotado en el DoD, 3.5) |
| 13 | `docs/sprint_3/plan_de_trabajo_sprint_3.md`, 2.3 | La orden pasa por EN_DESPACHO, RECIBIDA_TOTAL y RECIBIDA_PARCIAL | Son pasos dentro de la misma transacción; nunca se ven en una respuesta |
| 14 | `docs/sprint_3/dod_sprint_3.md`, 3.3 | "Swagger carga con los 17 endpoints nuevos" | Entre el Sprint 2 (89) y hoy (113) hay 24 operaciones nuevas |
| 15 | DoD, 3.4 y memoria del equipo | `main` sigue en el Sprint 2 y falta mergear el PR #68 | El PR #68 se mergeó el 22 nov a las 00:19 UTC. Producción con el Sprint 3: NO VERIFICADO |
| 16 | `README.md`, "Primeros pasos" | No menciona CORS | Con `docker compose` solo se acepta el origen `http://localhost:8443` (valor por defecto); el compose no pasa `CORS_ALLOWED_ORIGINS` |
