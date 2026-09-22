# ZARA-code-factory-frontend

## Desarrollo local

1. Copiar `.env.example` a `.env.local`.
2. Ajustar `VITE_API_URL` a la URL del backend, incluyendo `/api/v1`.
3. Ejecutar `pnpm install` y `pnpm dev`.

Si `VITE_API_URL` no está definida, el modo de desarrollo usa
`http://localhost:8080/api/v1` como fallback. En producción la variable es
obligatoria y el build falla si no está definida.

## Despliegue en Vercel

Vercel puede detectar este proyecto como una aplicación Vite con esta
configuración:

- **Framework preset:** Vite
- **Build command:** `pnpm run build`
- **Output directory:** `dist`
- **Install command:** `pnpm install`
- **Environment variable:** `VITE_API_URL=https://<dominio-del-backend>/api/v1`

La variable `VITE_API_URL` se incorpora en el build del frontend; cambiarla en
Vercel requiere volver a desplegar. No debe contener secretos.

### Requisitos del backend

Como el cliente usa `credentials: 'include'` para la sesión y el refresh del
token, el backend debe:

- permitir por CORS el dominio exacto de Vercel (no `*`);
- permitir credenciales;
- emitir cookies compatibles con un frontend cross-origin (`Secure` y,
  normalmente, `SameSite=None`);
- estar disponible por HTTPS.

El endpoint de la API se puede editar desde la interfaz para facilitar
desarrollo y diagnóstico, pero en producción la configuración recomendada es
la variable de entorno de Vercel.