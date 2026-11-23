# Brief de diseño: pantallas de la demo del Sprint 3

Para quien diseña en Figma. Describe qué ve y qué hace cada persona en el ciclo de abastecimiento, con ejemplos que salen del sistema real (no inventados). El detalle técnico para quien programa está en [frontend-contrato.md](frontend-contrato.md); los datos de ejemplo completos, en [mock-data/](mock-data/README.md).

## La historia que cuenta la demo

Una tienda vende una camisa. El sistema nota que la tienda se está quedando sin existencias y **sugiere pedir** más al centro de distribución. El planificador **aprueba** el pedido y el sistema busca **qué centro tiene** la mercancía. El centro **despacha**, el coordinador **arma un viaje** con varias tiendas, registra **la salida y la llegada**, y en la tienda el encargado **recibe** lo que llegó. Si llegó menos de lo enviado, el pedido queda **reabierto** hasta que se complete o se **cierre aceptando el faltante**.

Ocho pasos, seis personas:

| Paso | Qué pasa | Quién | Pantalla |
| :---: | :--- | :--- | :--- |
| 1 | Se registra una venta y nace una sugerencia de pedido | Vendedor | Registrar venta → (sola) Recomendaciones |
| 2 | Se aprueba, edita o rechaza la sugerencia | Planificador | Recomendaciones |
| 3 | El pedido busca un centro con mercancía | Planificador | Detalle de orden |
| 4 | El centro despacha | Operador del CD | Despacho |
| 5 | Se arma el viaje | Coordinador de transporte | Armar viaje |
| 6 | Salida del CD y llegada a cada tienda | Coordinador de transporte | Salida y llegada |
| 7 | La tienda recibe y anota diferencias | Encargado de bodega | Paradas por recibir y recepción |
| 8 | Se cierra el pedido con faltante (o se vuelve a despachar) | Planificador | Cerrar con faltante |

Además, todas las personas pueden ver el **Inventario por ubicación** (con sus restricciones).

---

## Pantallas que ya existen y pantallas nuevas

Revisado en el código del frontend (`ZARA-code-factory-frontend`, rama `main`, commit `ad215c7`):

| Ya existen (Sprint 2) | Nuevas para el Sprint 3 |
| :--- | :--- |
| Login y código de segundo factor | Selector de rol para la demo y menú por rol |
| Perfil: activar segundo factor | Recomendaciones (aprobar, editar, rechazar) |
| Punto de venta: carrito, historial, solicitudes no satisfechas, ventanas de quiebre | Detalle de orden (intentos de CD, ciclos, cierre) |
| Inventario: stock por ubicación, stock por producto, carga inicial, ajuste, movimientos | Despacho y ciclos pendientes de viaje |
| Reposición interna: umbrales, evaluación, traspasos | Armar viaje |
| Administración: usuarios, roles, permisos, categorías, plantillas, productos, tiendas, centros, bodegas | Salida y llegada de paradas |
| | Paradas por recibir y recepción con discrepancia |
| | Cerrar con faltante y cancelar |

**Cambios en pantallas existentes:** el menú actual es el mismo para todos (no cambia según el rol). El **Inventario** ya muestra las existencias, pero para esta demo tiene que destacar las cinco cantidades (A la mano, Entrante, Saliente, Disponible, Pronosticado). Hoy las pantallas de tienda piden pegar el id cuando el usuario no puede ver el listado de tiendas ("Sin acceso al listado de tiendas: pega el ID"); en la demo eso no debe pasar (ver "Navegación").

**Pregunta abierta:** ¿se rediseñan las pantallas del Sprint 2 con el estilo nuevo o solo se diseñan las del Sprint 3?

---

## Navegación por rol y selector de rol

### Selector de rol (solo demo)

Antes del login, o como primera pantalla, una tarjeta por rol para elegir con quién entrar. Al elegir, el correo del usuario de demo queda escrito en el login y solo falta la contraseña. Así el presentador cambia de persona en segundos.

| Rol (texto en pantalla) | Descripción corta para la tarjeta |
| :--- | :--- |
| Vendedor | Registra ventas en sus tiendas |
| Supervisor de tienda | Supervisa ventas, anulaciones e inventario de sus tiendas |
| Planificador de abastecimiento | Decide qué pedir a los centros de distribución |
| Operador de CD | Despacha los pedidos desde el centro de distribución |
| Coordinador de transporte | Arma los viajes y registra salidas y llegadas |
| Encargado de bodega | Recibe la mercancía en la bodega de la tienda |
| Administrador | Acceso completo |

