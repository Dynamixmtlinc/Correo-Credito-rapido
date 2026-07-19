# Aprendizaje — Approbations de Factures

> Documento vivo de la skill `/aprendizaje`. Acumula todas las preguntas técnicas y sus
> respuestas hasta dominar el problema y resolverlo sin fallos.
>
> **Estados de pregunta:** ❓ Abierta · 🔎 Investigando · ✅ Resuelta · ⏸ Bloqueada (espera al usuario)

## Objetivo / necesidad

**Objetivo 1 — ✅ LOGRADO el 2026-07-19.** Verificar y dejar funcionando el login con
Microsoft Entra ID en producción. Causa: `UntrustedHost`; fix: `AUTH_TRUST_HOST=true`.
Login humano confirmado por el usuario.

**Objetivo 2 — 🔄 EN CURSO desde el 2026-07-19.** Dos piezas ligadas:
  1. **Procesar los correos** que llegan al buzón `admin@dynamixmtl.com` enviados por
     `acostasalcedo.d@csdm.qc.ca`, para que generen facturas en el sistema.
  2. **Página de respuesta para aprobador externo**: una ruta a la que un usuario externo
     (sin cuenta / sin login) pueda entrar mediante un enlace y responder a la factura con
     opciones ya predefinidas (aprobar / rechazar / comentar).

## Rol asumido

- **Objetivo 1:** Ingeniero de identidad Azure / NextAuth v5.
- **Objetivo 2:** **Integrador de sistemas + arquitecto de flujos de aprobación** — el reto es
  el contrato de datos entre los correos reales de SGDI/CSDM y el modelo `Factura`, más el
  diseño de un acceso externo sin sesión que sea seguro.

## Progreso

- **Objetivo 2 — % de información:** 85%
- **Objetivo 1 — % de información:** 100% (cerrado)
- **Resumen del estado actual:** Objetivo 1 cerrado. Objetivo 2: la ingesta **nunca ha corrido**
  (0 suscripciones de Graph, P8) y el parser actual **no sirve** — se escribió contra un formato
  `CLAVE: valor` con prefijo `[FACTURE]` que no existe en la realidad (P9). **Pero los datos sí
  llegan**: están en el PDF adjunto `CertificatCR.pdf`, que es texto extraíble y de plantilla
  estable (P10-bis, corrige mi error inicial). Los documentos viven en SharePoint (P19).
  La página de aprobación externa no existe y es obra nueva (P11).
  **Bloqueantes reales:** los emails de los aprobadores no aparecen en ninguna parte (P21), y
  las 2 muestras disponibles son datos de prueba con campos vacíos (P23).

## Fuentes recibidas / consultadas

- Sondeo HTTP directo a producción (2026-07-19) — evidencia primaria del fallo.
- `gh run list` (2026-07-19) — historial de despliegues; el último éxito es del 2026-07-08.
- `src/lib/auth.ts`, `.github/workflows/azure-deploy.yml`, `deploy_pkg/server.js` (build real).
- `az account list` — la suscripción de este proyecto NO está en la sesión actual del CLI.

## Preguntas y respuestas

### P1 — ¿El login funciona hoy en producción? · ✅ Resuelta
- **Por qué importa:** es el objetivo; todo lo demás depende de la respuesta.
- **Respuesta:** **NO funciona.** Sondeo del 2026-07-19:
  - `GET /` → **200** (la app arranca y sirve).
  - `GET /auth/signin` → **200** (la página de login renderiza).
  - `GET /api/auth/providers` → **500** `{"message":"There was a problem with the server
    configuration..."}`
  - `GET /api/auth/csrf` → **500** (mismo error)
  - `GET /api/auth/session` → **500** (mismo error)
  - `GET /api/auth/signin` → 302
  Que `/api/auth/csrf` falle es determinante: ese endpoint no toca Entra ID, solo necesita la
  configuración base de NextAuth. El fallo es **anterior a cualquier interacción con Azure AD**.

