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

## Estado actual (2026-10-08)

**Ingesta abierta a todo `@csdm.qc.ca` + el proveedor ve el certificat en PDF.**
- **Remitentes**: se procesa cualquier `@csdm.qc.ca` (dominio exacto) cuyo asunto empiece por
  `SRM_Projet` (o `SRM_Project`). Lógica en `src/lib/ingesta-filtro.ts`, compartida por el
  webhook y `scripts/backfill-courriels.mts` (que ahora acepta una fecha `desde`).
- **Visor del certificat** en `/facture/{n°}`: vista previa embebida + «Ouvrir le PDF», servido
  por la ruta pública `api/facture/[numero]/certificat`.
- **Desplegado** (commit `8c904ff`, CI verde 2026-10-08) y verificado en producción: VJA,
  MJC y `Fact CR J'accepte` muestran el visor y el PDF se sirve (200, `application/pdf`).
- **Reprocesados** con el backfill desde 2026-10-02: `VJA` (pageau.v) y `MJC` (recuerda.m)
  creadas; su plazo de 30 días corre desde el 2026-10-08 (fecha de creación).
- ⚠️ **El asunto es `{n°}_{ID}`** (`VJA_36385`): la página es `/facture/VJA`, **no**
  `/facture/VJA_36385` (esa da «pas encore disponible»). Si el enlace del correo automático
  se arma con el asunto completo, fallará. Pendiente confirmar cómo lo arma el cliente.

## Estado anterior (2026-10-06)

**Han empezado a enviar certificats otras personas y la app los descarta en silencio.**
El 2026-10-02 llegaron `VJA_36385` (de `pageau.v@csdm.qc.ca`) y `MJC_36387` (de
`recuerda.m@csdm.qc.ca`). El webhook solo acepta `acostasalcedo.d@csdm.qc.ca`, así que
**no se creó ninguna factura ni se mandó ningún correo de error**, y sus enlaces dicen «pas encore
disponible». Las facturas que sí están en la BD abren todas (comprobadas las 25 últimas en
producción). **Pendiente de decisión del cliente:** ampliar los remitentes autorizados y
reprocesar esos 2 correos. Detalle en `Aprendizaje.md` § Objetivo 9.

## Estado anterior (2026-10-01)

**Los n° de factura con espacio vuelven a abrir su página.** `Fact CR J'accepte` se ingirió
bien pero `/facture/Fact%20CR%20J'accepte` decía «pas encore disponible»: el bug latente del
2026-09-03. Esta vez **se arregla en código** (`numerosDesdeRuta()` en `src/lib/utils.ts`,
usado en la página y en `repondre`). Verificado con build local (solo GET).
**Desplegado** (commit `f723549`, CI verde 2026-10-01 14:55Z) y verificado en producción:
la página muestra la factura y los botones. El POST real de respuesta queda para el proveedor.

## Estado anterior (2026-09-26)

**Por fin se deja de mandar el acuse de ingesta `[CRÉÉE]` / `[MISE À JOUR]`.** El cambio
estaba escrito y verificado desde el **2026-08-17**, pero **nunca se commiteó**: pasó 40 días
en el working tree mientras producción seguía mandando los dos correos por factura. Lo
destapó el cliente al recibir `[EXTERNE]: [CRÉÉE] Facture JA1809`. Ver Lecciones
("verificado sobre el build" ≠ "desplegado").

## Estado anterior (2026-09-08, tarde)

**Formato nuevo del certificat: se lee la línea «ID: …».** El cliente actualizó la
plantilla de Power Automate y añadió al final `<a>ID: @{triggerBody()?['text_27']}</a>`.
Se añade `Factura.idFactura` (opcional), se extrae en el parser y el correo cambia la fila
`N° de facture` por **`ID Facture`**. Parser probado contra un PDF del formato nuevo
renderizado con el mismo Chromium, y sin regresión sobre los 4 certificats reales del buzón.
⚠️ **Bloqueado antes de desplegar**: falta `prisma db push` (la columna no existe en la BD
de producción; sin ella la ruta `repondre` reventaría) y falta que el cliente resuelva la
colisión de `text_27` (ver Decisiones). **No desplegar el código sin la columna.**

## Estado anterior (2026-09-08)

**La respuesta del proveedor deja de llevar comentario.** El formulario de `/facture/{n°}`
se queda en dos botones —«J'accepte» / «Je conteste»— sin caja de texto, y el correo que
recibe acostasalcedo pierde la fila `Commentaire`. Con ello **cae la exigencia de motivo
para contestar**. `tsc`, `next build` y verificación sobre `.next/` en verde.
**Pendiente de desplegar.**

