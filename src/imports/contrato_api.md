# Contrato técnico de la API REST

Este documento describe la API tal como está en `develop` (Sprint 2). Lo consume
directamente el frontend, así que cada ruta indica sus scopes, sus códigos de
respuesta reales y la forma exacta de request y response.

## 0. Cambios respecto a la versión anterior

- Nuevos módulos: inventario (ajustes, carga inicial, consultas de stock y
  kardex), ventas (ventas, solicitudes no satisfechas, ventanas de quiebre) y
  reposición interna (umbrales, evaluación y traspasos).
- `/bodegas-tienda` es de solo lectura. Ya no tiene `POST`, `PUT` ni `DELETE`.
- Los errores de ajuste (stock negativo y variante no cargada en el nodo) responden
  `400` por ahora. El equipo decidió mantenerlo así; el cambio a `422`/`409` queda
  pendiente de revisión. Ver §8.
- La cookie de refresh usa `SameSite=None`, no `Strict`. Ver §12.
- El origen CORS por defecto es `http://localhost:8443`, no `5173`. Ver §12.

## 1. Datos generales

| Elemento | Valor |
|---|---|
| Base URL local | `http://localhost:8080` |
| Prefijo | `/api/v1` |
| Formato | JSON (`Content-Type: application/json`) |
| Identificadores | UUID (string) |
| Fechas | ISO-8601 UTC, por ejemplo `2026-10-18T16:00:00Z` |
| Montos | Número decimal (`precioBase`, `precioUnitario`, `total`) |
| Documentación interactiva | `/swagger-ui/index.html` |
| Documento OpenAPI | `/v3/api-docs` |

Las rutas protegidas reciben el access token así:

```http
Authorization: Bearer <accessToken>
```

El refresh token no se devuelve en JSON. El backend lo envía como cookie
`HttpOnly` llamada `refresh_token`, con path `/api/v1/auth`.

## 2. Convenciones de respuesta

### Operaciones exitosas

| Estado | Cuándo |
|---|---|
| `200 OK` | Consulta, actualización o acción que devuelve un recurso. También el reintento idempotente de una venta o solicitud (devuelve el recurso original). |
| `201 Created` | Creación nueva. Algunas incluyen `Location`. |
| `204 No Content` | Sin cuerpo: eliminación, desactivación, asignación o quitar relación, logout. |

### Errores

Todos los errores tienen esta forma:

```json
{
  "mensaje": "Descripción legible del problema"
}
```

| Estado | Significado | Tratamiento recomendado |
|---|---|---|
| `400` | JSON inválido, campo obligatorio ausente, formato inválido o regla de negocio incumplida (por ejemplo, ajuste que dejaría stock negativo, variante no cargada o SKU inexistente) | Mostrar `mensaje` junto al formulario |
| `401` | Access token ausente, inválido o expirado; o usuario inactivo/bloqueado | Intentar `POST /auth/refresh` una vez; si falla, volver al login |
| `403` | Token válido, pero sin el scope requerido | Mostrar acceso denegado; no intentar refresh |
| `404` | Recurso inexistente, o fuera del alcance del usuario (por ejemplo, otra tienda) | Mostrar "no encontrado" |
| `409` | Conflicto: duplicado, recurso en uso, estado incompatible (por ejemplo, stock insuficiente en una venta) o inventario ya cargado | Informar el conflicto y conservar los datos del formulario |
| `500` | Error inesperado | Mostrar error genérico |

Cuando el `400` viene de validación de campos, `mensaje` contiene el primer
error encontrado, por ejemplo `"el email no tiene un formato válido"`.

## 3. Autenticación

Todas estas rutas son públicas.

### `POST /api/v1/auth/login`

Request:

```json
{
  "email": "admin@supplychain.local",
  "password": "<contraseña-configurada>"
}
```

Reglas: `email` obligatorio, válido y de máximo 255 caracteres; `password`
obligatoria y de máximo 128 caracteres.

Respuesta sin MFA (`200`):

```json
{
  "mfaRequerido": false,
  "mfaChallengeToken": null,
  "accessToken": "<jwt>",
  "usuario": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@supplychain.local",
    "nombreCompleto": "Administrador Inicial",
    "estado": "ACTIVO",
    "creadoEn": "2026-10-18T16:00:00Z"
  }
}
```

La respuesta incluye además `Set-Cookie: refresh_token=...`.

Respuesta cuando se requiere MFA (`200`):

```json
{
  "mfaRequerido": true,
  "mfaChallengeToken": "<token-temporal>",
  "accessToken": null,
  "usuario": null
}
```

Errores: `400` por datos inválidos; `401` por credenciales incorrectas o usuario
no habilitado (inactivo o bloqueado).

### `POST /api/v1/auth/login/mfa`

Completa el login que respondió `mfaRequerido: true`.

Request:

```json
{
  "mfaChallengeToken": "<token-temporal>",
  "codigo": "123456"
}
```

`codigo` puede ser un TOTP de seis dígitos o un código de respaldo. Respuesta:
la misma `LoginResponse` completada (`mfaRequerido: false`) y la cookie de refresh.
Errores: `400` por campos vacíos; `401` por token o código inválido o expirado.