### P2 — ¿El código con el fix de `AUTH_SECRET` llegó realmente a producción? · ✅ Resuelta
- **Por qué importa:** si el último commit nunca se desplegó, el diagnóstico sería trivial.
- **Respuesta:** Sí llegó. `gh run list` muestra el run del commit `144fd89`
  ("ajouter AUTH_SECRET explicite") **completado con éxito** el 2026-07-08T23:25Z. Por tanto el
  código desplegado ya lee `AUTH_SECRET ?? NEXTAUTH_SECRET` y **sigue fallando** → el problema
  es que la variable no existe en runtime, o hay una segunda causa.

### P3 — ¿Está `trustHost` configurado? · ✅ Resuelta (y es sospechoso principal)
- **Por qué importa:** NextAuth v5 fuera de Vercel exige confiar explícitamente en el host.
  Detrás del proxy de App Service, sin esto lanza `UntrustedHost`, que se presenta al cliente
  con **exactamente** el mensaje genérico de "server configuration" que estamos viendo.
- **Respuesta:** **No está.** `grep` de `trustHost` / `AUTH_TRUST_HOST` / `AUTH_URL` sobre
  `src/` y `.github/` no devuelve ninguna coincidencia. `auth.ts` no pasa `trustHost: true` y
  el workflow no define `AUTH_TRUST_HOST`. → **Hipótesis H1**, fix de código.

### P4 — ¿El workflow inyecta las variables de entorno al App Service? · ✅ Resuelta
- **Por qué importa:** si el CI no las pone y nadie las puso a mano, NextAuth arranca sin
  secreto ni credenciales y falla exactamente así.
- **Respuesta:** **No las inyecta.** El workflow define `NEXTAUTH_URL` **solo en el step de
  build** (paso 5), lo cual afecta al build de Next pero **no persiste como app setting del
  App Service**. No hay ningún `az webapp config appsettings set` en el pipeline, y por diseño
  se eliminaron los secrets de GitHub ("aucun secret GitHub requis", commit `7b12d3a`).
  → Las variables **deben existir manualmente** en el App Service. **Hipótesis H2**.
  - Efecto colateral confirmado: `NEXTAUTH_URL` tampoco existe en runtime, así que
    `POST /api/webhook/suscripcion` devolvería "NEXTAUTH_URL non configurée" y los enlaces de
    los correos de aprobación (`aprobar/route.ts:90`) saldrían con URL vacía.

### P5 — ¿Qué app settings tiene hoy el App Service `cr-dynamixmtl`? · ✅ Resuelta
- **Por qué importa:** distingue H1 de H2 y es la comprobación definitiva.
- **Respuesta:** (tras `az login` del usuario al tenant dynamixmtl, 2026-07-19). El recurso vive
  en el resource group **`rg-creditrapide`**, no en `rg-approbations-factures`: es un App
  Service **reutilizado de otro proyecto** (Credit Rapide). Estado de las variables:
  - `AUTH_SECRET` → **AUSENTE**, pero `NEXTAUTH_SECRET` presente (44 chars) y el código hace
    fallback → **el secreto sí llega**. H2 refutada en su parte principal.
  - `AZURE_AD_CLIENT_ID` (36), `AZURE_AD_CLIENT_SECRET` (40), `AZURE_AD_TENANT_ID`
    (`0f0db576-…`, coincide con el workflow), `WEBHOOK_SECRET` (40) → todas presentes.
  - `NEXTAUTH_URL` = `https://cr-dynamixmtl.azurewebsites.net` → **correcta**. (Es decir: sí
    existe en runtime, contra lo que supuse en P4; alguien la puso a mano.)
  - `DATABASE_URL` → apunta a **Railway** (`acela.proxy.rlwy.net:27865`, db `railway`), **no a
    Azure Postgres**. Contradice `GUIA_DESPLIEGUE.md`. Registrado en `MEMORIA.md`.

### P6 — ¿Qué dice el log del servidor? · ✅ Resuelta — CAUSA RAÍZ
- **Por qué importa:** el mensaje HTTP es deliberadamente genérico; el log del App Service trae
  el error real de NextAuth y cierra el diagnóstico sin adivinar.
