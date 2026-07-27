# Memoria del proyecto — Approbations de Factures (Deyby / CSDM)

> Fuente de verdad del contexto del proyecto. Se mantiene viva: cada decisión y
> aprendizaje importante se registra aquí en el momento.
> Creada el 2026-07-19 a partir del código, `GUIA_DESPLIEGUE.md` y el historial de git.

## Objetivo

Sistema web de **aprobación de facturas** para la CSDM (Centre de services scolaire de
Montréal). Una factura entra (manualmente o por correo), se le asignan hasta 6 niveles de
aprobadores (CP, Régisseur, Coordo, Direction adjointe, Direction générale, COO) y cada uno
aprueba/rechaza hasta cerrar el circuito. UI en **francés**; código/comentarios en español.

## Stack

Excepción al stack estándar: **este proyecto va sobre Azure, no Railway**.

- **App**: Next.js 15.1.3 (App Router) + React 19 + TypeScript + Tailwind + Radix UI (shadcn).
- **Datos**: PostgreSQL **en Railway** (`acela.proxy.rlwy.net:27865`, db `railway`) + Prisma 5.
  ⚠️ **No es Azure Postgres**: `GUIA_DESPLIEGUE.md` y `.azure/provision.sh` describen un
  Flexible Server que en la práctica no se usa. Verificado en los app settings el 2026-07-19.
- **Auth**: **NextAuth v5 beta** con provider **Microsoft Entra ID** (no JWT propio `jose`).
  Estrategia `jwt`, **sin PrismaAdapter** (ver Lecciones).
- **Deploy**: Azure App Service Linux `cr-dynamixmtl`, en el resource group **`rg-creditrapide`**
  (recurso **reutilizado de otro proyecto**, "Credit Rapide" — no existe
  `rg-approbations-factures` pese a lo que dice la guía). CI en GitHub Actions con **OIDC**
  (sin secrets en GitHub). Node 22.
- **Documentos**: guardados como `Bytes` **en Postgres** (`src/lib/db-storage.ts`), no en Blob.
- **Integraciones**: Microsoft Graph (buscar usuarios, enviar correo, webhook de inbox), SGDI
  (intranet CSDM, solo alcanzable desde el servidor).
- **Data layer cliente**: TanStack Query + TanStack Table; formularios con react-hook-form + zod.

## Estado actual (2026-07-27)

**Primer correo real recibido — y descubrió que la ingesta nunca funcionó en el servidor.**

- ✅ **La cadena Graph → webhook funciona**: el 2026-07-27 a las 16:53:44Z entró el correo de
  acostasalcedo (`SRM_Projet 321 / . / Now2707_31758`) y la app reaccionó en 3 segundos.
- ❌ **Pero el parseo del PDF reventaba en producción**: `pdfjs` no encontraba su worker dentro
  del bundle de Next (ver Lecciones). Las 2 facturas históricas existían solo porque el backfill
  se corrió **en local**. → Corregido con `precargarWorker()` en `certificat-parser.ts`.
- ✅ El PDF nuevo parsea sin tocar el parser (`Now2707_31758`, 123 $, cadena de 5 aprobadores).
- ⏳ Falta desplegar el fix y reprocesar ese mensaje para que la factura se cree de verdad.
- Diagnóstico completo en [`Aprendizaje.md`](Aprendizaje.md) § Objetivo 3.

## Estado anterior (2026-07-20)

**El circuito completo está vivo en producción por primera vez.**

- ✅ **Login** funcionando (`AUTH_TRUST_HOST`), confirmado por el usuario en navegador.
- ✅ **Ingesta por correo** reescrita: los datos salen del PDF adjunto, no del cuerpo
  (`certificat-parser.ts` + `procesar-certificat.ts`).
- ✅ **Suscripción de Graph activa** desde el 2026-07-20 — la primera que existe, tras arreglar
  la validación por POST. **Se renueva sola** con un workflow diario (Pendientes nº3).
- ✅ **Login usable de verdad**: el fallback del claim `email` desbloqueó todas las rutas API
  (antes daban 401 con sesión válida). Confirmado por el usuario: ya ve las facturas.
- ✅ **Botón "copier le lien"** en la galería: copia `/facture/{nº}` para pasárselo al proveedor.
- ✅ **Backfill hecho**: las 2 facturas históricas del buzón (`CR08-07_31477`, `21junCR_30895`)
  están cargadas. Script reutilizable en `scripts/backfill-courriels.mts`.
