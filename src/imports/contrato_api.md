# Contrato técnico de la API REST

## 1. Datos generales

| Elemento | Valor |
|---|---|
| Base URL local | `http://localhost:8080` |
| Prefijo | `/api/v1` |
| Formato | JSON (`Content-Type: application/json`) |
| Identificadores | UUID |
| Fechas | ISO-8601, por ejemplo `2026-09-21T16:00:00Z` |
| Documentación interactiva | `/swagger-ui/index.html` |
| Documento OpenAPI | `/v3/api-docs` |

Las rutas protegidas reciben el access token así:

```http
Authorization: Bearer <accessToken>
```

El refresh token no se devuelve en JSON. El backend lo envía como cookie
HttpOnly llamada `refresh_token`, con path `/api/v1/auth`.

## 2. Convenciones de respuesta

### Operaciones exitosas

- `200 OK`: consulta o actualización exitosa.
- `201 Created`: creación exitosa.
- `204 No Content`: operación exitosa sin cuerpo, por ejemplo logout, eliminación,
  desactivación o asignación de una relación.

### Errores

El cuerpo de error tiene esta forma:

```json
{
  "mensaje": "Descripción legible del problema"
}
```

| Estado | Significado | Tratamiento recomendado |
|---|---|---|
| `400` | JSON inválido, campo obligatorio ausente o regla de negocio incumplida | Mostrar el mensaje y/o errores del formulario |
| `401` | Access token ausente, inválido o expirado | Intentar `POST /auth/refresh`; si falla, volver al login |
| `403` | Token válido, pero sin el scope requerido | Mostrar acceso denegado; no repetir login |
| `404` | Recurso inexistente | Mostrar “no encontrado” |
| `409` | Duplicado o conflicto de integridad | Informar el conflicto y conservar los datos del formulario |
| `500` | Error inesperado del servidor | Mostrar error genérico y registrar el detalle en el cliente |

Los cuerpos no válidos también producen `400`. Las validaciones se ejecutan en
el backend, pero el frontend debe validarlas previamente para mejorar la
experiencia.

## 3. Autenticación

### `POST /api/v1/auth/login`

Público. Inicia sesión con email y contraseña.

Request:

```json
{
  "email": "admin@supplychain.local",
  "password": "<contraseña-configurada>"
}
```

