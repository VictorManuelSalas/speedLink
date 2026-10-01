# SpeedLink · Backend (API + Worker)

## 1. Cómo se reparten los datos

| Dónde | Qué guarda | Por qué |
|---|---|---|
| **PostgreSQL** (Prisma, `api/prisma/schema.prisma`) | Todo lo que tiene reglas, relaciones o dinero: organización, usuarios y roles, clientes, leads, servicios, equipos, asignaciones, contratos, facturas, pagos, gastos, calendario, tickets, notas, archivos, plantillas, módulos personalizados, conexiones, routers y colas, portal, bóveda de secretos, automatizaciones, outbox | Transacciones, llaves foráneas, folios únicos, reportes con SQL |
| **MongoDB** (`api/src/mongo/schemas`) | Bitácoras de solo-agregar y alto volumen: `activity_events`, `audit_logs`, `message_logs` (correo/SMS/WhatsApp), `webhook_deliveries`, `network_commands`, `traffic_samples` (time-series), `notifications`, `job_runs` | Crecen rápido, no se editan, se consultan por registro y fecha, y algunas expiran solas (TTL) |
| **Redis** | Colas BullMQ, caché de permisos y límites de intentos | Volátil: nada de negocio vive solo aquí |
| **Bucket S3/R2/MinIO** | Archivos (adjuntos, PDFs, XML CFDI, logos) | La base solo guarda `storageKey`; se descarga con URL firmada |

**Reglas del schema**
- Toda tabla de negocio lleva `organizationId`, y sus índices empiezan por él.
- `id` es un cuid interno. Lo que ve el usuario (`SL-1100`, `INV-000123`, `TK-000088`) es `code` o `folio`, único por organización. Se genera con la tabla `Sequence`.
- Borrado lógico con `deletedAt`. Hoy el frontend borra de verdad: cambiarlo para que archive.
- Las contraseñas y llaves van cifradas en `VaultSecret` (AES-256-GCM, llave maestra fuera de la base). En la tabla dueña solo queda `secretTail`. Cada revelado de credenciales de equipo o de WiFi se registra en `audit_logs`.
- Dinero en `Decimal(12,2)`. Una factura copia `taxName` y `taxRate` al emitirse, y `amountPaid` se actualiza en la misma transacción que el pago.
- Reglas que Prisma no expresa están en SQL al final de la migración inicial:
  - un solo equipo con asignación ACTIVE;
  - una sola tasa de impuesto predeterminada;
  - índices GIN sobre `customFields`/`data`;
  - CHECKs de montos y rangos.

## 2. Diagnóstico del estado actual

| Prioridad | Hallazgo | Acción |
|---|---|---|
| 🔴 | `backend/.env` está en git, con `JWT_SECRET` y `JWT_REFRESH_SECRET` | Rotar los secretos, `git rm --cached backend/.env`. Ya se agregaron `.gitignore` y `.env.example` |
| 🔴 | No hay autenticación. `organizationId` y `authorId` llegan en el body o el query, así que cualquiera puede leer otra empresa | Guard JWT. El tenant y el usuario salen del token, nunca del cliente |
| 🔴 | `docker-compose.yml` tiene contraseñas fijas y expone Postgres, Mongo (sin auth), Redis (sin password) y pgAdmin a la red | Usar variables de `.env`. No publicar puertos de bases fuera de dev. Activar auth en Mongo y Redis |
| 🟠 | La migración anterior hacía `ALTER` sobre tablas que ninguna migración creaba, y fallaba en una base nueva | Se reemplazó por `20260930000000_init`. En dev: `npx prisma migrate reset` |
| 🟠 | `api/dist` está en git, y `package-lock.json` no coincide con `package.json` (se generó en Mac): `npm ci` falla | `git rm -r --cached backend/api/dist` y regenerar el lock con `npm install` |
| 🟠 | `PrismaService` imprimía `DATABASE_URL` (con la contraseña) y todas las consultas | Corregido: no imprime la URL, y las consultas solo se registran fuera de producción |
| 🟠 | El worker es un `setInterval`, sin dependencias, Prisma ni Mongo | Ver la sección 4 |
| 🟡 | Había 3 borradores de schema duplicados (`speedlink-enterprise-schema.prisma`, `mongo-schemas.ts`, `speedlink-mongo-schemas.ts`), y activity y audit vivían en Postgres y en Mongo a la vez | Se unificaron: un solo `schema.prisma`, y las bitácoras quedan solo en Mongo |
| 🟡 | CORS acepta cualquier origen y Swagger es público | `CORS_ORIGINS` desde `.env`. Swagger solo en dev o detrás de auth |
| 🟡 | Hay dos Dockerfiles para la API (`backend/Dockerfile` y `api/Dockerfile`), y compose corre `start:dev` | Un Dockerfile multi-stage por app, con target `dev` y `prod` |

## 3. API (NestJS)

### Estructura sugerida

Monorepo de Nest: la API y el worker comparten schema, cliente Prisma y modelos de Mongo.

```
backend/
  apps/
    api/                 # HTTP: controladores, DTOs, guards
    worker/              # Procesadores BullMQ, crons, relay del outbox
  libs/
    database/            # prisma/schema.prisma, PrismaService, MongoModule + schemas
    domain/              # Reglas compartidas: folios, saldos, plantillas, permisos, eventos
    integrations/        # Clientes de MikroTik, SMTP, SMS, pasarelas, PAC, storage
```

Hoy todo está en `api/`. Moverlo es mecánico: `nest generate app worker` y `nest generate library database`.