- **Respuesta:** Capturado en vivo (`az webapp log tail` mientras se golpeaba `/api/auth/csrf`
  12 veces, 2026-07-19T21:30Z). El error, repetido en cada request:

  ```
  [auth][error] UntrustedHost: Host must be trusted. URL was:
  https://cr-dynamixmtl.azurewebsites.net/api/auth/csrf
  https://errors.authjs.dev#untrustedhost
      at /home/site/wwwroot/.next/server/chunks/842.js:404:54187
  ```

  **H1 confirmada al 100%.** No tenía nada que ver con el secreto ni con Entra ID: NextAuth v5
  fuera de Vercel exige declarar la confianza en el host, y detrás del proxy de App Service la
  cabecera `Host` no se acepta por defecto. Los 4 commits de julio atacaron la causa
  equivocada.
- **Fix aplicado:** `trustHost: true` en `src/lib/auth.ts` (2026-07-19). `tsc --noEmit` exit 0.
  **Pendiente de desplegar y revalidar.**

### P7 — ¿El redirect URI registrado en Entra ID coincide con el dominio real? · ✅ Resuelta
- **Respuesta (2026-07-19):** Sí, coincide exacto. App registration `app-facturacion`
  (`ab66ed5f-06b6-4402-91ea-eb211e88be0f`), `signInAudience: AzureADMyOrg`, redirect URI
  `https://cr-dynamixmtl.azurewebsites.net/api/auth/callback/microsoft-entra-id` — idéntico al
  `callbackUrl` que expone `/api/auth/providers`. No hubo `AADSTS50011`. Login humano
  confirmado por el usuario.

<!-- contexto original de la pregunta -->

- **Por qué importa:** aunque se arreglen H1/H2, si el registro de la app apunta al dominio de
  la guía (`app-approbations-factures`) y no a `cr-dynamixmtl`, el callback fallará con
  `AADSTS50011` en cuanto el flujo llegue a Entra ID.
- **Respuesta:** pendiente. `GUIA_DESPLIEGUE.md` documenta el redirect URI con el nombre viejo
  `app-approbations-factures.azurewebsites.net`, pero el App Service real se llama
  `cr-dynamixmtl`. **Discrepancia a verificar.**

## Decisiones de diseño / arquitectura

- El diagnóstico se hace **de fuera hacia dentro**: sondeo HTTP (hecho) → app settings → logs →
  flujo OIDC completo en navegador. No tocar código hasta confirmar la causa con el log.
- `AUTH_TRUST_HOST` / `trustHost: true` es necesario en App Service **independientemente** de
  cuál resulte ser la causa: es correctitud, no parche. Se aplicará igual.
- Las variables de entorno se gestionarán como **app settings del App Service**, no como
  secrets de GitHub, para no romper el diseño OIDC sin secretos ya adoptado.

## Plan de solución

1. **(Bloqueante)** `az login` contra el tenant `0f0db576-…` para recuperar acceso al recurso.
2. Leer `az webapp config appsettings list` → confirmar si faltan `AUTH_SECRET`,
   `AZURE_AD_*`, `NEXTAUTH_URL`, `DATABASE_URL`.
3. Leer el log real (`az webapp log tail`) mientras se golpea `/api/auth/csrf` → nombre exacto
   del error de NextAuth.
4. Aplicar el fix según el error: `trustHost: true` en `auth.ts` (H1) y/o poblar los app
   settings (H2).
5. Verificar el redirect URI en el registro de Entra ID contra `cr-dynamixmtl` (P7).
6. **Validación final end-to-end**: `/api/auth/csrf` → 200 con token, y login real en navegador
   hasta ver la sesión creada y la galería de facturas cargando.

## Riesgos y cómo se mitigan

- **Reiniciar el App Service tras cambiar app settings**: Azure lo hace solo, pero hay que
  esperar a que el contenedor levante antes de re-sondear, o se lee un falso negativo.
- **Arreglar solo H2 y no H1**: quedaría fallando por `UntrustedHost` y parecería que el fix no
  sirvió. Por eso se aplican ambos y luego se valida.