### `POST /api/v1/auth/refresh`

Requiere que el navegador envíe la cookie de refresh (`credentials: "include"`).
No recibe body.

Respuesta (`200`):

```json
{
  "accessToken": "<nuevo-jwt>"
}
```

También reemplaza la cookie. Errores: `401` si la cookie no existe, expiró o
fue revocada.

### `POST /api/v1/auth/logout`

Idempotente. Invalida el refresh token si existe y limpia la cookie. Responde
`204` sin cuerpo, aunque no haya sesión válida.

## 4. MFA del usuario autenticado

Requieren `Authorization: Bearer <jwt>`. No requieren scope especial.

### `POST /api/v1/mfa/activar`

Sin body. Respuesta (`200`):

```json
{
  "secreto": "JBSWY3DPEHPK3PXP",
  "qrCodeDataUri": "data:image/png;base64,..."
}
```

`qrCodeDataUri` puede asignarse directamente a `src` de un `<img>`. El secreto
es sensible: no mostrarlo si no hace falta.

### `POST /api/v1/mfa/confirmar`

Request:

```json
{
  "codigo": "123456"
}
```

`codigo` debe tener exactamente 6 dígitos. Respuesta (`200`):

```json
{
  "codigosRespaldo": ["AB12-CD34", "EF56-GH78"]
}
```

Los códigos de respaldo se muestran una sola vez. Errores: `400` por código
inválido o MFA ya configurado; `401` sin token.

## 5. Usuarios, roles y scopes

### Usuarios — `/api/v1/usuarios`

Requieren `usuarios:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /usuarios` | Crear usuario | `201 UsuarioResponse` |
| `GET /usuarios` | Listar usuarios (lista completa, sin paginar) | `200 UsuarioResponse[]` |
| `GET /usuarios/{id}` | Consultar usuario | `200 UsuarioResponse` |
| `PUT /usuarios/{id}/desactivar` | Desactivar usuario | `200 UsuarioResponse` |
| `PUT /usuarios/{id}/activar` | Activar usuario | `200 UsuarioResponse` |
| `GET /usuarios/{id}/roles` | Roles del usuario | `200 RolResponse[]` |
| `POST /usuarios/{id}/roles` | Asignar rol | `204` |
| `DELETE /usuarios/{id}/roles/{rolId}` | Quitar rol | `204` |
| `GET /usuarios/{id}/tiendas` | Tiendas asignadas al usuario | `200 TiendaAsignadaResponse[]` |
| `POST /usuarios/{id}/tiendas` | Asignar tienda | `204` |
| `DELETE /usuarios/{id}/tiendas/{tiendaId}` | Quitar tienda | `204` |

Crear usuario (`POST /usuarios`):

```json
{
  "email": "usuario@empresa.com",
  "nombreCompleto": "Nombre del usuario",
  "password": "UnaClaveDeAlMenos12"
}
```

`email` y `nombreCompleto` son obligatorios (máximo 255 y 150 caracteres). La
contraseña tiene entre 12 y 128 caracteres.

Asignar rol (`POST /usuarios/{id}/roles`):

```json
{ "rolId": "550e8400-e29b-41d4-a716-446655440000" }
```

Asignar tienda (`POST /usuarios/{id}/tiendas`):

```json
{ "tiendaId": "550e8400-e29b-41d4-a716-446655440000" }
```

Un usuario con alcance por tienda solo opera en las tiendas asignadas. Un
usuario con el scope `tiendas:operar-todas` opera en todas.

### Roles — `/api/v1/roles`

Requieren `roles:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /roles` | Crear rol | `201 RolResponse` |
| `GET /roles` | Listar roles | `200 RolResponse[]` |
| `GET /roles/{id}` | Consultar rol | `200 RolResponse` |
| `PUT /roles/{id}` | Actualizar rol | `200 RolResponse` |
| `DELETE /roles/{id}` | Eliminar rol | `204` |
| `GET /roles/{id}/scopes` | Scopes del rol | `200 ScopeResponse[]` |
| `POST /roles/{id}/scopes` | Asignar scope | `204` |
| `DELETE /roles/{id}/scopes/{scopeId}` | Quitar scope | `204` |

Request de crear o actualizar:

```json
{
  "nombre": "OPERADOR",
  "descripcion": "Permisos de operación"
}
```

`nombre` es obligatorio (máximo 100); `descripcion` admite hasta 255.

Asignar scope (`POST /roles/{id}/scopes`):

```json
{ "scopeId": "550e8400-e29b-41d4-a716-446655440000" }
```

### Scopes — `/api/v1/scopes`

Requieren `scopes:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /scopes` | Crear scope | `201 ScopeResponse` |
| `GET /scopes` | Listar scopes | `200 ScopeResponse[]` |
| `GET /scopes/{id}` | Consultar scope | `200 ScopeResponse` |
| `PUT /scopes/{id}` | Actualizar scope | `200 ScopeResponse` |
| `DELETE /scopes/{id}` | Eliminar scope | `204` |

