# Coquetines — contexto del sistema (para prompts / Claude / GPT)

Documento de contexto del repositorio **Coquetines**. Sirve para pegarlo junto con un prompt cuando se planifiquen o implementen cambios (ventas, **caja diaria**, créditos, cambios de producto, reportes, etc.).

---

## Qué es este proyecto

Aplicación web para gestión comercial (productos, stock, sucursales, ventas, **caja diaria**, créditos, cambios de producto en venta, reportes, usuarios con roles). Stack principal:

| Capa | Tecnología |
|------|------------|
| Backend | **Python**, **FastAPI**, **Pony ORM**, PostgreSQL (variables vía `decouple` / `.env`) |
| Frontend | **React** (Vite), **JavaScript**, **React Router**, **Tailwind**, **Axios** |

El backend arranca desde `backend/main.py`, mapea entidades Pony y monta routers bajo `backend/src/controllers/`. La lógica de negocio y acceso a datos vive en `backend/src/services/` (patrón: `with db_session:` en servicios; controladores delgados que delegan en el servicio).

---

## Estructura útil del repo

- `backend/` — API FastAPI, modelos Pony en `backend/src/models.py`, esquemas Pydantic en `backend/src/schemas.py`, DB en `backend/src/db.py`. Migraciones ligeras al inicio en `main.py` (p. ej. columna `pago_mixto` en movimientos de caja).
- `frontend/` — SPA Vite; build de salida típica: `frontend/dist/`.
- `netlify.toml` — configuración de despliegue en **Netlify** (solo aplica si el sitio se publica ahí). Ver sección al final.

---

## Caja diaria (contexto detallado para cambios)

### Concepto de negocio

- Hay una **caja por sucursal y por día** (`CajaDiaria`): saldo inicial, totales de ingresos/egresos, saldo final calculado, estado `ABIERTA` o `CERRADA`.
- Mientras la caja del día está **cerrada**, no se admiten nuevos movimientos (error 400 desde `get_or_create_caja_abierta`).
- Existe compatibilidad con datos **legacy**: si la sucursal es la “default”, el servicio también busca cajas con `sucursal=None` para la misma fecha (migración de esquema antiguo).

### Modelo de datos (Pony)

Definiciones en `backend/src/models.py`:

- **`CajaDiaria`**: `sucursal` (opcional en BD por legacy), `fecha`, clave compuesta `(sucursal, fecha)`, `saldo_inicial`, `total_ingresos`, `total_egresos`, `saldo_final`, `estado`, relación `movimientos`.
- **`MovimientoCaja`**: pertenece a una `CajaDiaria`; `tipo` (`INGRESO` / `EGRESO`); `origen` (ver enum `OrigenMovimientoCaja`: `VENTA`, `PAGO_CREDITO`, `MANUAL`, `CAMBIO_VENTA`); `referencia_id` (p. ej. ID de venta o de pago según el flujo); `descripcion`; `monto`; `fecha_hora`; **`pago_mixto`** (bool): indica si el ingreso corresponde a una venta cobrada con **más de un medio** (sigue siendo **un solo movimiento** con el **total** de la venta).

### Servicio principal

`backend/src/services/caja_services.py` — clase **`CajaDiariaServices`**:

- `get_or_create_caja_abierta(sucursal_id, fecha)` — obtiene o crea caja del día; exige estado `ABIERTA`.
- `registrar_ingreso_en_sesion_actual(...)` — ingreso **sin** abrir un `db_session` nuevo (para usar dentro de la misma transacción que la venta/crédito). Parámetros relevantes: `monto`, `origen`, `sucursal_id`, `referencia_id`, `descripcion`, `fecha`, **`pago_mixto`**.
- `registrar_ingreso(...)` — wrapper con `with db_session` (siempre `pago_mixto=False` en esta vía).
- `registrar_egreso(...)` — egreso (origen por defecto `MANUAL` para egresos manuales desde API).
- `abrir_caja` / `cerrar_caja` — ciclo de vida explícito del día.
- **`obtener_resumen`**: devuelve JSON con totales y lista de movimientos. Para movimientos con `origen == VENTA` y `referencia_id`, enriquece cada ítem con **`medios_pago`**: lista `{ metodo_pago, monto }` leída de las filas **`VentaPago`** de esa venta (para mostrar el desglose en UI/PDF sin duplicar montos en la descripción).

### Quién escribe movimientos de caja (ingresos automáticos)

| Origen | Archivo / método (referencia) |
|--------|-------------------------------|
| Venta | `backend/src/services/ventas_services.py` → `create_venta`: un ingreso con `monto = total` de la venta, `referencia_id = venta.id`, `pago_mixto = True` si hay más de un `VentaPago` con monto > 0. |
| Pago de crédito | `backend/src/services/creditos_services.py` → `registrar_ingreso_en_sesion_actual` con origen `PAGO_CREDITO`. |
| Cambio de producto (suplemento) | `backend/src/services/cambios_venta_services.py` → `registrar_ingreso` con origen `CAMBIO_VENTA`. |

Los egresos manuales salen del endpoint de caja (ver API).

### API HTTP (`prefix="/caja"` en `main.py`)

Controlador: `backend/src/controllers/caja_controller.py`.