- **Secretos**: nunca copiar valores de app settings a este archivo ni a `MEMORIA.md`; solo se
  registra si la variable existe o no.
- **Tenant equivocado**: el proyecto vive en dynamixmtl, no en CSDM. No confundir credenciales
  entre ambos al hacer login.

---

# Objetivo 2 — Ingesta de correos + página de aprobación externa

## Hallazgos de la investigación (2026-07-19)

### P8 — ¿Está viva la ingesta de correos? · ✅ Resuelta
- **Por qué importa:** es la premisa del objetivo.
- **Respuesta:** **NO.** Consulta a Graph `/subscriptions` con el token app-only:
  **0 suscripciones activas**. El webhook nunca se ha activado (o expiró: las suscripciones de
  correo de Graph duran ~3 días). Ningún correo se ha procesado jamás.
- **Consecuencia crítica:** las suscripciones de Graph son **push solo para correo NUEVO**.
  Aunque se cree la suscripción hoy, **los correos que ya están en el buzón NO se procesarán**.
  Hace falta un mecanismo aparte de *backfill* que recorra el inbox existente.

### P9 — ¿El formato real de los correos coincide con lo que el parser espera? · ✅ Resuelta — BLOQUEANTE
- **Por qué importa:** determina si "procesar los correos" es configurar algo o reescribir.
- **Respuesta:** **No coinciden en absoluto.** Ni un solo correo real pasaría el parser.

  **Lo que `email-parser.ts` espera:** asunto con prefijo `[FACTURE]` y cuerpo con campos
  `CLAVE: valor` — `FACTURE:`, `PROJET:`, `ECOLE:`, `FOURNISSEUR:`, `MONTANT:`,
  `DATE_FACTURE:`, más `CP:`, `REGISSEUR:`, etc. con los **emails** de los aprobadores.

  **Lo que llega de verdad** (3 correos de acostasalcedo en el buzón, leídos vía Graph):

  | Fecha | Asunto | Adjunto |
  |---|---|---|
  | 2026-07-08 | `SRM_Projet 150 / . / CR08-07_31477 ,Crédit Rapide` | `CertificatCR.pdf` |
  | 2026-06-22 | `SRM_Projet 500 / . / 21junCR_30895 ,Crédit Rapide` | `CertificatCR.pdf` |
  | 2026-05-29 | `CreditRapide` | (ninguno) |

  Son **notificaciones generadas por SGDI**, en prosa francesa, con una tabla de flujo de
  aprobación (rol, nombre, fecha, comentario, estado) y un enlace "Cliquer ici" a los
  documentos. **Ningún campo `CLAVE: valor`. Ningún prefijo `[FACTURE]`.**

  Además, el filtro `subject.startsWith("[FACTURE]")` descarta los 3 correos **antes incluso**
  de intentar parsearlos: fallarían en silencio, sin avisar a nadie.

### P10 — ¿Los datos que exige el modelo `Factura` están en el correo? · ✅ Resuelta — BLOQUEANTE
- **Por qué importa:** si el dato no viene, no hay parser que lo invente.
- **Respuesta:** **Faltan campos obligatorios.**
  - *Sí* está: `srmProjet` (150 / 500), `nombreFactura` (`CR08-07_31477`), nombres de los
    aprobadores y sus fechas/estados, el PDF.
  - **NO está:** `montant`, `fournisseur`, `ecole`, `dateFacture` — **los cuatro obligatorios**
    en el parser y en el schema. Tampoco los **emails** de los aprobadores (solo nombres:
    "Recuerda Maximilien", "Acosta Salcedo Deyby De Jesus").
  - Candidatos para obtenerlos: el PDF `CertificatCR.pdf` adjunto, o el enlace "Cliquer ici"
    (SGDI, `SGDI_BASE_URL`, solo alcanzable desde el servidor).
  - **Sin resolver de dónde salen esos 4 campos + los emails, la ingesta no se puede construir.**