Mostrar siempre, en la barra superior, **el rol activo** y un botón "Cambiar de rol" que cierra la sesión y vuelve al selector.

### Menú de cada rol

El sistema no le dice a la pantalla qué rol tiene la persona: el menú lo decide el rol elegido en el selector. Si alguien intenta algo que su rol no permite, el sistema lo rechaza y se muestra "Tu rol no permite esta acción".

| Rol | Menú |
| :--- | :--- |
| Vendedor | Registrar venta · Historial de ventas · Inventario de mi tienda |
| Supervisor de tienda | lo del vendedor · Ajustes de inventario |
| Planificador | Recomendaciones · Órdenes · Inventario |
| Operador de CD | Despacho · Inventario del CD |
| Coordinador de transporte | Ciclos por despachar en viaje · Viajes |
| Encargado de bodega | Paradas por recibir · Inventario de mi bodega |
| Administrador | todo lo anterior y la administración |

### Nombres en vez de códigos

El sistema identifica tiendas, centros y productos con códigos largos (por ejemplo `abed0b85-7532-…`). **Nunca mostrar esos códigos.** La pantalla siempre muestra el nombre: "Tienda Demo Centro", "CD Demo Principal", "DEMO-…-AZ-M · Camisa Oxford · Azul · M". Para la demo esos nombres salen de los datos sembrados. Si algún dato no tiene nombre conocido, mostrar "—".

---

## Glosario (palabras que se usan en pantalla)

| Término | Qué significa | Cómo decirlo en pantalla |
| :--- | :--- | :--- |
| **Tienda** | Punto de venta al público. Tiene un Almacén y una Bodega | Tienda |
| **Almacén** | Lo que está en el piso de venta, disponible para vender | Almacén (piso de venta) |
| **Bodega** (Bodega de tienda) | Depósito de la tienda, detrás del piso de venta. Recibe lo que llega del CD y repone el Almacén | Bodega |
| **CD** (Centro de distribución) | Depósito grande que abastece a varias tiendas | Centro de distribución (CD) |
| **Prioridad de CD** | Orden en que una tienda le pide a sus centros: primero el 1; si no tiene, el 2 | Prioridad |
| **Traspaso** | Movimiento de mercancía de la Bodega al Almacén de la misma tienda. Lo hace el sistema solo cuando el Almacén queda bajo su mínimo | Traspaso automático |
| **Nivel de reposición** | Mínimo y objetivo para la Bodega. Bajo el mínimo, se sugiere pedir hasta llegar al objetivo (en la demo: mínimo 5, objetivo 20) | Mínimo / Objetivo |
| **Recomendación** | Sugerencia de pedido al CD que nace sola. Empieza en borrador | Recomendación |
| **Orden de reabastecimiento** | Pedido aprobado a un CD | Orden (o Pedido al CD) |
| **Fallback de CD** | Si el CD de prioridad 1 no tiene la cantidad completa, se intenta con el 2, y así | "Se buscó en otro CD" |
| **Intento** | Cada CD que se revisó para una orden, con su resultado | Intento |
| **Despacho / ciclo de despacho** | Cada salida de mercancía del CD para una orden. Una orden puede tener varios (ciclo 1, ciclo 2) | Despacho n.º 1, n.º 2 |
| **Despacho completo / parcial** | Completo: salió todo lo pedido. Parcial: el CD tenía menos | Completo / Parcial |
| **Fill rate** | Porcentaje de lo pedido que salió en un despacho (10 de 19 = 52,6 %) | Nivel de cumplimiento |
| **Viaje** | Recorrido de un vehículo desde un CD con una o más paradas | Viaje |
| **Parada** | Cada tienda que visita un viaje | Parada |
| **Salida / llegada** | Hora en que el viaje sale del CD y llega a cada tienda | Salida / Llegada |
| **Recepción** | Registro de cuánto llegó realmente a la Bodega | Recepción |
| **Discrepancia** | Diferencia entre lo despachado y lo recibido. Se trata como pérdida en el camino | Faltante en el camino |
| **Reapertura** | Cuando llega menos de lo pedido, la orden vuelve a quedar abierta con lo que falta | Reabierta |
| **Cerrar con faltante** | Dar por terminada una orden reabierta aceptando que no llegará lo que falta | Cerrar con faltante |
| **Cancelar** | Anular una orden que ningún CD pudo atender | Cancelar |
| **A la mano** | Unidades que están físicamente en el lugar | A la mano |
| **Entrante** | Unidades pedidas que todavía no llegan (en la Bodega) | En camino |
| **Saliente** | Unidades del CD apartadas para órdenes aprobadas que todavía no salen | Reservado |
| **Disponible** | A la mano menos lo reservado. Puede ser negativo | Disponible |
| **Pronosticado** | Lo que habrá cuando llegue lo que está en camino y salga lo reservado | Proyectado |
| **SKU / variante** | Un producto concreto: modelo, color y talla | Producto (SKU) |
| **Venta forzada** | Venta registrada aunque el sistema diga que no hay existencias | Vender sin stock |