Reglas: `email` es obligatorio, válido y de máximo 255 caracteres; `password`
es obligatorio y de máximo 128 caracteres.

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
    "creadoEn": "2026-09-21T16:00:00Z"
  }
}
```

Además, la respuesta incluye `Set-Cookie: refresh_token=...`.

Respuesta cuando se requiere MFA (`200`):

```json
{
  "mfaRequerido": true,
  "mfaChallengeToken": "<token-temporal>",
  "accessToken": null,
  "usuario": null
}
```

Errores frecuentes: `400` por datos inválidos, `401` por credenciales
incorrectas o usuario no habilitado.

### `POST /api/v1/auth/login/mfa`

Público. Completa el login que respondió `mfaRequerido: true`.

Request:

```json
{
  "mfaChallengeToken": "<token-temporal>",
  "codigo": "123456"
}
```

`codigo` puede ser un código TOTP de seis dígitos o un código de respaldo.
Respuesta: la misma respuesta de login completado y la cookie de refresh.

Errores frecuentes: `400` por campos vacíos o `401` por token/código inválido o
expirado.

### `POST /api/v1/auth/refresh`

Público, pero requiere que el navegador envíe la cookie de refresh. Devuelve un
nuevo access token y reemplaza la cookie.

Response (`200`):

```json
{
  "accessToken": "<nuevo-jwt>"
}
```

No se debe enviar el refresh token en el body ni guardarlo en
`localStorage`. Errores frecuentes: `401` si no existe, expiró o fue revocado.

### `POST /api/v1/auth/logout`

Público e idempotente. Invalida el refresh token si existe y limpia la cookie.
Devuelve `204` sin cuerpo. El frontend puede llamarlo incluso si localmente ya
no tiene una sesión válida.

## 4. MFA del usuario autenticado

Todas las rutas de esta sección requieren `Authorization: Bearer <jwt>`.

### `POST /api/v1/mfa/activar`

Activa el proceso MFA para el usuario del token. No recibe body.

Response (`200`):

```json
{
  "secreto": "JBSWY3DPEHPK3PXP",
  "qrCodeDataUri": "data:image/png;base64,..."
}
```

El frontend puede asignar `qrCodeDataUri` directamente al atributo `src` de un
`<img>`. El secreto es sensible y no debe mostrarse innecesariamente.

### `POST /api/v1/mfa/confirmar`

Confirma MFA usando el código de seis dígitos.

Request:

```json
{
  "codigo": "123456"
}
```

Response (`200`):

```json
{
  "codigosRespaldo": [
    "AB12-CD34",
    "EF56-GH78"
  ]
}
```

Los códigos de respaldo se muestran una sola vez. Errores frecuentes: `400`
por código inválido o MFA ya configurado, `401` por token ausente.

## 5. Usuarios, roles y scopes

### Usuarios — `/api/v1/usuarios`

Todas las operaciones requieren `usuarios:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /usuarios` | Crear usuario | `201 UsuarioResponse` |
| `GET /usuarios` | Listar usuarios | `200 UsuarioResponse[]` |
| `GET /usuarios/{id}` | Consultar usuario | `200 UsuarioResponse` |
| `GET /usuarios/{id}/roles` | Listar roles del usuario | `200 RolResponse[]` |
| `POST /usuarios/{id}/roles` | Asignar rol | `204` |
| `DELETE /usuarios/{id}/roles/{rolId}` | Quitar rol | `204` |

Crear usuario:

```json
{
  "email": "usuario@empresa.com",
  "nombreCompleto": "Nombre del usuario",
  "password": "UnaClaveDeAlMenos12"
}
```

`email` y `nombreCompleto` son obligatorios; la contraseña debe tener entre 12
y 128 caracteres.

Asignar rol:

```json
{
  "rolId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Roles — `/api/v1/roles`

Todas las operaciones requieren `roles:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /roles` | Crear rol | `201 RolResponse` |
| `GET /roles` | Listar roles | `200 RolResponse[]` |
| `GET /roles/{id}` | Consultar rol | `200 RolResponse` |
| `PUT /roles/{id}` | Actualizar rol | `200 RolResponse` |
| `DELETE /roles/{id}` | Eliminar rol | `204` |
| `GET /roles/{id}/scopes` | Listar scopes del rol | `200 ScopeResponse[]` |
| `POST /roles/{id}/scopes` | Asignar scope | `204` |
| `DELETE /roles/{id}/scopes/{scopeId}` | Quitar scope | `204` |

Request de crear/actualizar:

```json
{
  "nombre": "OPERADOR",
  "descripcion": "Permisos de operación"
}
```

`nombre` es obligatorio y admite hasta 100 caracteres; `descripcion` admite
hasta 255 caracteres.

Asignar scope:

```json
{
  "scopeId": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Scopes — `/api/v1/scopes`

Todas las operaciones requieren `scopes:administrar`.

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

`codigo` es obligatorio y admite hasta 100 caracteres; `descripcion` admite
hasta 255 caracteres; `sensible` es booleano.

### Modelos de identidad

```json
{
  "id": "uuid",
  "email": "usuario@empresa.com",
  "nombreCompleto": "Nombre del usuario",
  "estado": "ACTIVO",
  "creadoEn": "2026-09-21T16:00:00Z"
}
```

```json
{
  "id": "uuid",
  "nombre": "OPERADOR",
  "descripcion": "Permisos de operación",
  "creadoEn": "2026-09-21T16:00:00Z"
}
```

```json
{
  "id": "uuid",
  "codigo": "catalogo:administrar",
  "descripcion": "Administrar el catálogo",
  "sensible": true,
  "creadoEn": "2026-09-21T16:00:00Z"
}
```

## 6. Catálogo

Todas las rutas de esta sección requieren `catalogo:administrar`.

### Categorías — `/api/v1/categorias`

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /categorias` | Crear categoría | `201 CategoriaResponse` |
| `GET /categorias` | Listar categorías paginadas | `200 Page<CategoriaResponse>` |
| `GET /categorias/{id}` | Consultar categoría | `200 CategoriaResponse` |
| `PUT /categorias/{id}` | Actualizar categoría | `200 CategoriaResponse` |
| `DELETE /categorias/{id}` | Eliminar categoría | `204` |

Request:

```json
{
  "nombre": "Camisas"
}
```

`nombre` es obligatorio y admite hasta 150 caracteres.

### Templates — `/api/v1/templates`

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /templates` | Crear template | `201 TemplateResponse` |
| `GET /templates` | Listar templates paginados | `200 Page<TemplateResponse>` |
| `GET /templates/{id}` | Consultar template | `200 TemplateResponse` |
| `PUT /templates/{id}` | Actualizar template | `200 TemplateResponse` |
| `DELETE /templates/{id}` | Eliminar template | `204` |

Request:

```json
{
  "nombre": "Camisa básica",
  "temporada": "2026-Otoño",
  "proveedor": "Proveedor Textil",
  "precioBase": 89900.00,
  "categoriaId": "550e8400-e29b-41d4-a716-446655440000"
}
```

`nombre` y `categoriaId` son obligatorios. `temporada` admite 50 caracteres,
`proveedor` 150 y `precioBase` es opcional, pero no puede ser negativo. El
`PUT` mantiene la categoría actual; `categoriaId` se recibe por la forma común
del DTO, pero la operación de aplicación no reasigna la categoría.

### Variantes — `/api/v1/variantes`

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /variantes` | Crear variante | `201 VarianteResponse` |
| `GET /variantes` | Listar variantes paginadas | `200 Page<VarianteResponse>` |
| `GET /variantes/{id}` | Consultar variante | `200 VarianteResponse` |
| `GET /variantes/sku/{sku}` | Consultar por SKU | `200 VarianteResponse` |
| `PUT /variantes/{id}` | Actualizar variante | `200 VarianteResponse` |
| `DELETE /variantes/{id}` | Eliminar variante | `204` |

Request:

```json
{
  "sku": "CAM-BAS-001",
  "talla": "M",
  "color": "Negro",
  "templateId": "550e8400-e29b-41d4-a716-446655440000"
}
```

`sku` y `templateId` son obligatorios. `sku` admite 60 caracteres, `talla` 20
y `color` 50; talla y color pueden ser nulos.

### Respuesta paginada

Los endpoints que devuelven `Page<T>` usan la estructura estándar de Spring:

```json
{
  "content": [],
  "pageable": {
    "pageNumber": 0,
    "pageSize": 20,
    "sort": {
      "empty": true,
      "sorted": false,
      "unsorted": true
    },
    "offset": 0,
    "paged": true,
    "unpaged": false
  },
  "totalPages": 1,
  "totalElements": 0,
  "last": true,
  "size": 20,
  "number": 0,
  "sort": {
    "empty": true,
    "sorted": false,
    "unsorted": true
  },
  "numberOfElements": 0,
  "first": true,
  "empty": true
}
```

El cliente puede enviar `?page=0&size=20&sort=nombre,asc`. `page` comienza en
0. Conviene consumir principalmente `content`, `number`, `size`,
`totalElements` y `totalPages`.

## 7. Red de inventario

### Tiendas — `/api/v1/tiendas`

Todas las operaciones requieren `tiendas:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /tiendas` | Crear tienda | `201 TiendaResponse` |
| `GET /tiendas` | Listar tiendas paginadas | `200 Page<TiendaResponse>` |
| `GET /tiendas/{id}` | Consultar tienda | `200 TiendaResponse` |
| `PUT /tiendas/{id}` | Actualizar tienda | `200 TiendaResponse` |
| `DELETE /tiendas/{id}` | Desactivar tienda | `204` |
| `PUT /tiendas/{id}/activar` | Activar tienda | `200 TiendaResponse` |

Request:

```json
{
  "nombre": "Tienda Centro",
  "ubicacion": "Bogotá"
}
```

`nombre` es obligatorio y admite hasta 150 caracteres; `ubicacion` admite hasta
255. El `DELETE` es una desactivación lógica, no un borrado físico.

Response:

```json
{
  "id": "uuid",
  "nombre": "Tienda Centro",
  "ubicacion": "Bogotá",
  "estado": "ACTIVA",
  "creadoEn": "2026-09-21T16:00:00Z",
  "actualizadoEn": "2026-09-21T16:00:00Z"
}
```

### Centros de distribución — `/api/v1/centros-distribucion`

Todas las operaciones requieren `cd:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /centros-distribucion` | Crear centro | `201 CentroDistribucionResponse` |
| `GET /centros-distribucion` | Listar/filtrar centros | `200 Page<CentroDistribucionResponse>` |
| `GET /centros-distribucion/{id}` | Consultar centro con nodo | `200 CentroDistribucionConNodoResponse` |
| `PUT /centros-distribucion/{id}` | Actualizar centro | `200 CentroDistribucionResponse` |
| `DELETE /centros-distribucion/{id}` | Eliminar centro | `204` |

Filtros opcionales del listado: `id`, `nombre`, `ubicacion`, además de
`page`, `size` y `sort`.

Request:

```json
{
  "nombre": "CD Principal",
  "ubicacion": "Bogotá"
}
```

Response del listado:

```json
{
  "id": "uuid",
  "nombre": "CD Principal",
  "ubicacion": "Bogotá"
}
```

Response individual:

```json
{
  "id": "uuid",
  "nombre": "CD Principal",
  "ubicacion": "Bogotá",
  "nodo": {
    "id": "uuid",
    "tipo": "CD",
    "cdId": "uuid",
    "tiendaId": null
  }
}
```

### Bodegas de tienda — `/api/v1/bodegas-tienda`

Todas las operaciones requieren `tiendas:administrar`.

| Método y ruta | Uso | Respuesta |
|---|---|---|
| `POST /bodegas-tienda` | Registrar bodega | `201 BodegaTiendaResponse` |
| `GET /bodegas-tienda` | Listar bodegas paginadas | `200 Page<BodegaTiendaResponse>` |
| `GET /bodegas-tienda/{id}` | Consultar bodega | `200 BodegaTiendaResponse` |
| `GET /bodegas-tienda/tienda/{tiendaId}` | Consultar bodega de una tienda | `200 BodegaTiendaResponse` |
| `PUT /bodegas-tienda/{id}` | Cambiar la tienda asociada | `200 BodegaTiendaResponse` |
| `DELETE /bodegas-tienda/{id}` | Eliminar bodega | `204` |

Request:

```json
{
  "tiendaId": "550e8400-e29b-41d4-a716-446655440000"
}
```

Response:

```json
{
  "id": "uuid",
  "tiendaId": "uuid",
  "tiendaNombre": "Tienda Centro",
  "tiendaUbicacion": "Bogotá",
  "inventario": []
}
```

En el listado simple algunos datos de tienda pueden llegar como `null` y
`inventario` como una lista vacía. El cliente debe tolerar ambos casos.

## 8. CORS y consumo desde navegador

La configuración vive en:

`src/main/java/com/codefactory/supplychain/shared/config/CorsConfig.java`

El origen permitido se configura con `CORS_ALLOWED_ORIGINS`, separado por
comas. El valor local por defecto es:

```text
http://localhost:5173
```

Ejemplo con varios clientes:

```text
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

Se permiten `GET`, `POST`, `PUT`, `DELETE` y `OPTIONS`, además de los headers
`Authorization`, `Content-Type` y `Accept`. Las credenciales están habilitadas.
Por eso el frontend debe incluir credenciales en refresh/logout:

```javascript
await fetch("http://localhost:8080/api/v1/auth/refresh", {
  method: "POST",
  credentials: "include"
});
```

En login también conviene incluir `credentials: "include"` para aceptar la
cookie:

```javascript
const response = await fetch("http://localhost:8080/api/v1/auth/login", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password })
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