### P11 — ¿Existe ya alguna página de acceso externo sin login? · ✅ Resuelta
- **Por qué importa:** define si el objetivo 2.2 es extender o construir de cero.
- **Respuesta:** **No existe nada.** Se construye de cero.
  - Páginas actuales: `/`, `/auth/signin`, `/auth/error`, `/facturas/nouvelle`,
    `/facturas/[id]/modifier`. **No hay ruta pública ni tokenizada.**
  - No hay modelo de token de acceso en `schema.prisma` ni middleware.
  - `POST /api/facturas/[id]/aprobar` identifica al aprobador **por el email de la sesión**
    (`session.user.email` contra `cpEmail`/`regisseurEmail`/…). Para un externo sin sesión
    **este endpoint no sirve tal cual**: hace falta una vía que identifique al aprobador por
    token en vez de por sesión.

### P12 — Bug encontrado de paso: los enlaces de los correos apuntan a un 404 · ✅ Resuelta
- **Respuesta:** `aprobar/route.ts:90` y el webhook construyen enlaces
  `${appUrl}/facturas/${facturaId}`, pero **esa página no existe** (solo existe
  `/facturas/[id]/modifier`). Todo correo de decisión enviado hasta hoy lleva un enlace roto.

### P13 — ¿Los aprobadores reciben algún aviso hoy? · ✅ Resuelta
- **Respuesta:** **No.** Los únicos correos que salen son: `[ERREUR]` y `[CRÉÉE]` al remitente
  (acostasalcedo), y `[APPROUVÉE]`/`[REFUSÉE]` al `responsableEmail`. **A los aprobadores
  (CP, Régisseur, Coordo, Dir. adj., Dir. gén., COO) nunca se les escribe.** El circuito de
  aprobación depende hoy de que cada uno entre por su cuenta a la app.

## Preguntas abiertas — NECESITAN RESPUESTA DEL USUARIO

### P14 — ¿De dónde salen `montant`, `fournisseur`, `ecole` y `dateFacture`? · ⏸ Bloqueada
Del PDF adjunto, del enlace SGDI, o ¿los completa alguien a mano después? Es **la** decisión
que define toda la arquitectura de la ingesta.

### P15 — ¿Los aprobadores externos tienen cuenta Microsoft de CSDM? · ⏸ Bloqueada
Si la tienen, lo correcto es login normal (ya funciona) en vez de enlaces con token. Si no la
tienen, hace falta el modelo de token firmado + ruta pública.

### P16 — ¿Qué "opciones ya configuradas" debe ver el aprobador externo? · ⏸ Bloqueada
¿Solo Approuver / Refuser + comentario? ¿O también los checks del modelo
(`raisonSocialConforme`, `dixPourcentVerifier`, `fourHomologue`, `paimentRapide`…)?

### P17 — ¿Hay que procesar los 3 correos ya recibidos (backfill)? · ⏸ Bloqueada
El webhook solo dispara con correo nuevo. Si esos 3 deben entrar al sistema, hay que
construir además un proceso de recuperación del histórico.

### P18 — ¿Sigue siendo `acostasalcedo` el único remitente autorizado? · ⏸ Bloqueada
Hoy está hardcodeado en `webhook/correo/route.ts:14`.

---

## ⚠️ CORRECCIÓN a P9/P10 (2026-07-19) — me equivoqué

El usuario corrigió: *"los correos de acostasalcedo SÍ tienen los datos"*. **Tenía razón.**
Mi error: leí **solo el cuerpo** del correo y no abrí el **PDF adjunto**. Los datos están en
`CertificatCR.pdf`. Lo que sigue reemplaza la conclusión de P10.

### P10-bis — ¿Dónde están los datos de la factura? · ✅ Resuelta — EN EL PDF ADJUNTO
`CertificatCR.pdf` es una **"DEMANDE D'APPROBATION DE FACTURE"** con todos los campos.
Verificado en los 2 adjuntos del buzón (2026-07-08 y 2026-06-22).

**Es parseable sin OCR:** metadatos `/Creator (Chromium)` + `/Producer (Skia/PDF m126)` → es un
HTML renderizado a PDF por Chrome headless, con **capa de texto completa**. `pdftotext -layout`
lo extrae limpio y la maquetación es idéntica entre ambos → plantilla estable.