- ✅ **Página pública del proveedor** `/facture/{nº}` en producción, con respuesta única.
- ✅ **Admin**: filtro "Fournisseur : en attente / déjà répondu" + columna Réponse.
- ⏳ **Nunca ejercido de punta a punta con un correo nuevo real** — la suscripción se creó
  después de los correos existentes. Falta ver entrar uno solo.
- Catálogos `Ecole`/`Fournisseur` **vacíos**; las facturas entran sin esos datos.
- Working tree: ruido de fin de línea en `next-env.d.ts` / `tsconfig.json` (CRLF↔LF), más
  `deploy_pkg/` y `deploy_pkg.zip` sin trackear (artefactos de un deploy manual del 2026-07-08).

## Arquitectura y módulos

```
src/app/api/          facturas (CRUD), aprobar, documentos, adjuntos-temporal,
                      escuelas, proveedores, usuarios/buscar, correo,
                      webhook/correo (ingesta), webhook/suscripcion (crear/renovar)
src/app/facture/      [numero]/ PÁGINA PÚBLICA del proveedor (sin sesión)
src/app/api/facture/  [numero]/repondre (POST público, respuesta del proveedor)
src/lib/              auth.ts, api-helpers.ts (requireAuth), prisma.ts, db-storage.ts,
                      graph.ts (usuario), graph-app.ts (app-only),
                      certificat-parser.ts (PDF → datos, por posición),
                      procesar-certificat.ts (PDF → Factura + respuesta proveedor),
                      email-parser.ts (OBSOLETO: formato que nunca existió),
                      azure-blob.ts (NO USADO), utils.ts (calcularEstatusGeneral)
scripts/              backfill-courriels.mts (procesa correos ya recibidos)
src/components/       facturas/ (Form, Detalle, Galeria, FiltrosBarra, EmailComposer),
                      shared/ (UserSearchCombo, FileUpload, EstadoBadge, AprobadorChip)
prisma/schema.prisma  Factura, Fournisseur, Ecole, Documento, AdjuntoTemporal,
                      HistorialAprobacion, Bureau, Version + tablas NextAuth (huérfanas)
```

Docs relacionados: [`GUIA_DESPLIEGUE.md`](GUIA_DESPLIEGUE.md) (aprovisionamiento Azure paso a
paso, costos ~$133 CAD/mes), `.azure/provision.sh`.

## Decisiones y reglas de negocio

- **6 niveles de aprobación** por factura (`etatCP`, `etatRegisseur`, `etatCoordo`,
  `etatDirAdj`, `etatDirGen` + `cooEmail`), cada uno con email + nombre. Estado global de la
  factura se deriva con `calcularEstatusGeneral()` en `src/lib/utils.ts`.
- Estados factura: `OUVERT / EN_COURS / APPROUVE / REFUSE / PAYE`.
  Estados aprobador: `VACIO / EN_COURS / APPROUVE / REFUSE`.
- **Documentos en la base de datos**, no en Blob Storage. Decisión tomada durante el
  desarrollo (existe `azure-blob.ts` del diseño original, quedó sin uso).
- **Ingesta por correo**: solo se procesan mensajes del remitente autorizado
  `acostasalcedo.d@csdm.qc.ca` (hardcodeado en `src/app/api/webhook/correo/route.ts:14`).
  El webhook valida con `clientState === WEBHOOK_SECRET` y responde 202 en <30s como exige Graph.
- **Toda la UI en francés**; los identificadores del código en español/francés mezclados
  (`nombreFactura`, `noProjet`, `dateSaisie`). Es intencional, no unificar sin avisar.
- El tenant Azure actualmente configurado en CI es **dynamixmtl** (el de desarrollo/Deyby),
  no el de CSDM. Ver Pendientes.

## Flujo de la factura (confirmado con el cliente el 2026-07-19)

```
1. acostasalcedo ──correo + CertificatCR.pdf──> admin@dynamixmtl.com
2. la app parsea el PDF y crea/actualiza la factura
3. acostasalcedo ──enlace escrito a mano──> proveedor
      ruta SIEMPRE igual: /facture/{nº de factura}
4. el proveedor abre la ruta pública, ve la factura y responde
5. la app ──correo con la respuesta──> acostasalcedo  ← ÚNICO correo que emite
6. acostasalcedo reenvía al proveedor si corresponde
```