- **`POST /caja/abrir`** — cuerpo `AbrirCajaRequest` (`sucursal_id` opcional, `saldo_inicial`, `fecha` opcional). Respuesta `{ message, success }`.
- **`POST /caja/cerrar`** — query `fecha`, `sucursal_id` opcionales. Devuelve **PDF** (`application/pdf`) generado con `ReportService.generate_cierre_caja_pdf(resumen)` en `backend/src/services/reportes_services.py`.
- **`POST /caja/egreso-manual`** — `monto`, `descripcion`, `fecha` opcional.
- **`GET /caja/resumen`** — query `fecha`, `sucursal_id`; devuelve el objeto resumen con `movimientos` (cada uno puede incluir `medios_pago` y `pago_mixto`).

### Permisos de rol

En el controlador de caja, el rol **`OWNER`** no puede abrir/cerrar caja, registrar egresos ni ver el resumen (403 con mensajes explícitos). El front redirige a dashboard si el usuario es OWNER (`frontend/src/components/Caja/CajaDiaria.jsx`).

### Frontend — pantalla Caja

- Componente: **`frontend/src/components/Caja/CajaDiaria.jsx`**.
- Flujos: selector de fecha local (`YYYY-MM-DD`), refrescar resumen, abrir caja (modal saldo inicial), cerrar caja (descarga PDF), egreso manual.
- Para ventas con pago mixto: movimientos expandibles cuando `origen === "VENTA"`, `pago_mixto` y `medios_pago` vienen poblados; helper `descripcionCajaSinMedios` limpia texto legacy en descripciones.

### Puntos sensibles para prompts sobre “la caja”

- Hoy **una venta = un movimiento de ingreso** en caja (total completo); el detalle por medio está en **`VentaPago`** y se refleja en el resumen como **`medios_pago`**. Cualquier cambio a “**un movimiento por medio**” o conciliación por método implica tocar `ventas_services`, posiblemente reportes/PDF y la UI de `CajaDiaria.jsx`.
- Coherencia entre **día contable** de la venta (`fecha` en `VentaCreate` / `_fecha_operacion_venta`) y la caja usada al registrar el ingreso.
- Caja cerrada vs operaciones que siguen intentando registrar (ventas, créditos, cambios).
- PDF de cierre y listados que agregan información desde el mismo `obtener_resumen`.

---

## Ventas — comportamiento actual (alineado al código)

### Modelo de datos

- **`Venta`**: `total`, **`metodo_pago`** como **texto resumido** (un medio o concatenación tipo `Efectivo + Débito`), `cliente`, `fecha`, líneas `VentaProducto`, relación **`pagos`** → entidad **`VentaPago`** (`metodo_pago`, `monto` por fracción).
- Registro puede enviar **`pagos`** (lista) o, por compatibilidad, un solo **`metodo_pago`** que se convierte en un único `VentaPago` por el total.
- Validación: suma de montos en `pagos` ≈ total de la venta (tolerancia `PAGO_TOTAL_TOL` en `ventas_services.py`).
- Con **varios medios**, cada ítem del carrito debe traer **`tipo_precio`** en el detalle (precio cotizado por producto); si no, el backend responde 400 con mensaje explícito.

### API y servicio

- `POST /ventas/register` con cuerpo `VentaCreate` (incluye `pagos` opcional, `fecha` opcional para día contable).
- Lógica: `VentasServices.create_venta` en `backend/src/services/ventas_services.py` (stock, precios vía `obtener_precio_unitario`, `VentaPago`, registro en caja como arriba).

### Frontend

- Registro principal: `frontend/src/components/Ventas/RegisterSale.jsx`.
- Precios por método: `frontend/src/utils/precioProducto.js` (`precioUnitarioPorMetodoPago` / equivalentes según evolución del archivo).

---

## Cambio de producto / créditos (contexto breve)

- Flujos de **cambio de producto** sobre una venta (`cambios_*`), con suplemento y posible nota de crédito; caja con origen `CAMBIO_VENTA` cuando aplica ingreso en efectivo/transferencia según implementación.
- **Créditos**: pagos que impactan caja con origen `PAGO_CREDITO` en `creditos_services.py`.

---

## `netlify.toml` — ¿sirve?

**Sí**, si el frontend se despliega en **Netlify**. El archivo:

- Fija `base = "frontend"` y el comando `npm run build` con publicación desde `dist` (coherente con Vite).
- Configura la **redirección SPA** (`/*` → `/index.html` con 200) para React Router.
- Ajusta **headers** de `Content-Type` para `.js`, `.mjs` y `.css` (evita problemas de MIME).

Si no usás Netlify, el archivo no afecta el desarrollo local; podés dejarlo para cuando sí se use Netlify, o ignorarlo en otros hosts (Railway, VPS, etc.).

---

## Cómo usar este README en un prompt

1. Pegá **este archivo completo** (o las secciones que correspondan: por ejemplo **“Caja diaria”** + **“Ventas”**).
2. Después escribí el pedido concreto, por ejemplo:
   - *“Quiero que en caja se vea X al expandir un movimiento de venta…”*
   - *“Necesito un movimiento de caja separado por cada medio de pago sin duplicar el total en reportes…”*
   - *“Al cerrar caja, el PDF debe incluir…”*

Objetivo: que otra instancia (Claude u otro modelo) genere un **prompt ejecutable** para el agente de código en Cursor, con rutas de archivos y restricciones ya contextualizadas.