### Piezas transversales (antes de los módulos)
1. **AuthModule.**
   - Login con argon2id.
   - Access token de 15 min y refresh token rotativo (`UserSession`, solo se guarda el hash).
   - Invitación y restablecimiento con enlace de un solo uso (`UserToken`), en lugar de la contraseña temporal actual.
   - Bloqueo tras intentos fallidos.
2. **TenantGuard + `@CurrentUser()`.** El `organizationId` sale del JWT. Todo `where` lo incluye. Una extensión de Prisma puede inyectarlo para que no se olvide.
3. **PermissionsGuard.** Se usa como `@RequirePermission('invoices.delete')`, con el mismo formato `modulo.accion` del frontend (`Role.permissions`). Los roles van en caché en Redis.
4. **Eventos de dominio.** Cada servicio que cambia algo importante escribe en `OutboxEvent` dentro de su transacción (`prisma.$transaction`). Nunca se encola directo desde el controlador.
5. **AuditInterceptor.** Registra en `audit_logs` las acciones de usuarios, roles, conexiones, routers, borrados y revelados de credenciales.
6. **Paginación y filtros.** Patrón uniforme `?page&pageSize&sort&filter[status]=PAID`, que es lo que necesita la lista genérica del frontend.
7. **Errores.** Formato único `{ code, message, details }` y mensajes traducibles por `code`.

### Orden de módulos
1. Auth, users, roles, organización e impuestos.
2. Clientes, leads (con conversión), servicios.
3. Contratos, facturas, pagos (saldos y folios en transacción) y la cobranza en el worker.
4. Equipos, asignaciones, inventario, acceso y WiFi (bóveda).
5. Tickets (ya existe; falta el auth), calendario, notas, archivos (storage) y la actividad.
6. Plantillas, correo y SMS (worker), WhatsApp (registro y enlaces de documentos firmados).
7. Red MikroTik (worker), portal de clientes, pagos en línea y CFDI.
8. Módulos personalizados, webhooks, automatizaciones y reportes.

## 4. Worker (BullMQ)

Debe ser una app de Nest (`@nestjs/bullmq`) con Prisma y Mongo, no un script aparte.

| Cola | Trabajos | Disparo | Notas |
|---|---|---|---|
| `outbox` | Lee `OutboxEvent` sin procesar y reparte a las colas de abajo | Cada 2 s, o LISTEN/NOTIFY de Postgres | Marca `processedAt`. Reintenta con `attempts` |
| `activity` | Escribe `activity_events` con `related` (cliente de la factura, etc.) | Evento | Así la API no espera a Mongo |
| `webhooks` | POST firmado con HMAC (`X-SpeedLink-Signature`) y `eventId` para evitar duplicados | Evento | Backoff de 1 min, 5 min, 30 min, 2 h y 12 h; luego `dead` |
| `email` / `sms` | Renderiza la plantilla, envía y registra en `message_logs` | Evento o API | SMS respeta las horas de silencio (`quietStart`–`quietEnd`) |
| `billing` | Genera las facturas del periodo por contrato activo | Cron diario: clientes con `billingDay` = hoy | Idempotente por `@@unique([contractId, periodStart])` |
| `collections` | Recordatorio antes del vencimiento, aviso de vencida, marca OVERDUE | Cron diario | `dedupeKey` en `message_logs` evita repetir avisos |
| `network` | Provisionar, cambiar velocidad, bloquear o desbloquear, cambiar IP (API REST de RouterOS 7) | Evento o API | **Concurrencia 1 por router**. Escribe `network_commands` |
| `network-cutoff` | Aplica `CutoffRules`: vencidos más allá de `graceDays`, dentro de la ventana y sin fin de semana | Cron cada 15 min en horario | Reactiva al pagar si `reactivateOnPayment` |
| `network-poll` | Lee contadores de las colas, guarda `traffic_samples` y detecta clientes caídos | Cada 5 min por router | Alimenta consumo, horas pico y uso por plan |
| `payments` | Webhooks de la pasarela: aprueba `OnlinePayment`, crea `Payment` y marca la factura | Webhook entrante | Idempotente por `providerPaymentId` |
| `cfdi` | Timbra y cancela con el PAC, y guarda el XML y el PDF en storage | Evento `invoice.created` o manual | Reintento si el PAC no responde |
| `documents` | Genera PDFs (factura, recibo, contrato, estado de cuenta) | Bajo demanda o al emitir | Los enlaces públicos se firman con `DOCUMENT_LINK_SECRET` y expiran |
| `imports` | Importación CSV de la pantalla de importar | API | Avanza el progreso por WebSocket o polling |
| `automations` | Evalúa las reglas de `Automation` por evento | Evento | |

Reglas del worker:
- **Cada trabajo es idempotente.** Un reintento no debe duplicar facturas, pagos ni avisos.
- **Registro.** Inicio, fin y error van a `job_runs`. Si un trabajo falla definitivamente, se crea una notificación para un administrador.
- **Monitoreo.** Bull Board en `/admin/queues` (solo administradores).
- **Escala.** Se puede correr más de un worker: BullMQ reparte los trabajos y los crons van con `jobId` fijo para no duplicarse.

## 5. Despliegue
- **Imágenes.** Dockerfile multi-stage: `node:22-alpine`, `npm ci`, build, y una imagen final sin dependencias de desarrollo.
- **Migraciones.** `prisma migrate deploy` corre como paso previo del despliegue, nunca al arrancar la app.
- **Healthchecks.** `/api/health` comprueba Postgres, Mongo y Redis. Compose usa `depends_on: condition: service_healthy`.
- **Respaldos.**
  - Postgres: `pg_dump` diario más WAL/PITR si es posible.
  - Mongo: `mongodump` diario.
  - Bucket: con versionado.
- **Observabilidad.** Logs JSON (pino) con `requestId` y `organizationId`. Sentry en la API y en el worker.