**Pregunta abierta:** ¿en pantalla se usa "Entrante/Saliente" (como en el sistema y el guion) o "En camino/Reservado"? Este brief propone la segunda para el público y la primera entre paréntesis.

---

## Estados y colores sugeridos

| Qué | Estados (como los dice el sistema → cómo mostrarlos) |
| :--- | :--- |
| Recomendación | BORRADOR → **Por revisar** (ámbar) · APROBADA → **Aprobada** (verde) · RECHAZADA → **Rechazada** (gris) |
| Orden | GENERADA → **Sin CD disponible** (rojo) · APROBADA → **Por despachar** (azul) · DESPACHADA → **Despachada** (azul) · EN_TRANSITO → **En camino** (violeta) · REABIERTA → **Reabierta** (ámbar) · CERRADA → **Cerrada** (verde) o **Cerrada con faltante** (verde con aviso) · CANCELADA → **Cancelada** (gris) |
| Intento de CD | ASIGNADO → **Asignado** (verde) · SIN_STOCK → **Sin stock suficiente** (gris tachado) |
| Despacho | COMPLETO → **Completo** (verde) · PARCIAL → **Parcial** (ámbar) |
| Viaje | ARMADO → **Listo para salir** · EN_CURSO → **En ruta** · CERRADO → **Terminado** |
| Parada | PENDIENTE → **Pendiente** · EN_TRANSITO → **En camino** · ENTREGADO → **Entregada** |

---

## Mensajes comunes (sirven para todas las pantallas)

| Situación | Mensaje sugerido |
| :--- | :--- |
| Cargando | Esqueleto de la tabla o del formulario; botón principal deshabilitado con "Guardando…" |
| Sin conexión | "No pudimos conectar con el sistema. Revisa tu conexión e intenta de nuevo." |
| Sesión vencida (dura 15 minutos y se renueva sola; si no se puede) | "Tu sesión terminó. Inicia sesión de nuevo." |
| El rol no puede hacer esto | "Tu rol no permite esta acción." |
| No existe o no es de tus tiendas | "No encontramos este registro, o no pertenece a tus tiendas." |
| Alguien lo cambió antes | "Este registro cambió mientras lo veías. Actualizamos la pantalla." (y recargar) |
| Error del sistema | "Algo salió mal de nuestro lado. Intenta de nuevo en un momento." |

Cuando el sistema devuelve un mensaje propio (por ejemplo "La cantidad recibida (20) supera la despachada (19)"), mostrarlo tal cual junto al campo o en un aviso. Diseñar el aviso para textos de hasta dos líneas.

---

## 1. Login y segundo factor

* **Rol:** todos. **Objetivo:** entrar al sistema. **Paso:** antes del 1.

**Pantalla A: Login**

| Campo | Tipo | Ejemplo |
| :--- | :--- | :--- |
| Correo | texto (correo) | vendedor@demo.local |
| Contraseña | contraseña | •••••••••••• |

Acciones: **Iniciar sesión**. Si la cuenta tiene segundo factor, pasa a la pantalla B; si no, entra al menú de su rol.

**Pantalla B: Código de verificación**

| Campo | Tipo | Ejemplo |
| :--- | :--- | :--- |
| Código | 6 dígitos, o un código de respaldo de 10 caracteres | 492817 |