Request:

```json
{
  "codigo": "catalogo:administrar",
  "descripcion": "Administrar el catálogo",
  "sensible": true
}
```

`codigo` es obligatorio (máximo 100); `descripcion` admite hasta 255;
`sensible` es booleano y, si se omite, vale `false`.

### Modelos de identidad

```json
// UsuarioResponse
{ "id": "uuid", "email": "usuario@empresa.com", "nombreCompleto": "Nombre del usuario",
  "estado": "ACTIVO", "creadoEn": "2026-10-18T16:00:00Z" }
```

`estado` puede ser `ACTIVO`, `BLOQUEADO` o `INACTIVO`.

```json
// RolResponse
{ "id": "uuid", "nombre": "OPERADOR", "descripcion": "Permisos de operación",
  "creadoEn": "2026-10-18T16:00:00Z" }
```

```json
// ScopeResponse
{ "id": "uuid", "codigo": "catalogo:administrar", "descripcion": "Administrar el catálogo",
  "sensible": true, "creadoEn": "2026-10-18T16:00:00Z" }
```

```json
// TiendaAsignadaResponse
{ "id": "uuid", "nombre": "Tienda Centro", "activa": true }
```

## 6. Catálogo

Requieren `catalogo:administrar`.

### Categorías — `/api/v1/categorias`

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /categorias` | Crear | `201 CategoriaResponse` |
| `GET /categorias` | Listar (paginado) | `200 Page<CategoriaResponse>` |
| `GET /categorias/{id}` | Consultar | `200 CategoriaResponse` |
| `PUT /categorias/{id}` | Actualizar | `200 CategoriaResponse` |
| `DELETE /categorias/{id}` | Eliminar | `204` |

```json
// Request
{ "nombre": "Camisas" }
```

`nombre` es obligatorio (máximo 150).

```json
// CategoriaResponse
{ "id": "uuid", "nombre": "Camisas" }
```

### Templates — `/api/v1/templates`

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /templates` | Crear | `201 TemplateResponse` |
| `GET /templates` | Listar (paginado) | `200 Page<TemplateResponse>` |
| `GET /templates/{id}` | Consultar | `200 TemplateResponse` |
| `PUT /templates/{id}` | Actualizar | `200 TemplateResponse` |
| `DELETE /templates/{id}` | Eliminar | `204` |

```json
// Request
{
  "nombre": "Camisa básica",
  "temporada": "2026-Otoño",
  "proveedor": "Proveedor Textil",
  "precioBase": 89900.00,
  "categoriaId": "550e8400-e29b-41d4-a716-446655440000"
}
```

`nombre` (máximo 200) y `categoriaId` son obligatorios. `temporada` admite 50
caracteres, `proveedor` 150, y `precioBase` es opcional pero no negativo.
En `PUT` la categoría no cambia: el servicio solo actualiza nombre,
temporada, proveedor y precio base.

```json
// TemplateResponse
{ "id": "uuid", "nombre": "Camisa básica", "temporada": "2026-Otoño",
  "proveedor": "Proveedor Textil", "precioBase": 89900.00, "categoriaId": "uuid" }
```

### Variantes — `/api/v1/variantes`

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /variantes` | Crear | `201 VarianteResponse` |
| `GET /variantes` | Listar (paginado) | `200 Page<VarianteResponse>` |
| `GET /variantes/{id}` | Consultar | `200 VarianteResponse` |
| `GET /variantes/sku/{sku}` | Consultar por SKU | `200 VarianteResponse` |
| `PUT /variantes/{id}` | Actualizar | `200 VarianteResponse` |
| `DELETE /variantes/{id}` | Eliminar | `204` |

```json
// Request
{
  "sku": "CAM-BAS-001",
  "talla": "M",
  "color": "Negro",
  "templateId": "550e8400-e29b-41d4-a716-446655440000"
}
```

`sku` (máximo 60) y `templateId` son obligatorios. `talla` admite 20 y `color`
50; ambos pueden ser nulos.

```json
// VarianteResponse
{ "id": "uuid", "sku": "CAM-BAS-001", "talla": "M", "color": "Negro", "templateId": "uuid" }
```

## 7. Red de nodos: tiendas, centros de distribución y bodegas

### Tiendas — `/api/v1/tiendas`

Requieren `tiendas:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /tiendas` | Crear tienda (crea su Almacén y su Bodega) | `201 TiendaConNodosResponse` |
| `GET /tiendas` | Listar (paginado) | `200 Page<TiendaResponse>` |
| `GET /tiendas/{id}` | Consultar con sus nodos | `200 TiendaConNodosResponse` |
| `PUT /tiendas/{id}` | Actualizar | `200 TiendaResponse` |
| `DELETE /tiendas/{id}` | Desactivar (no borra) | `204` |
| `PUT /tiendas/{id}/activar` | Activar | `200 TiendaResponse` |

```json
// Request (crear y actualizar)
{ "nombre": "Tienda Centro", "ubicacion": "Bogotá" }
```

`nombre` es obligatorio (máximo 150); `ubicacion` admite hasta 255.

```json
// TiendaResponse (listado y actualizaciones)
{ "id": "uuid", "nombre": "Tienda Centro", "ubicacion": "Bogotá", "estado": "ACTIVA",
  "creadoEn": "2026-10-18T16:00:00Z", "actualizadoEn": "2026-10-18T16:00:00Z" }