## Estado anterior (2026-09-03)

**La página del proveedor se recorta a 7 campos.** `/facture/{n°}` mostraba 11 campos más
la cadena de aprobación completa con nombres y decisiones internas. El cliente marcó sobre
una captura qué se queda y qué se va: quedan los 7 de negocio, se va todo lo interno, y
«Date de la saisie» pasa a llamarse «Date de réception». Aplicado en
`src/app/facture/[numero]/page.tsx`; `tsc --noEmit` en verde. Ver
"Decisiones y reglas de negocio". **Pendiente de desplegar.**

## Estado anterior (2026-08-17)

**Un solo correo por factura: el de la respuesta del fournisseur.**

- El sistema mandaba **dos correos** por cada factura, en dos momentos distintos:
  `[CRÉÉE]` / `[MISE À JOUR]` al ingerir el certificat (con el enlace y los avisos), y
  `[J'ACCEPTE]` / `[JE CONTESTE]` cuando el proveedor respondía. En las pruebas del
  cliente los dos caían con 2 minutos de diferencia y parecían un duplicado.
  Comprobado en `sentitems` del buzón admin: **no había duplicación**, eran los dos
  correos por diseño (`T17_32309`, `t14_32175`, `test13_32059`, `13T_32035`,
  `10aug_31866` — todas con el mismo par).
- ✍️ **Escrito el fix del acuse de ingesta** (`src/app/api/webhook/correo/route.ts`): la
  ingesta correcta ya no escribe a nadie, solo deja traza en el log del servidor. Verificado
  sobre `.next/` tras el build: `transmettre` y `MISE` → 0 ocurrencias; los dos correos
  de fallo siguen ahí.
  ⚠️ **PERO NO SE COMMITEÓ NI SE DESPLEGÓ HASTA EL 2026-09-26.** Durante esos 40 días esta
  sección decía "quitado" y producción seguía mandando el acuse. Ver Lecciones.

## Estado anterior (2026-07-27)

**Primer correo real recibido — y descubrió que la ingesta nunca funcionó en el servidor.**

- ✅ **La cadena Graph → webhook funciona**: el 2026-07-27 a las 16:53:44Z entró el correo de
  acostasalcedo (`SRM_Projet 321 / . / Now2707_31758`) y la app reaccionó en 3 segundos.
- ❌ **Pero el parseo del PDF reventaba en producción**: `pdfjs` no encontraba su worker dentro
  del bundle de Next (ver Lecciones). Las 2 facturas históricas existían solo porque el backfill
  se corrió **en local**. → Corregido con `precargarWorker()` en `certificat-parser.ts`.
- ✅ El PDF nuevo parsea sin tocar el parser (`Now2707_31758`, 123 $, cadena de 5 aprobadores).
- ✅ **Desplegado y reprocesado**: la factura `Now2707_31758` existe y su página pública
  `/facture/Now2707_31758` sirve todos los datos + el formulario de respuesta del proveedor.
  **El circuito correo → factura → página pública está ejercido de punta a punta por primera
  vez con un correo real.**
- ✅ Segundo bug encontrado al verificar: `sendMail` (202 sin cuerpo) hacía que **cada correo
  correcto** fuera seguido de un `[ERREUR SYSTÈME]` al remitente. Corregido (ver Lecciones).
- ℹ️ acostasalcedo manda **dos correos por tanda**: uno de prueba sin adjunto y el del
  certificat. El de prueba se ignora en silencio, como está diseñado.
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
- **Ingesta por correo (cliente, 2026-10-08)**: se procesa **cualquier remitente
  `@csdm.qc.ca`** (dominio exacto, no subdominios ni parecidos) **y solo si el asunto empieza
  por `SRM_Projet`** (se acepta también `SRM_Project`). Antes era solo
  `acostasalcedo.d@csdm.qc.ca`; empezaron a enviar pageau.v y recuerda.m y sus certificats
  se descartaban en silencio. El filtro de asunto es obligatorio: los mismos remitentes
  mandan al buzón correspondencia con PDF (registro de fournisseurs) que, sin él, daría
  `[ERREUR]`. Los 67 certificats históricos cumplen el patrón. Fuera de filtro → se ignora
  en silencio. Lógica en `src/lib/ingesta-filtro.ts`.
  - La respuesta del proveedor va a `Factura.responsableEmail` = **quien envió el
    certificat**, así que cada persona recibe la respuesta de sus propias facturas.
  - `[ERREUR SYSTÈME]` antes de leer el remitente sigue yendo a acostasalcedo.
  El webhook valida con `clientState === WEBHOOK_SECRET` y responde 202 en <30s como exige Graph.