La cookie de refresh se crea con `HttpOnly`, `Secure`, `SameSite=Strict` y path
`/api/v1/auth`. En un entorno local HTTP, `Secure` puede impedir que el
navegador la envíe; para desarrollo se debe usar HTTPS local o configurar
explícitamente una variante segura para ese ambiente, sin exponer el refresh
token a JavaScript.

## 9. Flujo recomendado del cliente

1. Llamar a `/auth/login` con `credentials: "include"`.
2. Si `mfaRequerido` es `true`, pedir el código y llamar a `/auth/login/mfa`.
3. Guardar el `accessToken` solamente en memoria si es posible.
4. Enviar el access token como Bearer.
5. Ante el primer `401`, llamar una sola vez a `/auth/refresh` con credenciales.
6. Reintentar la solicitud original con el nuevo access token.
7. Si refresh falla, limpiar la sesión y volver al login.
8. Ante `403`, no intentar refresh: el usuario no tiene el scope.
9. Antes de desmontar la aplicación o cerrar sesión, llamar a `/auth/logout`.

## 10. Scopes disponibles en los controladores

| Scope | Rutas |
|---|---|
| `usuarios:administrar` | `/usuarios/**` |
| `roles:administrar` | `/roles/**` |
| `scopes:administrar` | `/scopes/**` |
| `catalogo:administrar` | `/categorias/**`, `/templates/**`, `/variantes/**` |
| `tiendas:administrar` | `/tiendas/**`, `/bodegas-tienda/**` |
| `cd:administrar` | `/centros-distribucion/**` |

Este documento describe el contrato expuesto actualmente por los
controladores. No incluye funcionalidades que todavía no tienen endpoint REST,
como movimientos de inventario, ventas, pedidos, reportes o recuperación de
contraseña.