Acciones: **Verificar** · **Volver** · enlace "Usar un código de respaldo".

Estados y errores:

| Caso | Mensaje sugerido |
| :--- | :--- |
| Datos con formato inválido | "Revisa el correo y escribe tu contraseña." |
| Contraseña incorrecta, usuario inactivo o cuenta bloqueada (el sistema no dice cuál) | "Correo o contraseña incorrectos. Tras varios intentos la cuenta se bloquea unos minutos." |
| Código incorrecto | "El código no es válido. Revisa tu app autenticadora." |
| Pasaron más de 5 minutos | "Pasó demasiado tiempo. Inicia sesión de nuevo." (vuelve a A) |

Después: queda la sesión abierta (15 minutos, se renueva sola por 7 días).

**Perfil (ya existe):** activar el segundo factor muestra un código QR y una clave de texto, pide el primer código y muestra **8 códigos de respaldo una sola vez**, con la advertencia "Guárdalos ahora: no se volverán a mostrar".

---

## 2. Registrar venta

* **Rol:** Vendedor (y Supervisor). **Objetivo:** registrar lo que se vendió en la tienda. **Paso:** 1.

Datos:

| Etiqueta | Tipo | Ejemplo real |
| :--- | :--- | :--- |
| Tienda | selección entre sus tiendas | Tienda Demo Centro |
| Producto (SKU) | búsqueda | DEMO-…-AZ-M |
| Cantidad | número entero mayor que 0 | 1 |
| Precio unitario | moneda (COP) | $ 89.900 |
| Canal | texto, opcional | FISICO (valor por defecto) |
| Vender sin stock | casilla | desmarcada |
| Total | moneda, calculado | $ 89.900 |

Se pueden agregar hasta 200 líneas, sin repetir producto.

Acciones:

* **Registrar venta**: guarda todas las líneas o ninguna. Muestra un recibo con fecha y hora, total y estado "Registrada".
* **Agregar producto** / quitar línea.

Estados y errores:

| Caso | Mensaje sugerido |
| :--- | :--- |
| Vacío | "Agrega al menos un producto." |
| Cantidad 0 | "La cantidad debe ser mayor que cero." |
| Producto que no existe | "No existe un producto con el SKU NO-EXISTE-XX." |
| No hay existencias | "No hay existencias suficientes de DEMO-…-AZ-M en el piso de venta." Ofrecer "Vender sin stock" si el rol puede |
| Tienda que no es suya | "No tienes acceso a esta tienda." |
| Se pulsó dos veces o se reintentó | No es error: el sistema devuelve la misma venta; mostrar el recibo una sola vez |

Después de registrar (pasa solo, sin pulsar nada): el piso de venta de la tienda Centro bajó a 1 y **se repuso a 6 desde la Bodega**, que quedó en 1. Como la Bodega quedó bajo su mínimo (5), **nace una recomendación de 19 unidades** para el planificador. En la demo conviene mostrar un aviso: "La bodega quedó bajo su mínimo: se generó una recomendación de pedido".

---

## 3. Inventario por ubicación

* **Rol:** todos (cada uno ve lo suyo). **Objetivo:** ver cuánto hay en un Almacén, una Bodega o un CD. **Paso:** se usa entre pasos para mostrar el efecto.

Datos (una fila por producto):

| Etiqueta | Tipo | Ejemplo real (Bodega Centro, después de aprobar) |
| :--- | :--- | :--- |
| Producto | texto | DEMO-…-AZ-M |
| A la mano | entero | 1 |
| En camino (entrante) | entero | 19 |
| Reservado (saliente) | entero | 0 |
| Disponible | entero, puede ser negativo | 1 |
| Proyectado (pronosticado) | entero | 20 |

Ejemplo de CD con un número negativo (CD Principal, producto BL-L, después de una merma): A la mano 10 · Reservado 19 · Disponible **−9** · Proyectado **−9**. El diseño debe mostrar negativos en rojo, sin recortarlos a 0.

Selector arriba: **Tienda → Almacén / Bodega**, o **Centro de distribución**. Pestañas: **Existencias** y **Movimientos** (historial con fecha, tipo, cantidad con signo y comentario; tipos: Carga inicial, Ajuste, Venta, Anulación de venta, Salida por traspaso, Entrada por traspaso, Despacho, Recepción).