**Contenido (ejemplo real del 2026-07-08):**

| Campo del PDF | Valor | → campo del modelo |
|---|---|---|
| N° DE FACTURE | `CR08-07_31477` | `nombreFactura` |
| MONTANT TOTAL (TAXES INCL.) | `150 $` | `montant` (⚠️ ver nota) |
| MONTANT À PAYER (TAXES INCL.) | `100 $` | ⚠️ **no existe en el schema** |
| DATE DE LA FACTURE | `1 juillet 2026` | `dateFacture` (fecha en francés → parsear) |
| DATE DE LA SAISIE | `8 juillet 2026` | `dateSaisie` |
| PROJET | `150` | `noProjet` |
| AGENT ADMINISTRATIF | `Acosta Salcedo Deyby De Jesus` | `responsableNombre` (nombre, **sin email**) |
| PAIEMENT RAPIDE | `Oui` | `paimentRapide` |
| SRM / FOURNISSEUR HOMOLOGUÉ | `Non` | `fourHomologue` |
| Fournisseur : | `.` (vacío en las muestras) | `fournisseurId` |
| ÉCOLE | (vacío en las muestras) | `ecoleId` |
| INDICE COMPTABLE | (vacío en las muestras) | `indiceComptable` |
| Badge `⚠ EXIGE CRÉDIT` | presente | ⚠️ sin campo equivalente claro |
| CHAÎNE D'APPROBATION | tabla: rol, nombre, fecha, comentario, estado | `historialAprobacion` + `etat*` |