```

```json
// TiendaConNodosResponse (crear y consultar por id)
{ "id": "uuid", "nombre": "Tienda Centro", "ubicacion": "Bogotá", "estado": "ACTIVA",
  "creadoEn": "2026-10-18T16:00:00Z", "actualizadoEn": "2026-10-18T16:00:00Z",
  "almacenId": "uuid", "bodegaId": "uuid" }
```

`estado` puede ser `ACTIVA` o `INACTIVA`. `almacenId` y `bodegaId` son los
ids de los nodos de la tienda; se usan en inventario y ventas.

### Centros de distribución — `/api/v1/centros-distribucion`

Requieren `cd:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /centros-distribucion` | Crear | `201 CentroDistribucionResponse` |
| `GET /centros-distribucion` | Listar y filtrar (paginado) | `200 Page<CentroDistribucionResponse>` |
| `GET /centros-distribucion/{id}` | Consultar con nodo | `200 CentroDistribucionConNodoResponse` |
| `PUT /centros-distribucion/{id}` | Actualizar | `200 CentroDistribucionResponse` |
| `DELETE /centros-distribucion/{id}` | Eliminar | `204` |

Filtros opcionales del listado: `id`, `nombre`, `ubicacion`, además de `page`,
`size` y `sort`.

```json
// Request (crear y actualizar)
{ "nombre": "CD Principal", "ubicacion": "Bogotá" }
```

`nombre` es obligatorio (máximo 150); `ubicacion` admite hasta 255.

```json
// CentroDistribucionResponse
{ "id": "uuid", "nombre": "CD Principal", "ubicacion": "Bogotá" }
```

```json
// CentroDistribucionConNodoResponse
{ "id": "uuid", "nombre": "CD Principal", "ubicacion": "Bogotá",
  "nodo": { "id": "uuid", "tipo": "CD", "cdId": "uuid", "tiendaId": null } }
```

### Bodegas de tienda — `/api/v1/bodegas-tienda` (solo lectura)

Requieren `tiendas:administrar`. Las bodegas se crean con la tienda y no se
modifican por API.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `GET /bodegas-tienda` | Listar (paginado) | `200 Page<BodegaTiendaResponse>` |
| `GET /bodegas-tienda/{id}` | Consultar | `200 BodegaTiendaResponse` |
| `GET /bodegas-tienda/tienda/{tiendaId}` | Bodega de una tienda | `200 BodegaTiendaResponse` |

```json
// BodegaTiendaResponse
{ "id": "uuid", "tiendaId": "uuid", "tiendaNombre": "Tienda Centro", "tiendaUbicacion": "Bogotá",
  "inventario": [ { "varianteId": "uuid", "aLaMano": 5, "disponibleParaUso": 5 } ] }
```

En el listado algunos datos de tienda pueden llegar como `null` y `inventario`
puede venir vacío. El cliente debe tolerar ambos casos.

### Prioridad de centros por tienda — `/api/v1/tiendas/{tiendaId}/prioridad-cd`

Requieren `inventario:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `PUT /tiendas/{tiendaId}/prioridad-cd` | Reemplazar el orden de CD de la tienda | `200 PrioridadTiendaCdResponse[]` |
| `GET /tiendas/{tiendaId}/prioridad-cd` | Consultar el orden | `200 PrioridadTiendaCdResponse[]` |

```json
// Request (PUT): el orden es la posición de cada CD en la lista
{ "cdIds": ["uuid-cd-1", "uuid-cd-2"] }
```

```json
// PrioridadTiendaCdResponse
{ "id": "uuid", "tiendaId": "uuid", "cdId": "uuid", "ordenPrioridad": 1 }
```

## 8. Inventario

### Ajustes — `POST /api/v1/nodos/{nodoId}/inventario/ajustes`

Scope según el tipo de nodo: `inventario:administrar` para tiendas y
`inventario-cd:administrar` para centros de distribución. Un nodo de una tienda
ajena responde `404`.

```json
// Request
{
  "sku": "CAM-BAS-001",
  "delta": -2,
  "motivo": "MERMA",
  "comentario": "Prenda dañada en bodega"
}
```

- `sku` obligatorio. `delta` es un entero distinto de cero: positivo suma, negativo resta.
- `motivo`: `CONTEO_FISICO`, `INGRESO_MANUAL`, `MERMA` o `CORRECCION`.
- `comentario` opcional (máximo 500). Es obligatorio con `CORRECCION`.

Respuesta `201`:

```json
{
  "movimientoId": "uuid",
  "nodoId": "uuid",
  "sku": "CAM-BAS-001",
  "delta": -2,
  "motivo": "MERMA",
  "comentario": "Prenda dañada en bodega",
  "aLaMano": 3,
  "ocurridoEn": "2026-10-18T16:00:00Z"
}
```