- **Toda la UI en francés**; los identificadores del código en español/francés mezclados
  (`nombreFactura`, `noProjet`, `dateSaisie`). Es intencional, no unificar sin avisar.
- El tenant Azure actualmente configurado en CI es **dynamixmtl** (el de desarrollo/Deyby),
  no el de CSDM. Ver Pendientes.

## Flujo de la factura (confirmado con el cliente el 2026-07-19)

```
1. acostasalcedo ──correo + CertificatCR.pdf──> admin@dynamixmtl.com
2. la app parsea el PDF y crea/actualiza la factura  ← en silencio, sin acusar recibo
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
- Compensaciones ante esa URL adivinable: **una sola respuesta por factura** (409 después)
  e **IP guardada como rastro**. ⚠️ *Las otras dos compensaciones ya no existen: el
  comentario se eliminó el 2026-09-08, y con él el escape de texto de un tercero y el
  rechazo-sin-motivo-denegado.*
- El proveedor solo **acepta o contesta** — nada de los checks internos, y desde el
  2026-09-08 **sin comentario** (ver la regla de abajo).
- **Vocabulario del proveedor (cliente, 2026-07-31): «J'accepte» / «Je conteste»**, no
  «Approuver / Refuser». Se aplica a los botones, al bloque de factura ya respondida
  («Facture acceptée / contestée»), al correo (`[RÉPONSE ACCEPTÉE]` / `[RÉPONSE CONTESTÉE]`,
  "Le fournisseur a accepté / contesté la facture") y al badge de la galería del admin
  («Accepté / Contesté»).
  ⚠️ **No confundir con la cadena interna**: los 6 aprobadores de la CSDM siguen siendo
  «Approuvé / Refusé» — ese texto viene del PDF y describe a otro actor. `EstatusAprobador`
  en la base **sigue siendo `APPROUVE` / `REFUSE`**: cambió el texto, no el modelo de datos.
- **La página pública del proveedor muestra SOLO 7 campos (cliente, 2026-09-03).**
  `/facture/{n°}` es lo que ve un tercero externo a la CSDM, así que solo lleva lo que
  necesita para reconocer su propia factura y responder:
  **N° de facture · Montant total (taxes incl.) · Projet · Date de la facture ·
  Date de réception · Fournisseur · École.**
  - **Se quitó todo lo interno**: `Agent administratif`, `Indice comptable`,
    `Paiement rapide`, `Fournisseur homologué` y **la `Chaîne d'approbation` entera**
    (con ella se fue el componente `ChaineApprobation` y la tabla `ROLES_AFFICHES` de
    `src/app/facture/[numero]/page.tsx`). Eran datos de gestión interna —incluidos los
    nombres y decisiones de los 6 aprobadores de la CSDM— expuestos en una URL
    deducible a propósito: quitarlos también **reduce la fuga de información**.
  - **`Date de la saisie` → `Date de réception`**: cambia **solo la etiqueta** de la
    página pública. El dato sigue siendo `Factura.dateSaisie`, que viene del
    «Date de saisie» del PDF; el admin (`FacturaDetalle`, `FacturaForm`) conserva su
    vocabulario. Mismo criterio que con «J'accepte / Je conteste»: el proveedor lee su
    propio idioma, el modelo de datos no se toca.
  - ⚠️ **La chaîne d'approbation no desaparece del sistema**, solo del ojo del proveedor:
    sigue viva en el modelo, en la ingesta y en la vista de admin.
  - ⚠️ **Excepción decidida el 2026-10-08: el PDF del certificat se muestra TAL CUAL** en
    la página (visor + «Ouvrir le PDF»), y el PDF **sí trae** la chaîne d'approbation,
    indice comptable, etc. El usuario lo decidió sabiendo que contradice el recorte del
    2026-09-03. Solo se sirve el documento `Certificat*.pdf` de la ingesta
    (`whereCertificat()` en `db-storage.ts`), nunca otros documentos subidos en la app.
  - ⚠️ El PDF se guarda **una sola vez** (el de la primera ingesta): si se reenvía el
    certificat con cambios, la factura se actualiza pero el PDF que ve el proveedor es el
    viejo.