Ayuda junto a cada columna (ícono "i"):
* Disponible = A la mano − Reservado.
* Proyectado = A la mano + En camino − Reservado.

Estados:

| Caso | Qué mostrar |
| :--- | :--- |
| Vacío | "Esta ubicación todavía no tiene productos cargados." |
| Ubicación ajena | "No encontramos esta ubicación, o no pertenece a tus tiendas." |
| Coordinador de transporte | No ve inventario: no poner esta opción en su menú |

Ajuste (solo Supervisor, Operador de CD y Administrador; ya existe): producto, cantidad (+ o −), motivo (Conteo físico, Ingreso manual, Merma, Corrección; Corrección pide comentario). Error: "El ajuste dejaría las existencias en negativo: a la mano 10, ajuste −1000".

---

## 4. Recomendaciones

* **Rol:** Planificador. **Objetivo:** decidir qué pedir a los centros. **Paso:** 1 y 2.

Lista (filtros: estado, tienda, producto):

| Etiqueta | Tipo | Ejemplo real |
| :--- | :--- | :--- |
| Tienda | texto | Tienda Demo Centro |
| Producto | texto | DEMO-…-AZ-M |
| Cantidad sugerida | entero | 19 |
| CD sugerido | texto | CD Demo Sin Stock (es el primero de la prioridad, no necesariamente el que se asignará) |
| Estado | etiqueta | Por revisar |
| Creada | fecha y hora local | 22/11/2026 19:38 |

Detalle o panel lateral al elegir una: lo de arriba y un campo **Cantidad a aprobar** (por defecto, la sugerida).

Acciones:

* **Aprobar**: con la cantidad sugerida o la editada. Crea la orden en el mismo momento y lleva al **Detalle de orden**. Mostrar "Orden creada" y la diferencia si se editó ("Aprobaste 15 de 19 sugeridas: −4").
* **Editar cantidad** (antes de aprobar).
* **Rechazar**: pide confirmación ("La recomendación quedará rechazada y no se creará pedido"). No pide motivo.
* **Evaluar ahora** (botón secundario de la lista): revisa la tienda y crea las recomendaciones que falten. Resultado: "Se crearon 1 recomendaciones" o "No hay recomendaciones nuevas".

Estados y errores:

| Caso | Mensaje sugerido |
| :--- | :--- |
| Vacío | "No hay recomendaciones por revisar. Aparecen solas cuando una bodega queda bajo su mínimo." |
| Cantidad 0 o negativa | "La cantidad aprobada debe ser mayor que cero." |
| Ya la aprobó o rechazó otra persona | "Esta recomendación ya fue aprobada. Actualizamos la lista." |
| Tienda ajena | "No encontramos esta recomendación, o no pertenece a tus tiendas." |

Después: la recomendación pasa a "Aprobada"; el CD asignado aparta las unidades (Reservado +19) y la Bodega las ve en camino (+19). Si se aprobó menos de lo necesario para superar el mínimo, **nace otra recomendación** para el mismo producto (en la demo: aprobar 2 generó una nueva de 17).

---

## 5. Detalle de orden

* **Rol:** Planificador. **Objetivo:** seguir un pedido de principio a fin. **Paso:** 3, y se vuelve aquí en el 7 y el 8.

Encabezado:

| Etiqueta | Tipo | Ejemplo real (orden A) |
| :--- | :--- | :--- |
| Tienda | texto | Tienda Demo Centro |
| Producto | texto | DEMO-…-AZ-M |
| Estado | etiqueta | Por despachar |
| CD asignado | texto | CD Demo Principal |
| Motivo de asignación | texto | Asignado al CD de prioridad 2 |
| Pedido | entero | 19 |
| Despachado (acumulado) | entero | 0 |
| Pendiente por recibir | entero | 19 |
| Creada | fecha y hora | 22/11/2026 19:38 |

**Intentos de CD** (el corazón del paso 3; mostrar como una línea de tiempo o lista numerada):

| # | CD | Resultado | Detalle |
| :-: | :--- | :--- | :--- |
| 1 | CD Demo Sin Stock | Sin stock suficiente | Disponible 3 menor que lo requerido 19 |
| 2 | CD Demo Principal | **Asignado** | — |

