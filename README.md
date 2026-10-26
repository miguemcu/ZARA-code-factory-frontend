# ZARA-code-factory-frontend

Este repositorio contiene la interfaz de usuario (Frontend) para la plataforma de gestión y optimización de cadena de suministro tipo **Zara**, desarrollada como parte del proyecto **CodeF@ctory**.

La aplicación funciona como un cliente interactivo diseñado para consumir y validar las capacidades expuestas por la API REST del backend desarrollado en Spring Boot, disponible en el repositorio [Dalev10/ZARA-code-factory](https://github.com/Dalev10/ZARA-code-factory).

---

## 🎨 Identidad Visual y Experiencia de Usuario (UX)

El diseño sigue una línea editorial **minimalista e industrial de alta gama**, inspirada en los portales de e-commerce y gestión de retail moderno:

- **Estilo:** Bordes ultra finos de 1px, tipografía *Sans-Serif* e *Instrument Sans / DM Mono* limpia, maquetación basada en retícula y alto contraste.
- **Paleta de colores:** Fondo blanco monocromático (`#FFFFFF` / `#F9F9F9`) con acentos y textos en carbón oscuro (`#111111`).
- **Diseño funcional:** Sin elementos decorativos innecesarios o librerías de imágenes. Todo el flujo se enfoca en tablas de datos paginadas, formularios con selectores dinámicos y paneles de administración claros.
- **Idioma de la interfaz:** 100% en español.

---

## 🚀 Alcance Funcional (Sprint 1)

El frontend permite interactuar con los siguientes módulos del backend:

### 1. Autenticación y Seguridad
- **Inicio de sesión:** Autenticación por correo y contraseña.
- **Desafío MFA:** Soporte para autenticación de dos factores (TOTP) mediante app autenticadora o códigos de respaldo.
- **Configuración de MFA:** Visualización directa del código QR (Base64) y generación de códigos de respaldo únicos.
- **Gestión de Sesión:** Manejo transparente de Access Tokens (JWT en memoria) y Refresh Tokens mediante cookies `HttpOnly`.

### 2. Identidad y Control de Acceso (RBAC)
- **Usuarios:** Listado paginado, creación de usuarios y gestión de asignación de roles.
- **Roles y Permisos (Scopes):** Administración de roles y asignación/desasignación dinámica de permisos granulares (`usuarios:administrar`, `catalogo:administrar`, `tiendas:administrar`, `cd:administrar`, etc.).

### 3. Catálogo de Productos
- **Categorías:** Registro, edición y listado de categorías.
- **Templates (Plantillas):** Creación y consulta de plantillas asociadas a categorías (con selectores dinámicos para evitar la digitación manual de UUIDs).
- **Variantes y SKUs:** Gestión de variantes por talla y color, con buscador dedicado por SKU.

### 4. Red Logística de Inventario
- **Tiendas:** Listado paginado y acciones de desactivación/reactivación lógica.
- **Centros de Distribución (CD):** Consulta y filtrado de centros de distribución junto con la información de su nodo logístico asociado.
- **Bodegas de Tienda:** Registro y vinculación de bodegas con tiendas físicas.

---

## 🛠️ Desarrollo local

1. Copiar `.env.example` a `.env.local`.
2. Ajustar `VITE_API_URL` a la URL del backend, incluyendo `/api/v1`.
3. Ejecutar `pnpm install` y `pnpm dev`.

Si `VITE_API_URL` no está definida, el modo de desarrollo usa `http://localhost:8080/api/v1` como fallback. En producción la variable es obligatoria y el build falla si no está definida.

---

## ☁️ Despliegue en Vercel

> Actualmente [desplegado](https://supplychainmanager.vercel.app/) y funcionando.

Vercel puede detectar este proyecto como una aplicación Vite con esta configuración:

- **Framework preset:** Vite
- **Build command:** `pnpm run build`
- **Output directory:** `dist`
- **Install command:** `pnpm install`
- **Environment variable:** `VITE_API_URL=https://<dominio-del-backend>/api/v1`

La variable `VITE_API_URL` se incorpora en el build del frontend; cambiarla en Vercel requiere volver a desplegar. No debe contener secretos.

### Requisitos del backend

Como el cliente usa `credentials: 'include'` para la sesión y el refresh del token, el backend debe:

- Permitir por CORS el dominio exacto de Vercel (no `*`).
- Permitir credenciales (`allowCredentials: true`).
- Emitir cookies compatibles con un frontend cross-origin (`Secure` y, normalmente, `SameSite=None`).
- Estar disponible por HTTPS.

El endpoint de la API se puede editar desde la interfaz para facilitar desarrollo y diagnóstico, pero en producción la configuración recomendada es la variable de entorno de Vercel.