**Cadena de aprobación en las muestras:** `Chargé de projet` (Recuerda Maximilien — "Crédit
Rapide") y `Régisseur` (Acosta Salcedo — "Approuvé") ya resueltos; **`Coordonnateur`,
`Direction adjointe de service` y `Direction de service` vacíos, pendientes.**

### P19 — ¿Dónde están los documentos de la factura? · ✅ Resuelta — SHAREPOINT
El enlace "Accéder au dossier" del PDF (y el "Cliquer ici" del correo) apunta a:
`https://csdma.sharepoint.com/sites/SitedeFacturationPublic/MULTI  APPROBATION PUBLIC/<N° FACTURE>`
Una carpeta de SharePoint **nombrada con el número de factura**. Esto explica por qué
`GUIA_DESPLIEGUE.md` pide los permisos `Sites.ReadWrite.All` y `Files.ReadWrite`, que hasta
ahora no se usaban en el código.

### P20 — ¿Qué papel juega esta app en el circuito? · 🔎 Hipótesis fuerte, a confirmar
Los correos dicen *"vient d'être approuvée…"* y en el PDF los 3 últimos niveles están vacíos.
→ **Hipótesis:** SGDI/SharePoint resuelve `Chargé de projet` + `Régisseur`, y **esta app se
encarga de los niveles restantes** (Coordonnateur → Direction adjointe → Direction de service),
que son precisamente los "usuarios externos" que deben responder por enlace. Encaja con lo que
pidió el usuario. **Confirmar antes de construir.**

## Lo que SIGUE faltando (revisado)

### P21 — Los **emails** de los aprobadores no están en ninguna parte · ⏸ Bloqueada
El PDF y el correo traen **nombres** ("Recuerda Maximilien"), nunca direcciones. Para enviar el
enlace de aprobación hace falta el email. Opciones: (a) directorio interno que mapee nombre →
email, (b) buscarlos en Entra ID vía Graph, (c) que el correo/PDF los incluya en el futuro.
**Sin esto no se puede notificar a nadie.** Es ahora el bloqueante nº 1.

### P22 — `MONTANT TOTAL` vs `MONTANT À PAYER` · ⏸ Bloqueada
El PDF trae dos importes distintos (150 $ / 100 $); el schema solo tiene `montant`.
¿Cuál se usa, o hay que añadir un segundo campo?

### P23 — Las muestras son datos de prueba · ⏸ Bloqueada
`Fournisseur = "."`, `ÉCOLE` e `INDICE COMPTABLE` vacíos, importes redondos. Hace falta **un
correo real con los campos poblados** para confirmar el formato definitivo (sobre todo cómo se
escribe el fournisseur y la école, que hay que casar contra las tablas `Fournisseur` y `Ecole`).

### Nota sobre el asunto del correo
`SRM_Projet 150 / . / CR08-07_31477 ,Crédit Rapide` → patrón
`SRM_Projet <projet> / <fournisseur> / <n° facture> ,<type>`. Sirve de verificación cruzada
contra el PDF, pero **el filtro actual `startsWith("[FACTURE]")` los descarta todos** y hay que
sustituirlo por este patrón real.

---

## Flujo confirmado por el usuario (2026-07-19) — resuelve P14/P15/P16 parcialmente

### P24 — ¿Cómo llega el proveedor a la página y cuándo escribe la app? · ✅ Resuelta
- **Respuesta del usuario (literal):** la app **no envía correos a nadie salvo a acostasalcedo**,
  y **solo cuando el proveedor ya respondió**. El proveedor llega a la página por un correo que
  **acostasalcedo escribe y envía él mismo**, deduciendo la URL: es **siempre la misma ruta base
  + `/{número de factura}`**.

**Flujo definitivo:**

```
1. acostasalcedo ──correo + CertificatCR.pdf──> admin@dynamixmtl.com
2. la app parsea el PDF y crea/actualiza la factura
3. acostasalcedo ──correo con el enlace DEDUCIDO──> proveedor
      (él mismo concatena la ruta base + el nº de factura;
       NO espera a que la app genere ni envíe nada)
4. el proveedor abre la ruta pública, ve la factura y responde
      con las opciones predefinidas
5. la app ──correo con la respuesta──> acostasalcedo   ← ÚNICO correo que emite la app
6. acostasalcedo reenvía al proveedor si corresponde
```

**Consecuencias de diseño (importantes):**
- **No hace falta generar ni almacenar tokens de acceso.** La URL es determinista. Esto elimina
  el bloqueante P21 (los emails de los aprobadores) por completo: la app nunca les escribe.
- La ruta pública se indexa por **`nombreFactura`** (`CR08-07_31477`), **no** por el `id` cuid.
- ⚠️ **`nombreFactura` NO es `@unique` en el schema** (solo `@@index`). Para servir de clave de
  URL **tiene que serlo**, o dos facturas colisionarían en la misma ruta.
- ⚠️ **El proveedor puede llegar ANTES de que la factura exista.** El usuario dijo que
  acostasalcedo "puede enviar un enlace previo a que se genere el enlace desde la app". La
  página debe manejar con elegancia el caso "factura todavía no procesada", no dar un 404 seco.
- ⚠️ **Riesgo aceptado a confirmar:** una URL adivinable significa que cualquiera que conozca o
  deduzca un nº de factura puede ver y responder. Es consecuencia directa del requisito
  (acostasalcedo debe poder construir el enlace sin la app). Mitigaciones posibles **sin romper
  el requisito**: aceptar una sola respuesta por factura, registrar IP/fecha de la respuesta,
  limitar por rate, y no exponer datos sensibles de más en la página. **Planteárselo al usuario.**

## Preguntas que siguen abiertas

### P16-bis — ¿Qué opciones exactas ve el proveedor? · ⏸ Bloqueada
Sigue sin responderse. ¿Approuver / Refuser + comentario? ¿O también los checks
(`raisonSocialConforme`, `dixPourcentVerifier`, `fourHomologue`…)? ¿Puede adjuntar algo?

### P25 — ¿Cuál es la ruta base exacta? · ⏸ Bloqueada
Hay que fijarla y no cambiarla nunca (acostasalcedo la escribe a mano). Propuesta:
`https://cr-dynamixmtl.azurewebsites.net/facture/{nombreFactura}`. Confirmar el segmento.

### P26 — ¿Qué ve el proveedor de la factura? · ⏸ Bloqueada
¿Todos los datos del PDF, o solo un subconjunto? Importa por confidencialidad, dado que la URL
es adivinable.