Caso sin ningún CD (orden de 5000): los dos intentos "Sin stock suficiente" ("Disponible 3 menor que lo requerido 5000", "Disponible 181 menor que lo requerido 5000"), estado **Sin CD disponible** y motivo "Ningún CD cubre la cantidad solicitada".

**Despachos** (lista de ciclos): n.º, fecha, pedido en el ciclo, despachado, resultado, nivel de cumplimiento. Ejemplo de la orden B: n.º 1 · 10 de 19 · Parcial · 52,6 % — n.º 2 · 11 de 11 · Completo · 100 %.

**Resumen de cuadre** (opcional, ayuda a la demo): Pedido 19 · Despachado 21 · Recibido 19 · Faltante en el camino 2 · Pendiente 0. Regla visible: "Despachado = Recibido + Faltante en el camino".

Acciones según el estado:

| Estado | Acciones |
| :--- | :--- |
| Sin CD disponible | **Cancelar orden** (pide motivo) |
| Reabierta | **Cerrar con faltante** (pide motivo) · indicar "El CD puede despachar lo pendiente" |
| Cualquier otro | Solo lectura |

Estados y errores:

| Caso | Mensaje sugerido |
| :--- | :--- |
| Orden ajena o inexistente | "No encontramos esta orden, o no pertenece a tus tiendas." |
| Cancelar una que ya no está "Sin CD disponible" | "Solo se puede cancelar una orden sin CD disponible." |
| Motivo vacío | "Escribe el motivo." |

Después: cancelar deja la orden **Cancelada** sin tocar existencias. Lo que cambia la orden en los pasos 4 a 7 se ve al volver a esta pantalla (no se actualiza sola: poner un botón **Actualizar**).

---

## 6. Despacho y ciclos pendientes de viaje

* **Rol:** Operador de CD (despachar) y Coordinador de transporte (ver los pendientes de viaje). **Objetivo:** sacar la mercancía del CD. **Paso:** 4.

**Pantalla A: Órdenes por despachar (Operador de CD).**

| Etiqueta | Tipo | Ejemplo real |
| :--- | :--- | :--- |
| Orden | referencia corta | #2e3d0e2d |
| Tienda destino | texto | Tienda Demo Centro |
| Producto | texto | DEMO-…-AZ-M |
| Pendiente | entero | 19 |
| Estado | etiqueta | Por despachar / Reabierta |

**Ojo (pregunta abierta):** hoy el sistema no le permite al operador ver la lista de órdenes. Para la demo, la orden puede llegar desde la pantalla del planificador (un enlace "Ir a despachar") o mostrarse con la sesión de administrador. Diseñar la lista igual, porque es lo que el operador necesitaría.

Acción: **Despachar** (sin formulario: el sistema despacha lo que haya, hasta lo pendiente). Confirmación previa: "Se despachará lo que haya en el CD, hasta 19 unidades".

Resultado (tarjeta o modal):

| Etiqueta | Ejemplo completo | Ejemplo parcial |
| :--- | :--- | :--- |
| Despacho n.º | 1 | 1 |
| Pedido en este despacho | 19 | 19 |
| Despachado | 19 | 10 |
| Quedó sin despachar | 0 | 9 |
| Resultado | Completo | **Parcial** |
| Nivel de cumplimiento | 100 % | 52,6 % |
| Fecha | 22/11/2026 19:38 | 22/11/2026 19:38 |

Errores:

| Caso | Mensaje sugerido |
| :--- | :--- |
| Ya se despachó | "Esta orden ya fue despachada. Actualizamos la lista." |
| Orden sin CD | "Esta orden no tiene un CD asignado." |
| El CD no tiene nada | "El CD no tiene unidades a la mano para despachar esta orden." |
| Encargado de bodega u otro rol | "Tu rol no permite esta acción." |

**Pantalla B: Despachos pendientes de viaje (Coordinador).** La lista de despachos que todavía no tienen viaje: n.º de despacho, orden, despachado, resultado, fecha. Es la entrada de "Armar viaje" (casillas para elegir). Vacío: "No hay despachos esperando viaje."

Después del despacho: el CD baja sus existencias y su reserva; la orden queda **Despachada** y el despacho aparece en la lista del coordinador.

---

## 7. Armar viaje

