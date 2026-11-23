# figma-make-app

React + Vite + Tailwind CSS project running inside Figma Make.

## Qué es este proyecto

RETAIL OS es el frontend de la API de cadena de suministro (curso Arquitectura de Software, UdeA). **La API es el desarrollo principal**: la interfaz es minimalista y deja ver las llamadas (línea `MÉTODO {baseUrl}/ruta` bajo cada botón, consola API abajo con request/response, código HTTP en cada aviso).

- **Sprint 2 (ya existe):** login y MFA, administración (usuarios, roles, catálogo, red logística), inventario, ventas y reposición interna (`App.tsx`, `Operations.tsx`).
- **Sprint 3 (demo del ciclo de abastecimiento):** venta → recomendación → orden con fallback de CD → despacho → viaje → salida/llegada → recepción con faltante → cierre. El contrato, el brief de pantallas, el guion y respuestas reales están en `src/imports/` (`frontend-contrato.md`, `frontend-brief-figma.md`, `guion-review-sprint3.md`, `mock-data/*.json`). Leerlos antes de tocar el ciclo.

Reglas que no se negocian:

- **No rediseñar lo existente.** Mismos tokens y primitivos: Instrument Sans / DM Mono, ink/muted/faint/rule/surface, bordes de 1px, sin radios ni sombras, textos en español.
- **Nombres, no UUID.** Mostrar "Tienda Demo Centro", "CD Demo Principal", "DEMO-S3-AZ-M · Camisa Oxford · Azul · M"; "—" si no se conoce. El id completo solo en la consola o al pasar el cursor.
- **Estados:** nombre amigable + valor real en mono gris ("● Por revisar  BORRADOR"); color solo como punto o badge pequeño.
- **Nunca registrar** tokens, contraseñas, códigos MFA ni la cookie (la consola recibe los cuerpos ya redactados desde `api.ts`).
- La API no dice qué rol tiene el usuario (no hay `/me`): el **menú sale del rol elegido** en el selector de la demo.

Archivos del Sprint 3:

- `src/ui.tsx` — primitivos compartidos (Btn, Badge, Banner con 422 y código HTTP, Modal, Table, Field, Shell, CallLine, StatusTag, estados vacío/cargando). Las vistas nuevas importan de aquí; `App.tsx` y `Operations.tsx` todavía tienen sus copias (migrarlas es trabajo pendiente, sin cambiar el aspecto).
- `src/demo.ts` — roles de demo (correo, scopes), directorio id → nombre (datos sembrados + lo aprendido de las respuestas, en localStorage) y tipos del ciclo.
- `src/mock.ts` — modo simulado: con `mock://demo` en el ApiBar, `http.*` responde desde `mock-data` con la misma forma, códigos y mensajes, y simula el ciclo para poder recorrer la demo en orden.
- `src/ApiConsole.tsx`, `src/RoleSelect.tsx`, `src/Abastecimiento.tsx` — consola API, selector de rol y vistas del ciclo.

## Ramas

- `main` — lo desplegado (Vercel). Solo recibe merges desde `develop` por PR.
- `develop` — integración. Las ramas de trabajo salen de aquí y vuelven por PR.
- `feat/<tema>`, `fix/<tema>`, `chore/<tema>`, `docs/<tema>` — una rama por entrega (p. ej. `feat/vistas-sprint-2`, `feat/demo-sprint-3`). Nunca se trabaja ni se hace commit directo en `main` o `develop`.
- Commits pequeños con Conventional Commits en español: `tipo(ámbito): descripción` (`feat(abastecimiento): …`, `fix(api): …`, `docs(agents): …`).

Antes de hacer commit: `npx tsc --noEmit -p .` y `VITE_API_URL=http://localhost:8080/api/v1 npx vite build` deben pasar.

## Development Server

A Vite development server is **already running** on `$PORT` (default 8443). You don't need to start it manually.

- Preview URL: The user can access the running app through the preview panel
- Hot reload: Changes to source files are reflected immediately

## Project Structure

This is the canonical project structure. Start with task-relevant files below. Only follow imports or inspect other files when required, when a documented path is missing, or when the repository contradicts this guide.

- `src/main.tsx` - React entrypoint; imports `src/index.css` and mounts `src/App.tsx` into the `#root` element
- `src/App.tsx` - Primary application component and the usual starting point for UI work
- `src/index.css` - Global CSS entrypoint and Tailwind CSS v4 import
- `index.html` - Vite HTML shell containing the `#root` element and loading `src/main.tsx`
- `package.json` - Project dependencies and the Vite build, development, preview, and formatting scripts
- `vite.config.ts` - Vite configuration with React, Tailwind CSS v4, and Figma Make plugins plus the `@` alias for `src`
- `.mise.toml` - Toolchain versions for Node.js and pnpm

## Dependencies

- Runtime: React 19 and React DOM 19
- Styling: Tailwind CSS v4 with the `@tailwindcss/vite` plugin
- Build tooling: Vite 8, TypeScript 5.7, and `@vitejs/plugin-react`
- Formatting: oxfmt

## Styling

This project uses **Tailwind CSS v4** through the `@tailwindcss/vite` plugin configured in `vite.config.ts`. `src/index.css` imports Tailwind with `@import 'tailwindcss';`. Use Tailwind utility classes directly in JSX and put global CSS or Tailwind v4 theme customization in `src/index.css`. This scaffold does not need a Tailwind config file or PostCSS config.

`src/main.tsx` imports `src/index.css`, so global font wiring belongs in `src/index.css`. Keep CSS `@import` statements first, then add any `@font-face` rules and font-family defaults there.