Errores: `400` si el ajuste dejaría el stock en negativo, si el SKU no existe, si
la variante no está cargada en el nodo, o si `CORRECCION` viene sin comentario.
Estos códigos son provisionales: el equipo acordó mantener `400` por ahora y
confirmar los códigos en `develop`.

### Carga inicial — `POST /api/v1/nodos/{nodoId}/inventario/carga-inicial`

Scope: `inventario:administrar` (tiendas) o `inventario-cd:administrar` (CD).

```json
// Request
{
  "items": [
    { "sku": "CAM-BAS-001", "cantidad": 10 },
    { "sku": "CAM-BAS-002", "cantidad": 0 }
  ]
}
```

- `items` obligatorio, entre 1 y 500 elementos.
- `cantidad` es un entero mayor o igual a cero. Cero significa "se contó y no había".

Respuesta `201`:

```json
{ "nodoId": "uuid", "filasCreadas": 2, "unidadesTotales": 10 }
```

Errores: `409` si el nodo ya tiene inventario cargado para alguna de esas
variantes; `400` si un SKU no existe o el lote es inválido. El lote es todo o nada.

### Consultas de inventario

Requieren `inventario:consultar`. El alcance depende del usuario: un nodo de
una tienda fuera de sus asignaciones responde `404`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `GET /nodos/{nodoId}/inventario` | Stock de un nodo (paginado, orden por variante) | `200 Page<StockResponse>` |
| `GET /variantes/{varianteId}/inventario` | Stock de una variante en los nodos visibles | `200 StockResponse[]` |
| `GET /nodos/{nodoId}/inventario/movimientos` | Kardex de un nodo (paginado) | `200 Page<MovimientoKardexResponse>` |

Reglas de visibilidad:

- Sin acceso global, solo se ven nodos de tiendas asignadas.
- Un centro de distribución es visible para quien tiene `tiendas:operar-todas`
  o `inventario-cd:administrar`.

Stock de un nodo:

```json
// StockResponse
{ "nodoId": "uuid", "varianteId": "uuid", "aLaMano": 3, "disponibleParaUso": 3,
  "entrante": 0, "saliente": 0, "pronosticado": 3 }
```

`GET /variantes/{varianteId}/inventario` devuelve un arreglo de `StockResponse`,
sin paginar. Si el usuario no ve ningún nodo, devuelve `[]`, no `404`. Una
variante inexistente también devuelve `[]`.

Kardex: `GET /nodos/{nodoId}/inventario/movimientos?tipo=VENTA&desde=...&hasta=...&page=0&size=20`

- Ordenado por fecha ascendente.
- `tipo` opcional: `CARGA_INICIAL`, `AJUSTE`, `VENTA`, `ANULACION_VENTA`,
  `REPOSICION`, `TRASPASO_SALIDA` o `TRASPASO_ENTRADA`.
- `desde` y `hasta` opcionales, ISO-8601, inclusivos.

```json
// MovimientoKardexResponse
{ "id": "uuid", "varianteId": "uuid", "tipo": "AJUSTE", "cantidad": -2,
  "motivo": "MERMA", "comentario": "Prenda dañada en bodega", "forzado": false,
  "usuarioId": "uuid", "ocurridoEn": "2026-10-18T16:00:00Z" }
```

El kardex no incluye saldo resultante. Para el saldo, usar `aLaMano` del stock.

## 9. Ventas

### Ventas — `/api/v1/ventas`

| Método y ruta | Uso | Scope | Respuesta |
|---|---|---|---|
| `POST /ventas` | Registrar una venta | `ventas:registrar` | `201` nueva, `200` reintento |
| `GET /ventas` | Listar líneas de venta (paginado) | `ventas:consultar` | `200 Page<VentaResponse>` |
| `GET /ventas/{id}` | Consultar una línea por su id | `ventas:consultar` | `200 VentaResponse` |
| `POST /ventas/{id}/anular` | Anular una línea | `ventas:anular` | `200 VentaResponse` |
| `POST /ventas/transacciones/{transaccionId}/anular` | Anular toda la transacción | `ventas:anular` | `200 VentaResponse` |

Registrar venta:

```json
// Request
{
  "transaccionId": "550e8400-e29b-41d4-a716-446655440000",
  "tiendaId": "uuid",
  "canal": "FISICO",
  "forzarSinStock": false,
  "items": [
    { "sku": "CAM-BAS-001", "cantidad": 2, "precioUnitario": 89900.00 }
  ]
}
```

- `transaccionId` obligatorio. Es la clave de idempotencia: el mismo id devuelve
  la venta original con `200` y no vuelve a descontar.
- `tiendaId` obligatorio.
- `canal` opcional (máximo 30). Por defecto `FISICO`.
- `forzarSinStock` opcional. Vale `true` solo si el usuario tiene
  `ventas:forzar-sin-stock`; sin el scope responde `403`.