* **Rol:** Coordinador de transporte. **Objetivo:** juntar varios despachos en un vehículo. **Paso:** 5.

Formulario:

| Campo | Tipo | Ejemplo real |
| :--- | :--- | :--- |
| Centro de distribución de salida | selección | CD Demo Principal |
| Vehículo | texto (hasta 100) | Camión DEMO-001 |
| Paradas | lista de despachos elegidos, reordenable (arrastrar) | 1. Tienda Demo Centro · 19 u. — 2. Tienda Demo Norte · 15 u. |

Acciones: **Agregar despacho** (desde la lista de pendientes), **Quitar**, **Reordenar**, **Armar viaje**.

Resultado: viaje "Listo para salir" con sus paradas "Pendiente". La tienda de cada parada la pone el sistema (es la de la orden).

Errores:

| Caso | Mensaje sugerido |
| :--- | :--- |
| Sin paradas | "Agrega al menos un despacho." |
| Sin vehículo | "Escribe el vehículo." |
| Un despacho ya está en otro viaje | "Ese despacho ya está en otro viaje." (quitarlo de la lista) |
| Un despacho sale de otro CD | "Ese despacho sale de otro centro de distribución." |

**Pregunta abierta:** el sistema no dice desde qué CD sale cada despacho; para la demo, todos salen del CD Principal salvo uno de prueba. ¿Se agrupa la lista por CD con datos de la demo, o se deja que el error avise?

Después: los despachos elegidos desaparecen de "pendientes de viaje".

---

## 8. Salida y llegada de paradas

* **Rol:** Coordinador de transporte. **Objetivo:** registrar cuándo sale el viaje y cuándo llega a cada tienda. **Paso:** 6.

Datos del viaje:

| Etiqueta | Tipo | Ejemplo real |
| :--- | :--- | :--- |
| Vehículo | texto | Camión DEMO-001 |
| CD | texto | CD Demo Principal |
| Estado | etiqueta | Listo para salir → En ruta → Terminado |
| Creado / Salida / Fin | fecha y hora local | 19:38 / 19:38 / 19:38 |

Paradas (tabla o línea de ruta): orden, tienda, estado, salida del CD, llegada.

Acciones:

* **Registrar salida** (viaje "Listo para salir"). Por defecto, ahora; opción "Otra hora" con selector de fecha y hora.
* **Registrar llegada** en cada parada "En camino". Mismo selector.

Reglas para el selector de hora: no puede ser futura (hay 2 minutos de margen), la salida no puede ser anterior al despacho y la llegada no puede ser anterior a la salida.

Errores:

| Caso | Mensaje sugerido |
| :--- | :--- |
| Hora futura | "La hora no puede ser posterior a la actual." |
| Salida antes del despacho | "La salida no puede ser anterior al despacho (22/11/2026 19:38)." |
| Llegada antes de la salida | "La llegada no puede ser anterior a la salida del viaje (22/11/2026 19:38)." |
| Ya salió | "Este viaje ya salió." |
| Parada ya entregada | "Esta parada ya fue entregada." |
| Llegada con el viaje sin salir | "Registra primero la salida del viaje." |

Después: con la salida, paradas y órdenes quedan "En camino". Con cada llegada, la parada queda "Entregada" y aparece en **Paradas por recibir** del encargado de esa tienda. Con la última llegada, el viaje queda "Terminado".

---

## 9. Paradas por recibir y recepción con discrepancia

* **Rol:** Encargado de bodega. **Objetivo:** anotar cuánto llegó de verdad. **Paso:** 7.

**Lista de paradas por recibir** (solo las de sus tiendas, ya entregadas y sin recepción):

| Etiqueta | Tipo | Ejemplo real |
| :--- | :--- | :--- |
| Tienda | texto | Tienda Demo Centro |
| Viaje | texto | Camión DEMO-002 |
| Orden | referencia | #97f1888b |
| Despachado | entero | 10 |

Vacío: "No hay entregas por recibir. Aparecen cuando el transporte registra la llegada a tu tienda."

**Formulario de recepción** (al elegir una parada):

| Campo | Tipo | Ejemplo real |
| :--- | :--- | :--- |
| Despachado | entero, solo lectura | 10 |
| Recibido | entero de 0 al despachado | 8 |
| Faltante en el camino | entero, calculado en vivo | 2 |