- **La app nunca escribe a los aprobadores ni al proveedor.** Solo a acostasalcedo, y solo
  cuando el proveedor ya respondió. Por eso **no hacen falta sus emails** ni tokens de acceso.
- **La URL es deducible a propósito**: acostasalcedo la construye sin esperar a la app, incluso
  antes de que la factura exista (la página muestra "pas encore disponible" en ese caso).
- Compensaciones ante esa URL adivinable: **una sola respuesta por factura** (409 después),
  IP guardada como rastro, comentario escapado en el correo, rechazo sin motivo denegado.
- El proveedor solo **aprueba o rechaza con comentario** — nada de los checks internos.

## Lecciones técnicas

- **`AUTH_TRUST_HOST=true` es obligatorio en App Service — y el flag de código NO basta.**
  Sin confiar en el host, NextAuth v5 lanza `UntrustedHost` y **todos** los endpoints
  `/api/auth/*` devuelven 500 con un mensaje genérico de "server configuration" que no dice
  nada. Confirmado en el log el 2026-07-19; fue la causa real del login roto, y los 4 commits
  de julio atacaron la causa equivocada.
  **Gotcha caro:** poner `trustHost: true` en el config de `auth.ts` **no funciona** en
  `next-auth@5.0.0-beta.25` — el `setEnvDefaults` interno sobrescribe el valor. Se desplegó con
  el flag y siguió fallando; solo se arregló al añadir el **app setting `AUTH_TRUST_HOST=true`**.
  → **Nunca borrar esa variable del App Service** pensando que el código la cubre.
  **Lección de método:** ante ese mensaje genérico, ir directo al log del servidor
  (`az webapp log tail` mientras se golpea `/api/auth/csrf`) en vez de iterar a ciegas.
  `/api/auth/csrf` es el mejor canario: no toca Entra ID, así que si falla el problema es de
  configuración base, no de identidad.
- **NextAuth v5 no lee `NEXTAUTH_SECRET`** — hay que pasar `AUTH_SECRET` explícito. En
  `auth.ts` se resuelve con `process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET`; en
  producción solo existe `NEXTAUTH_SECRET`, así que **el fallback es lo que lo mantiene vivo**
  (no quitarlo).
- **PrismaAdapter rompía el login** con error genérico `Configuration`. Se eliminó y se pasó a
  sesión `jwt` pura. Las tablas `User/Account/Session/VerificationToken` siguen en el schema
  pero **ya no se usan**.
- **Entra ID no siempre emite el claim `email`.** Solo lo manda si el usuario tiene el atributo
  `mail` poblado o si se declara como *optional claim* (en `app-facturacion`, `optionalClaims`
  es **null**). Como `requireAuth()` exige `session.user.email`, el usuario entraba bien —su
  nombre salía en el header— pero **todas** las rutas API devolvían 401, y la UI lo mostraba
  como "0 facture(s)" en vez de un error. Corregido el 2026-07-20 con fallback a
  `preferred_username` / `upn` en el callback `jwt`.
  **Gotcha:** el callback solo rellena el email **al iniciar sesión**, así que los JWT ya
  emitidos siguen rotos → **hay que cerrar sesión y volver a entrar** tras desplegar el fix.
- **La UI se traga los errores de la API**: `data?.total ?? 0` convierte un 401/500 en
  "0 facture(s)". Cuesta muchísimo diagnosticar. **Pendiente**: mostrar el error real.
- **Graph valida el webhook por `POST`, no por `GET`** — con `?validationToken=` en la query y
  **sin cuerpo JSON**. El handler `POST` original parseaba el body y devolvía `{ok:true}`, así
  que el token nunca se devolvía y **ninguna suscripción pudo crearse jamás** (de ahí los 0
  registros durante meses). Corregido el 2026-07-20: el `POST` responde el token antes de tocar
  el body. Al depurar esto, el mensaje de Graph es `ValidationError: Subscription validation
  request to notification URL did not return the expected validation token`.