- `items` obligatorio, entre 1 y 200. `cantidad` mayor que cero;
  `precioUnitario` mayor o igual a cero, con hasta 2 decimales.
- El vendedor sale del token, nunca del body.

Respuesta:

```json
{
  "transaccionId": "550e8400-e29b-41d4-a716-446655440000",
  "tiendaId": "uuid",
  "vendedorId": "uuid",
  "fecha": "2026-10-18T16:00:00Z",
  "total": 179800.00,
  "lineas": [
    { "id": "uuid", "varianteId": "uuid", "cantidad": 2, "precioUnitario": 89900.00,
      "canal": "FISICO", "forzada": false, "estado": "REGISTRADA",
      "anuladaPor": null, "anuladaEn": null, "motivoAnulacion": null }
  ]
}
```

Errores: `409` si no hay stock suficiente y no se forzó (no se registra nada);
`400` por validación o SKU inexistente; `403` si se forzó sin el scope.

Listados y anulaciones:

- En `GET /ventas`, cada elemento de `content` es una línea de venta. Su
  `lineas` trae un solo elemento. Lo mismo en `GET /ventas/{id}` y en
  `POST /ventas/{id}/anular`, donde `{id}` es el id de la línea.
- `POST /ventas/transacciones/{transaccionId}/anular` anula todas las líneas y
  devuelve la transacción completa.
- Body de anulación: `{ "motivo": "Cliente devolvió el producto" }`
  (obligatorio, máximo 500).
- Filtros de `GET /ventas`: `tiendaId`, `varianteId`, `transaccionId`,
  `estado` (`REGISTRADA` o `ANULADA`), `desde`, `hasta`.
- Orden por defecto: fecha descendente. Para ordenar, usar el nombre de la
  propiedad interna: `sort=timestampVenta,desc`.

### Solicitudes no satisfechas — `/api/v1/solicitudes-no-satisfechas`

Se registran cuando un cliente pide algo que no hay en la tienda.

| Método y ruta | Uso | Scope | Respuesta |
|---|---|---|---|
| `POST /solicitudes-no-satisfechas` | Registrar | `ventas:registrar` | `201` nueva (con `Location`), `200` reintento |
| `GET /solicitudes-no-satisfechas` | Listar (paginado) | `ventas:consultar` | `200 Page<SolicitudNoSatisfechaResponse>` |
| `GET /solicitudes-no-satisfechas/{id}` | Consultar | `ventas:consultar` | `200 SolicitudNoSatisfechaResponse` |
| `POST /solicitudes-no-satisfechas/{id}/anular` | Anular | `ventas:anular` | `200 SolicitudNoSatisfechaResponse` |

```json
// Request (registrar)
{
  "tiendaId": "uuid",
  "varianteId": "uuid",
  "cantidad": 3,
  "claveIdempotencia": "solicitud-cliente-2026-10-18-001"
}
```

`cantidad` mayor que cero; `claveIdempotencia` obligatoria (máximo 100).

```json
// SolicitudNoSatisfechaResponse
{ "id": "uuid", "tiendaId": "uuid", "varianteId": "uuid", "cantidad": 3,
  "stockSistema": 0, "registradaEn": "2026-10-18T16:00:00Z", "registradoPor": "uuid",
  "claveIdempotencia": "solicitud-cliente-2026-10-18-001", "estado": "ACTIVA",
  "anuladaPor": null, "anuladaEn": null, "motivoAnulacion": null }
```

`estado` puede ser `ACTIVA` o `ANULADA`. `stockSistema` puede ser `null`.
Filtros del listado: `tiendaId`, `varianteId`, `estado`, `desde`, `hasta`.
Body de anulación: `{ "motivo": "..." }` (obligatorio, máximo 500).

### Ventanas de quiebre — `/api/v1/ventanas-quiebre`

Una ventana de quiebre registra el periodo en que una variante estuvo sin stock en una tienda.

| Método y ruta | Uso | Scope | Respuesta |
|---|---|---|---|
| `GET /ventanas-quiebre` | Listar (paginado) | `ventas:consultar` | `200 Page<VentanaQuiebreResponse>` |
| `GET /ventanas-quiebre/{id}` | Consultar | `ventas:consultar` | `200 VentanaQuiebreResponse` |
| `POST /ventanas-quiebre/reconciliar` | Reconciliar con el kardex | `inventario:administrar` | `200 ReconciliacionResponse` |

Filtros del listado: `tiendaId`, `varianteId`, `abierta` (`true` o `false`),
`desde`, `hasta`.

```json
// VentanaQuiebreResponse
{ "id": "uuid", "tiendaId": "uuid", "varianteId": "uuid",
  "fechaInicio": "2026-10-18T10:00:00Z", "fechaFin": null,
  "motivoCierre": null, "estado": "ABIERTA" }
```

`estado` puede ser `ABIERTA` o `CERRADA`. `motivoCierre` vale `null` mientras
está abierta; cuando se cierra puede ser `REPOSICION`, `VENTA_FORZADA`,
`TIENDA_DESACTIVADA` o `HISTORICO_NO_CLASIFICADO`.