- **El certificat trae un «ID» nuevo, distinto del n° de factura (cliente, 2026-09-08).**
  La plantilla nueva imprime al final una línea `ID: <valor>` y **ese** es el dato que el
  cliente quiere ver en el correo, con la etiqueta **`ID Facture`** — para que nadie lo
  confunda con el n° de factura, que **no cambia**: sigue siendo `nombreFactura`, lo que se
  parsea de `N° DE FACTURE` y lo que ve el proveedor en `/facture/{n°}`.
  - Se guarda en **`Factura.idFactura`, opcional a propósito**: los certificats del formato
    viejo no traen la línea y su ingesta **no debe fallar** por eso (solo deja un warning
    en el log). Comprobado: los 4 PDF reales del buzón siguen parseando.
  - **No es etiqueta-encima-de-valor** como el resto de campos: va todo en una fila, así que
    `extraerIdFactura()` busca por el prefijo `ID:` y **junta los items de la fila antes de
    comparar** (pdfjs parte el texto en trozos arbitrarios).
  - En el correo, la fila `N° de facture` **se sustituye** por `ID Facture`. No se pierde
    identificación: el n° de factura sigue en el **asunto** y en la frase de apertura.
    Sin ID, la fila va vacía — rellenarla con el n° de factura sería justo la confusión
    que se quiere evitar.
  - ⚠️ **DEFECTO EN LA PLANTILLA DEL CLIENTE, sin resolver:** el `<a>ID: …</a>` usa
    `@{triggerBody()?['text_27']}`, que es **el mismo token que «Direction adjointe de
    service → Nom, Prénom»**. Tal cual está, el PDF imprimirá un **nombre de persona** donde
    debería ir el ID. Reproducido: renderizando la plantilla, el parser devuelve
    `idFactura: "MARTIN Sophie"`. El arreglo es en Power Automate, no en este repo.
  - ℹ️ La plantilla nueva también deja la fila «Direction de service» con celdas
    **fijas y vacías** (sin ningún token): ese aprobador nunca se rellenará.
- **La respuesta del proveedor NO lleva comentario (cliente, 2026-09-08).** El formulario
  de `/facture/{n°}` son **solo los dos botones**; el correo a acostasalcedo pierde la fila
  `Commentaire`. La respuesta queda reducida a un hecho binario con fecha.
  - **Consecuencia obligada: se quitó el comentario obligatorio para «Je conteste».** La API
    devolvía 400 (`"Un commentaire est obligatoire pour contester la facture"`); sin caja de
    texto, esa regla dejaba «Je conteste» **inutilizable**. No fue una decisión aparte: era
    quitar las dos cosas o ninguna.
  - **El motivo de una contestación ya no viaja por el sistema.** Antes llegaba escrito en
    el correo; ahora acostasalcedo sabe *que* se contestó, no *por qué*, y tiene que
    preguntárselo al proveedor por fuera. Contrapartida asumida por el cliente.
  - **La columna `comentario` de `HistorialAprobacion` se conserva** — cambió la UI, no el
    modelo. Las respuestas viejas mantienen su texto y se siguen viendo en el tooltip de la
    galería del admin y en el bloque de factura-ya-respondida de la página pública.
  - ⚠️ **No confundir con los otros «Commentaires» de la app**, que siguen intactos:
    `commentairesResponsable` / `commentairesAdmin` del formulario de admin y el comentario
    de la cadena interna (`facturas/[id]/aprobar`). Solo se tocó el flujo del proveedor.
  - Si el cuerpo del POST trae `comentario` (llamada directa a la ruta pública), **se ignora**.
- **La ingesta correcta no envía correo (cliente, 2026-08-17).** El sistema emite **un
  solo correo por factura**: el de la respuesta del fournisseur. El acuse
  `[CRÉÉE]` / `[MISE À JOUR]` que se mandaba al procesar el certificat **se eliminó**
  — el cliente veía dos correos seguidos y solo quería el de la respuesta.
  - No se pierde nada operativo: el enlace que llevaba ese acuse es **deducible a
    propósito** (`/facture/{n°}`) y acostasalcedo lo construye a mano de todos modos.
  - Los avisos que llevaba (`École`/`Fournisseur introuvable dans le catalogue`) eran
    **ruido constante**, no señal: los catálogos están vacíos, así que saltaban en
    todas las facturas. Ahora van al log del servidor.
  - ⚠️ **Los fallos sí siguen avisando** (`[ERREUR]` y `[ERREUR SYSTÈME]`): sin eso, un
    fallo de ingesta sería totalmente mudo. No borrar esas dos ramas.
  - **Contrapartida asumida:** una ingesta correcta ya no se confirma por ningún canal
    visible para el cliente. Refuerza el pendiente 5-bis (registrar los intentos en la app).