- **Los datos de la factura vienen en el PDF adjunto, no en el correo.** `CertificatCR.pdf` lo
  genera Chromium (Skia/PDF) con capa de texto estable; se parsea **por posición (x/y)** en
  `src/lib/certificat-parser.ts`. Por orden de líneas NO funciona: un campo vacío (p. ej.
  `ÉCOLE`) hace desaparecer su línea de valor y desalinea todo en silencio.
- **`pdfjs` no encuentra su worker dentro del bundle de Next — y solo falla en producción.**
  En Node no hay Web Workers, así que pdfjs monta un *fake worker* en el hilo principal, pero
  para ello importa `"./pdf.worker.mjs"` marcado con `webpackIgnore`. El bundler respeta la
  marca, así que tras `next build` el chunk `.next/server/chunks/301.js` busca un
  `pdf.worker.mjs` hermano suyo que no existe → **todo PDF fallaba** con
  `Setting up fake worker failed: "Cannot find module …/chunks/pdf.worker.mjs"`.
  En local nunca se ve (se resuelve desde `node_modules`), y por eso el backfill del 2026-07-20
  funcionó mientras el servidor llevaba semanas roto en silencio.
  **Fix (2026-07-27):** `precargarWorker()` en `certificat-parser.ts` deja el worker en
  `globalThis.pdfjsWorker` con un import normal — pdfjs consulta ese global **antes** del import
  dinámico, y de paso el bundler sí incluye el worker (chunk `159.js`).
  **Lección de método:** `tsc` y `next build` pasaron en verde con la ingesta rota. Toda librería
  que cargue archivos hermanos en runtime hay que verificarla **sobre `.next/`**, no compilando.
- **Cuando la ingesta falla, el único que se entera es el cliente.** El webhook avisa por correo
  a acostasalcedo (`[ERREUR]` / `[ERREUR SYSTÈME]`) y no deja rastro en la app. Al diagnosticar
  un "no aparece la factura", **el primer sitio donde mirar es `sentitems` del buzón admin**:
  ahí está el mensaje de error exacto, con fecha. Fue lo que resolvió el caso del 2026-07-27 en
  minutos.
- **Hacer un campo nullable en Prisma no propaga al tipo escrito a mano.** Al volver
  `ecoleId`/`fournisseurId` opcionales, `FacturaResumen` seguía declarando `ecole` como no-nulo:
  el typecheck pasaba en verde y 4 accesos (`f.ecole.nombre`) habrían reventado en runtime.
  Tras cambiar la nulabilidad en el schema, revisar los tipos de `src/types/index.ts` a mano.
- **El deploy no limpia `wwwroot`**: quedan carpetas de la app anterior (Credit Rapide) en
  `.next/server/app` (`admin`, `poll`, `requests`, `approval`, `confirmation`). No estorban
  porque Next enruta por su manifiesto, pero conviene limpiarlas algún día.
- **Tras desplegar, el contenedor sirve el código viejo ~1 minuto.** Al verificar un fix en
  producción hay que reintentar hasta ver el comportamiento nuevo, o se lee un falso negativo
  (me pasó con la validación del webhook y con la ruta `/facture`).
- **La org de GitHub se renombró de `Dynamixmtl` a `Dynamixmtlinc`** (repo:
  `Dynamixmtlinc/Correo-Credito-rapido` — nombre heredado del proyecto Credit Rapide). Eso
  rompió el OIDC del CI con `AADSTS700213: No matching federated identity record`. Se añadió
  la credencial federada `github-main-branch-dynamixmtlinc` con subject
  `repo:Dynamixmtlinc/Correo-Credito-rapido:ref:refs/heads/main` (2026-07-19). Las dos viejas
  con el subject `Dynamixmtl/` siguen ahí, inertes.
- **Los app settings del App Service se gestionan a mano, el CI no los toca.** El workflow solo
  despliega el bundle. Cualquier variable nueva hay que ponerla con
  `az webapp config appsettings set` o el deploy pasará en verde y la app fallará en runtime.
- En el workflow de Azure OIDC, declarar `environment: production` **rompe el OIDC subject**
  (el subject del token cambia y la federated credential no matchea). Se quitó.
- Scopes de Entra ID reducidos a `openid profile email User.Read`; pedir más provocaba
  fallos de consentimiento.
- `prisma/migrations/` está en `.gitignore` → el esquema se aplica con `db push`, no con
  `migrate deploy`, y el CI **no corre migraciones**.