Acción: **Registrar recepción**. Si hay faltante, pedir confirmación: "Faltan 2 unidades. Se registrarán como pérdida en el camino y la orden quedará reabierta."

Resultado:

| Caso | Mensaje y datos |
| :--- | :--- |
| Llegó todo (19 de 19) | "Recepción registrada. La orden quedó **cerrada**." |
| Llegó menos (8 de 10) | "Recepción registrada con un faltante de 2. La orden quedó **reabierta** con 11 pendientes." |

Errores:

| Caso | Mensaje sugerido |
| :--- | :--- |
| Recibido mayor que despachado | "La cantidad recibida (20) supera la despachada (19)." |
| Recibido negativo | "La cantidad recibida no puede ser negativa." |
| Parada todavía no entregada | "Esta parada todavía no se ha entregado." |
| Ya se había recibido | No es error: muestra la recepción que ya existía y no suma otra vez |
| Parada de otra tienda | "No encontramos esta entrega, o no pertenece a tus tiendas." |

Después: la Bodega suma lo recibido (A la mano +8) y baja lo que estaba en camino; la parada sale de la lista; la orden queda cerrada o reabierta.

---

## 10. Cerrar con faltante

* **Rol:** Planificador. **Objetivo:** terminar una orden reabierta aceptando lo que no llegó. **Paso:** 8.

Se abre desde el **Detalle de orden** cuando está "Reabierta". Modal:

| Campo | Tipo | Ejemplo real (orden C) |
| :--- | :--- | :--- |
| Pedido / Recibido / Pendiente | enteros, solo lectura | 15 / 12 / 3 |
| Motivo | texto largo, obligatorio (hasta 500) | Se acepta la pérdida de 3 unidades en tránsito |

Acciones: **Cerrar con faltante** · **Cancelar**.

Alternativa que el modal debe explicar: "Si prefieres que lleguen las 3 unidades, el CD puede despachar el pendiente" (eso repite los pasos 4 a 7 con un despacho n.º 2).

Errores:

| Caso | Mensaje sugerido |
| :--- | :--- |
| Motivo vacío | "Escribe el motivo." |
| La orden ya no está reabierta | "Solo se puede cerrar con faltante una orden reabierta." |
| Otro rol (operador) | "Tu rol no permite esta acción." |

Después: la orden queda **Cerrada con faltante** (pendiente 3, con el motivo, quién y cuándo). La Bodega deja de esperar esas unidades (En camino vuelve a 0) y el CD libera lo que tuviera reservado.

---

## Casos para los prototipos

Dos recorridos completos con datos reales (están en `mock-data/`):

* **Caso feliz (orden A):** venta en Centro → recomendación de 19 → aprobada → CD Sin Stock descartado, CD Principal asignado → despacho completo de 19 → viaje con dos paradas (Centro y Norte) → llegada → recepción de 19 → orden cerrada.
* **Caso con faltante y reapertura (orden B):** recomendación de 19 → aprobada → el CD solo tiene 10 → despacho **parcial** (52,6 %) → viaje → recepción de **8 de 10** (faltante 2) → orden **reabierta con 11** → segundo despacho de 11 → segundo viaje → recepción de 11 → orden cerrada.
* **Caso de cierre con faltante (orden C):** aprobada en 15 (editada desde 19) → despacho de 15 → recepción de 12 → reabierta con 3 → **cerrada con faltante**.
* **Caso sin CD (orden D):** aprobada en 5000 → ningún CD alcanza → **Sin CD disponible** → cancelada.

---

## Preguntas abiertas para el equipo

1. ¿Se rediseñan las pantallas del Sprint 2 o solo se agregan las del Sprint 3?
2. ¿Palabras de pantalla: "Entrante/Saliente" o "En camino/Reservado"?
3. ¿Cómo llega el operador del CD a la orden que despacha, si hoy no puede listar órdenes? (enlace desde el planificador, sesión de administrador o un cambio en el sistema).
4. ¿El selector de rol se queda solo para la demo o también para un ambiente de pruebas?
5. ¿La demo se presenta en local (Docker) o en producción? Cambia la dirección del sistema y quién puede conectarse.
6. ¿Se muestra el "Resumen de cuadre" en el detalle de la orden? Ayuda a explicar los números, pero no es una pantalla que el negocio haya pedido.