- **Plazo de respuesta: 30 días** (`JOURS_POUR_REPONDRE` en `src/lib/delai-reponse.ts`).
  Se ancla en `Factura.createdAt` — cuando se procesó el correo la primera vez — y **no se
  mueve nunca**: si acostasalcedo reenvía el certificat, la factura se actualiza pero el plazo
  se mantiene. Decisión del cliente el 2026-07-30, para que **un enlace vencido no pueda
  revivir** por un reenvío sin que nadie se entere.
  - Vencido: la página sigue mostrando la factura (con el aviso "Délai de réponse expiré" y la
    fecha), pero **sin formulario**; la API responde **410** y no escribe nada.
  - Vigente: el formulario avisa "Vous avez jusqu'au {fecha} — il reste N jours", en ámbar
    cuando quedan ≤ 5 días.
  - **No se usó el campo `dateLimite` del schema**: ya significa otra cosa ("Date limite
    (paiement rapide)" en el formulario de admin). El plazo se calcula, no se almacena.
- **El correo de respuesta al proveedor** lleva: n° de facture, réponse, **date et heure de la
  réponse** (horario de Montréal), projet, montant y el commentaire. Pedido por el cliente el
  2026-07-30, afinado el 2026-07-31:
  - La réponse se escribe **con la misma etiqueta que ve el proveedor** — «J'accepte» /
    «Je conteste», no una variante conjugada — para que quien lea el correo reconozca al
    instante qué botón se pulsó. Asunto: `[J'ACCEPTE]` / `[JE CONTESTE]`.
  - **Sin comentario, la fila va vacía**: nada de "Aucun commentaire" ni texto de relleno.
    La fila se conserva para que el correo tenga siempre la misma forma.

## Lecciones técnicas

- **«Verificado sobre el build» no es «desplegado» — y la memoria puede mentir con las dos
  cosas en verde.** El 2026-08-17 se quitó el acuse `[CRÉÉE]` / `[MISE À JOUR]`, se comprobó
  sobre `.next/` y se escribió en MEMORIA como hecho. **Nunca se commiteó.** El cambio
  sobrevivió 40 días en el working tree —cruzando varias sesiones y hasta un `git stash`
  durante un rebase— mientras producción seguía mandando dos correos por factura. Lo
  descubrió el cliente el 2026-09-26 recibiendo `[EXTERNE]: [CRÉÉE] Facture JA1809`.
  **Regla:** un cambio no está hecho hasta que está en `origin/main` **y** el CI terminó.
  Al cerrar un bloque, mirar `git status` y no solo el resultado de las pruebas; y al
  escribir en MEMORIA, distinguir siempre **escrito / commiteado / desplegado**.
  *(El prefijo `[EXTERNE]:` del asunto lo añade la pasarela de correo de la CSDM, no la app:
  al buscar el origen de un correo hay que quitarlo antes de hacer grep en el código.)*
- **Next.js 15 entrega el parámetro de ruta SIN decodificar → un espacio en el n° de factura
  rompe el enlace del proveedor.** Diagnosticado el 2026-09-03 con `Je conteste_03sept_33988`.
  La ingesta la creó bien (proyecto y montante correctos, visible en la galería), pero
  `/facture/Je%20conteste_03sept_33988` mostraba *«Facture pas encore disponible»*.
  Causa: en `src/app/facture/[numero]/page.tsx`, `const { numero } = await params` llega como
  el literal `"Je%20conteste_03sept_33988"` (comprobado con `charCodeAt`: `37,50,48` = `%20`),
  mientras que en la BD el valor tiene un espacio real (código 32). `findFirst` no encuentra
  nada y cae en la rama del correo-no-procesado.
  **Lo engañoso es el mensaje**: esa rama existe para "el certificat aún no ha entrado", así
  que un fallo de *lookup* se disfraza de fallo de *ingesta* y manda a diagnosticar el buzón,
  que es el sitio equivocado.
  - **Reproducido en local igual que en producción** → es Next, no Azure ni el proxy.
  - **Solo rompe el espacio**: `Fact_J'accepte_33689` abre bien con `'` crudo y con `%27`.
  - El botón «copier le lien» **no tiene la culpa**: aplica `encodeURIComponent` como debe.
  - ~~Decisión del cliente (2026-09-03): los n° de factura nunca llevarán espacios~~ —
    **no se cumplió**: el 2026-10-01 entró `Fact CR J'accepte`. **Corregido en código el
    2026-10-01** con `numerosDesdeRuta()` (decodifica y busca por `[decodificado, crudo]`).
    Lo de abajo queda como historia. Queda latente para cualquier otro carácter
    que viaje codificado (acentos, etc.); el arreglo sería `decodeURIComponent` sobre el
    parámetro en la página **y** en `api/facture/[numero]/repondre`.
  - Las facturas viejas con espacio (`Je conteste_03sept_33988`, `Je conteste_33907`)
    **reviven con el fix**, sin tocar la BD.
  **Lección de método:** ante un «pas encore disponible», comparar **los bytes** del parámetro
  con los de `nombreFactura` en la BD antes de mirar el buzón.
- **Un «pas encore disponible» puede ser también un remitente no autorizado** (2026-10-06).
  El filtro de `REMITENTE_AUTORIZADO` descarta sin dejar rastro ni avisar: el certificat está
  en el inbox y no hay nada en `sentitems`. Orden de diagnóstico: ¿la factura está en la BD?
  → si no, mirar en el **inbox** quién envió el correo (no solo `sentitems`).
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
- **`sendMail` de Graph responde 202 con el cuerpo VACÍO — y `res.json()` sobre vacío lanza.**
  `graphAppFetch()` solo trataba el 204 como "sin cuerpo", así que **cada envío correcto
  terminaba lanzando** un `SyntaxError` después de haber enviado el correo. En el webhook eso
  caía en el `catch` general y disparaba un **`[ERREUR SYSTÈME]` al remitente detrás de cada
  correo bueno**, incluido el `[CRÉÉE]`. Fue lo que hizo parecer que la ingesta seguía rota
  cuando ya funcionaba. Corregido el 2026-07-27: se decide por el **cuerpo**, no por el código
  (`const t = await res.text(); return t ? JSON.parse(t) : undefined`).
  **Gotcha:** en `facture/[numero]/repondre` y `facturas/[id]/aprobar` el mismo fallo era
  invisible porque llaman con `.catch(console.error)` — el correo salía y nadie se enteraba del
  error. Un bug idéntico puede estar mudo en un sitio y ser escandaloso en otro.
- **Las fechas con hora se fijan a `America/Montreal` a mano.** El servidor corre en UTC y el
  destinatario está en Montréal: cualquier regla de tipo "fin del día" da un corte distinto
  según dónde corra el proceso. Por eso el plazo de respuesta es un **instante exacto**
  (`createdAt + 30 días`) y se muestra con `formatDateHeure()` (`Intl` + `timeZone`), no con
  `endOfDay()`. Comprobado ejecutando la misma lógica con `TZ=UTC` y `TZ=Asia/Tokyo`: salida
  idéntica. Si alguna vez se vuelve a "final del día", hay que fijar la zona explícitamente.
- **⚠️ Levantar el build local contra la BD de producción es peligroso: `POST` escribe de
  verdad.** El 2026-07-31, probando el plazo, un servidor local viejo seguía escuchando en el
  puerto y se llevó el POST: registró una **respuesta de proveedor falsa** en
  `Now2707_31758` (aprobada, IP `127.0.0.1`) y **envió un correo real a acostasalcedo**. La
  fila se pudo borrar y el estado volver a `OUVERT`; el correo no se puede deshacer.
  **Regla:** antes de hacer un POST contra un servidor local, **confirmar con un GET qué build
  está sirviendo** (`kill` no garantiza que el puerto quedara libre), y preferir puertos nuevos
  a reutilizar el mismo.
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
5-ter. ~~Graph notifica dos veces~~ → **descartado el 2026-07-27.** Los correos duplicados no
   eran notificaciones repetidas sino el bug del 202 de `sendMail` (ver Lecciones). Verificado
   tras el fix: una notificación → **un solo correo**. No hace falta deduplicar por `messageId`.
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
- ~~¿Se mantiene el remitente único autorizado?~~ → todo `@csdm.qc.ca` + asunto `SRM_Projet` (2026-10-08).