## Pendientes / preguntas abiertas

Prioridad alta:
1. ~~Login en producción roto~~ → **RESUELTO el 2026-07-19.** Causa: `UntrustedHost`. Fix:
   app setting `AUTH_TRUST_HOST=true` (+ `trustHost` en código, que solo no basta).
   Validado: `/api/auth/csrf`, `/api/auth/providers`, `/api/auth/session` y `/` → **200**.
   Redirect URI verificado en Entra ID (app `app-facturacion`, `ab66ed5f-…`) y coincide exacto
   con el callback de NextAuth → **no habrá `AADSTS50011`**. Diagnóstico completo en
   [`Aprendizaje.md`](Aprendizaje.md).
   **Único punto sin confirmar:** el login humano real en navegador (flujo OIDC completo con
   credenciales). Todo lo verificable por máquina está en verde.
2. **Migrar del tenant `dynamixmtl` al tenant real de CSDM**: nuevo registro de app, redirect
   URI, consentimiento de admin, y actualizar `tenant-id`/`client-id` en
   `.github/workflows/azure-deploy.yml` (hoy apunta a `0f0db576-…` = dynamixmtl).
3. ~~Renovación de la suscripción de Graph~~ → **RESUELTO el 2026-07-20.** Workflow
   `.github/workflows/renouveler-souscription.yml`, diario a las 06:00 UTC + manual. Lee las
   credenciales de los app settings por OIDC (sigue sin secrets en GitHub) y ejecuta
   `scripts/renouveler-souscription.mjs`, que es **autocurativo**: si la suscripción expiró o
   se borró, la recrea; y elimina duplicadas sobre el mismo webhook (procesarían cada correo
   dos veces). Probado en local y en GitHub Actions.
   ⚠️ **Vigilar:** GitHub **desactiva los workflows programados tras 60 días sin actividad** en
   el repo. Si el proyecto queda quieto, la renovación muere en silencio y con ella la ingesta.
4. **Datos semilla ficticios / catálogos vacíos**: `prisma/seed.ts` tiene écoles y fournisseurs
   inventados y **nunca se ejecutó** — las tablas `Ecole` y `Fournisseur` están vacías. Como el
   PDF tampoco trae esos campos hoy, las facturas entran con `ecoleId`/`fournisseurId` en null.
   Hay que cargar el catálogo real de CSDM y decidir quién completa esos datos.
5. **`montant` sigue siendo obligatorio** en el schema. Si un PDF llega sin importe, la ingesta
   lo guarda como **0** y lo avisa en el correo de confirmación. Aceptable por ahora (los PDFs
   reales sí lo traen), pero es una trampa esperando.

Prioridad media:
5-bis. **Los fallos de ingesta no dejan rastro en la app**: solo se envía un correo a
   acostasalcedo. Hace falta registrar los intentos (éxito/fallo + motivo) en algún sitio
   consultable, o el próximo fallo también lo descubrirá el cliente.
5-ter. **Graph puede notificar el mismo mensaje más de una vez** (el 2026-07-27 salieron dos
   correos de error en el mismo segundo). Hoy no rompe nada porque `procesarCertificat()` es
   idempotente, pero conviene confirmarlo y, si se repite, deduplicar por `messageId`.
6. Limpiar el schema: quitar `User/Account/Session/VerificationToken` (huérfanas tras eliminar
   PrismaAdapter) y decidir si se borra `src/lib/azure-blob.ts` o se migra a Blob.
7. Estrategia de migraciones: hoy `prisma/migrations/` está gitignoreado. Decidir si se versiona
   y se añade `migrate deploy` al CI, o se documenta `db push` como el método oficial.
8. Sacar del repo `deploy_pkg/` y `deploy_pkg.zip` (24 MB, artefactos de deploy manual) —
   añadirlos al `.gitignore`.
9. `src/app/api/webhook/correo/route.ts` no valida firma más allá de `clientState`; revisar si
   basta para el criterio de seguridad del cliente.

Preguntas abiertas para el cliente/Deyby:
- ¿El sistema arranca en el tenant de CSDM o se queda en dynamixmtl como piloto?
- ¿Quién administra la cuenta que recibe los correos (`WEBHOOK_ADMIN_EMAIL`) en producción?
- ¿Se mantiene el remitente único autorizado o habrá varios usuarios enviando facturas?