Reconciliar:

```json
// Request
{
  "tiendaId": "uuid",
  "varianteId": "uuid",
  "desde": "2026-10-01T00:00:00Z",
  "hasta": "2026-10-18T00:00:00Z"
}
```

Solo `tiendaId` es obligatorio. `varianteId`, `desde` y `hasta` son opcionales.

```json
// ReconciliacionResponse
{ "paresProcesados": 4, "creadas": 1, "cerradas": 2, "corregidas": 0,
  "sinCambios": 1, "sinRespaldoEnKardex": 0 }
```

## 10. Reposición interna

Todas requieren `reposicion:administrar`.

### Umbrales — `/api/v1/umbrales-reposicion`

Un umbral define cuándo reponer, por variante o por categoría.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /umbrales-reposicion` | Crear | `201 UmbralReposicionResponse` |
| `GET /umbrales-reposicion` | Listar (paginado) | `200 Page<UmbralReposicionResponse>` |
| `GET /umbrales-reposicion/{id}` | Consultar | `200 UmbralReposicionResponse` |
| `PUT /umbrales-reposicion/{id}` | Cambiar cantidades | `200 UmbralReposicionResponse` |
| `DELETE /umbrales-reposicion/{id}` | Eliminar | `204` |

```json
// Request (crear): exactamente uno de varianteId o categoriaId
{
  "varianteId": "uuid",
  "categoriaId": null,
  "cantidadMinima": 5,
  "cantidadObjetivo": 20
}
```

```json
// Request (PUT): solo cantidades
{ "cantidadMinima": 5, "cantidadObjetivo": 25 }
```

Ambas cantidades son mayores que cero y `cantidadObjetivo` debe ser mayor que
`cantidadMinima`.

```json
// UmbralReposicionResponse
{ "id": "uuid", "varianteId": "uuid", "categoriaId": null,
  "cantidadMinima": 5, "cantidadObjetivo": 20 }
```

### Evaluación de reposición

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /reposicion-interna/evaluar` | Evaluar todas las tiendas | `200 EvaluacionMasivaResponse` |
| `POST /reposicion-interna/tiendas/{tiendaId}/evaluar` | Evaluar una tienda | `200 EvaluacionMasivaResponse` |

```json
// EvaluacionMasivaResponse
{ "traspasoEjecutados": 1,
  "traspasos": [ /* TraspasoInternoResponse[] */ ] }
```

### Traspasos internos

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /tiendas/{tiendaId}/traspasos-internos` | Registrar traspaso manual | `201 TraspasoInternoResponse` |
| `GET /tiendas/{tiendaId}/traspasos-internos` | Listar traspasos de la tienda (sin paginar) | `200 TraspasoInternoResponse[]` |
| `GET /traspasos-internos/{id}` | Consultar | `200 TraspasoInternoResponse` |

```json
// Request (traspaso manual)
{ "varianteId": "uuid", "cantidad": 4 }
```

`cantidad` es un entero mayor o igual a 1.

```json
// TraspasoInternoResponse
{ "id": "uuid", "varianteId": "uuid", "tiendaId": "uuid", "cantidad": 4,
  "origen": "MANUAL", "registradoPor": "uuid", "timestampTraspaso": "2026-10-18T16:00:00Z" }
```

`origen` puede ser `AUTOMATICO` (lo generó una evaluación) o `MANUAL`.
`registradoPor` es `null` en los automáticos.

## 11. Paginación

Los endpoints que devuelven `Page<T>` usan la estructura estándar de Spring:

```json
{
  "content": [],
  "pageable": {
    "pageNumber": 0,
    "pageSize": 20,
    "sort": { "empty": true, "sorted": false, "unsorted": true },
    "offset": 0,
    "paged": true,
    "unpaged": false
  },
  "totalPages": 1,
  "totalElements": 0,
  "last": true,
  "size": 20,
  "number": 0,
  "sort": { "empty": true, "sorted": false, "unsorted": true },
  "numberOfElements": 0,
  "first": true,
  "empty": true
}
```

Parámetros: `page` (empieza en 0), `size` (por defecto 20) y
`sort=campo,asc|desc`. Conviene consumir `content`, `number`, `size`,
`totalElements` y `totalPages`. Para `sort`, usar los nombres de propiedad de
la API cuando coincidan; en ventas, `timestampVenta` (ver §9).

## 12. CORS y consumo desde navegador

La configuración vive en `src/main/java/com/codefactory/supplychain/shared/config/CorsConfig.java`.

El origen permitido se configura con `CORS_ALLOWED_ORIGINS`, separado por
comas. **El valor por defecto es `http://localhost:8443`.** Si el frontend
corre en otro puerto, por ejemplo Vite en `5173`, hay que definir la variable:

```text
CORS_ALLOWED_ORIGINS=http://localhost:5173
```

Varios clientes:

```text
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

Métodos permitidos: `GET`, `POST`, `PUT`, `DELETE` y `OPTIONS`. Headers
permitidos: `Authorization`, `Content-Type` y `Accept`. Las credenciales están
habilitadas, así que el frontend debe incluir `credentials: "include"` en login,
refresh y logout:

```javascript
const response = await fetch("http://localhost:8080/api/v1/auth/login", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
});
```

```javascript
await fetch("http://localhost:8080/api/v1/auth/refresh", {
  method: "POST",
  credentials: "include"
});
```

Para llamadas protegidas:

```javascript
await fetch("http://localhost:8080/api/v1/categorias?page=0&size=20", {
  headers: {
    "Authorization": `Bearer ${accessToken}`,
    "Accept": "application/json"
  },
  credentials: "include"
});
```

La cookie de refresh se emite con `HttpOnly`, `Secure`, `SameSite=None` y path
`/api/v1/auth`. `SameSite=None` es necesario porque el frontend y la API
pueden estar en orígenes distintos. `Secure` exige HTTPS, pero los navegadores
modernos aceptan cookies `Secure` en `http://localhost`. Si el navegador no
guarda la cookie, revisar el origen y el uso de `credentials: "include"`. En
ningún caso el refresh token debe llegar a JavaScript.

## 13. Flujo recomendado del cliente

1. Llamar a `/auth/login` con `credentials: "include"`.
2. Si `mfaRequerido` es `true`, pedir el código y llamar a `/auth/login/mfa`.
3. Guardar el `accessToken` solo en memoria.
4. Enviar el access token como Bearer.
5. Ante el primer `401`, llamar una sola vez a `/auth/refresh`.
6. Reintentar la solicitud original con el nuevo access token.
7. Si refresh falla, limpiar la sesión y volver al login.
8. Ante `403`, no intentar refresh: el usuario no tiene el scope.
9. Ante `400`, `404` o `409`, mostrar `mensaje` y conservar los datos del formulario.
10. Antes de cerrar sesión, llamar a `/auth/logout`.

## 14. Scopes y roles

### Scopes

| Scope | Qué permite |
|---|---|
| `usuarios:administrar` | Usuarios, sus roles y sus tiendas |
| `roles:administrar` | Roles y sus scopes |
| `scopes:administrar` | Catálogo de scopes |
| `catalogo:administrar` | Categorías, templates y variantes |
| `tiendas:administrar` | Tiendas y bodegas de tienda (lectura) |
| `tiendas:operar-todas` | Acceso global a todas las tiendas, sin asignación |
| `cd:administrar` | Centros de distribución |
| `inventario:administrar` | Ajustes y carga inicial en tiendas; prioridad de CD; reconciliación de ventanas |
| `inventario-cd:administrar` | Ajustes y carga inicial en centros de distribución; ver CD |
| `inventario:consultar` | Stock, variante y kardex |
| `ventas:registrar` | Registrar ventas y solicitudes no satisfechas |
| `ventas:forzar-sin-stock` | Registrar ventas sin stock suficiente |
| `ventas:anular` | Anular ventas y solicitudes |
| `ventas:consultar` | Consultar ventas, solicitudes y ventanas de quiebre |
| `reposicion:administrar` | Umbrales, evaluación y traspasos internos |

### Roles sembrados

| Rol | Scopes |
|---|---|
| `VENDEDOR` | `ventas:registrar`, `ventas:consultar`, `inventario:consultar`, `ventas:forzar-sin-stock` |
| `SUPERVISOR_TIENDA` | Los de `VENDEDOR`, más `ventas:anular` e `inventario:administrar` |
| `OPERADOR_CD` | `inventario-cd:administrar`, `inventario:consultar` |
| `ADMIN` | Todos los scopes |

### Scope por controlador

| Ruta base | Scope |
|---|---|
| `/usuarios/**` | `usuarios:administrar` |
| `/roles/**` | `roles:administrar` |
| `/scopes/**` | `scopes:administrar` |
| `/categorias/**`, `/templates/**`, `/variantes/**` | `catalogo:administrar` |
| `/tiendas/**`, `/bodegas-tienda/**` | `tiendas:administrar` |
| `/centros-distribucion/**` | `cd:administrar` |
| `/tiendas/{id}/prioridad-cd` | `inventario:administrar` |
| `/nodos/{id}/inventario/ajustes`, `/carga-inicial` | `inventario:administrar` o `inventario-cd:administrar` según el nodo |
| `/nodos/**/inventario`, `/variantes/**/inventario` (consultas) | `inventario:consultar` |
| `/ventas/**` | `ventas:registrar`, `ventas:consultar` o `ventas:anular` según la acción |
| `/solicitudes-no-satisfechas/**` | `ventas:registrar`, `ventas:consultar` o `ventas:anular` según la acción |
| `/ventanas-quiebre/**` | `ventas:consultar`; `reconciliar` requiere `inventario:administrar` |
| `/umbrales-reposicion/**`, `/reposicion-interna/**`, `/tiendas/{id}/traspasos-internos`, `/traspasos-internos/**` | `reposicion:administrar` |

Las rutas `/auth/**` (salvo `logout`, que es público), `/mfa/**` y el
`/swagger-ui/**` son accesibles sin scope.
