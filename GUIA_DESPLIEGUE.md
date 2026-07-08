# Guía de Despliegue — Approbations de Factures

## Prerrequisitos

- Node.js 20+
- Azure CLI (`az`)
- Cuenta Azure con suscripción activa
- Tenant Azure AD de CSDM (ya existente)
- Repositorio GitHub

---

## Paso 1 — Registrar la App en Azure AD (CSDM)

1. Ir a **portal.azure.com** → Azure Active Directory → Registros de aplicaciones
2. Clic en **+ Nuevo registro**
   - Nombre: `Approbations de Factures`
   - Tipos de cuenta: `Cuentas solo en este directorio organizacional`
   - URI de redirección: `https://app-approbations-factures.azurewebsites.net/api/auth/callback/microsoft-entra-id`
3. Anotar:
   - **Application (client) ID** → `AZURE_AD_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_AD_TENANT_ID`
4. Ir a **Certificados y secretos** → + Nuevo secreto de cliente → Anotar el valor → `AZURE_AD_CLIENT_SECRET`
5. Ir a **Permisos de API** → + Agregar permiso → Microsoft Graph:
   - `User.Read`
   - `People.Read`
   - `Mail.Send`
   - `Sites.ReadWrite.All`
   - `Files.ReadWrite`
6. Clic en **Conceder consentimiento de administrador**

---

## Paso 2 — Aprovisionar la Infraestructura Azure

```bash
# Clonar el repositorio
git clone https://github.com/your-org/approbations-factures.git
cd approbations-factures

# Autenticarse en Azure
az login

# Ejecutar el script de aprovisionamiento
chmod +x .azure/provision.sh
./.azure/provision.sh
```

El script crea automáticamente:
- Resource Group
- PostgreSQL Flexible Server (Canada Central)
- Azure Blob Storage + container `facturas-documents`
- App Service Plan (Linux, Node 20)
- App Service

---

## Paso 3 — Agregar Variables de Entorno Faltantes

Después de ejecutar el script, agregar manualmente en el App Service:

```bash
az webapp config appsettings set \
  --resource-group rg-approbations-factures \
  --name app-approbations-factures \
  --settings \
    AZURE_AD_CLIENT_ID="<del paso 1>" \
    AZURE_AD_CLIENT_SECRET="<del paso 1>" \
    AZURE_AD_TENANT_ID="<del paso 1>"
```

---

## Paso 4 — Configurar GitHub Actions Secrets

En el repositorio GitHub → Settings → Secrets and variables → Actions:

| Secret | Valor |
|---|---|
| `AZURE_CREDENTIALS` | JSON del Service Principal (ver abajo) |
| `DATABASE_URL` | URL de PostgreSQL del script |
| `NEXTAUTH_SECRET` | Valor generado por el script |
| `AZURE_AD_CLIENT_ID` | Del paso 1 |
| `AZURE_AD_CLIENT_SECRET` | Del paso 1 |
| `AZURE_AD_TENANT_ID` | Del paso 1 |
| `AZURE_STORAGE_ACCOUNT_NAME` | Del script |
| `AZURE_STORAGE_ACCOUNT_KEY` | Del script |
| `AZURE_STORAGE_CONTAINER_FACTURAS` | `facturas-documents` |

### Crear Service Principal para GitHub Actions

```bash
az ad sp create-for-rbac \
  --name "sp-approbations-factures-deploy" \
  --role contributor \
  --scopes /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/rg-approbations-factures \
  --json-auth
```

El JSON resultante va en el secret `AZURE_CREDENTIALS`.

---

## Paso 5 — Instalar Dependencias y Migrar la BD

```bash
npm install
npx prisma migrate deploy   # Aplica las migraciones a PostgreSQL en Azure
npm run db:seed              # Carga datos iniciales (escuelas, proveedores, bureaux)
```

---

## Paso 6 — Primer Deploy

```bash
git add .
git commit -m "Initial deploy"
git push origin main
```

GitHub Actions ejecutará automáticamente:
1. `npm ci`
2. `prisma generate`
3. `prisma migrate deploy`
4. `next build`
5. Deploy al App Service

---

## Desarrollo Local

```bash
# Copiar variables de entorno
cp .env.example .env.local
# Editar .env.local con valores reales

# Instalar dependencias
npm install

# Generar cliente Prisma
npm run db:generate

# Aplicar migraciones (base de datos local o Azure)
npm run db:push

# Cargar datos iniciales
npm run db:seed

# Iniciar servidor de desarrollo
npm run dev
```

App disponible en: http://localhost:3000

---

## Estructura de Archivos Clave

```
approbations-factures/
├── prisma/
│   ├── schema.prisma          # Modelo de datos PostgreSQL
│   └── seed.ts                # Datos iniciales
├── src/
│   ├── app/
│   │   ├── api/               # API Routes (backend)
│   │   ├── auth/signin/       # Página de login
│   │   ├── facturas/          # Páginas de facturas
│   │   └── page.tsx           # Pantalla principal
│   ├── components/
│   │   ├── facturas/          # Componentes de facturas
│   │   ├── layout/            # Header, Providers
│   │   └── shared/            # Componentes reutilizables
│   ├── hooks/                 # TanStack Query hooks
│   ├── lib/                   # Clientes (Prisma, Blob, Graph, Auth)
│   └── types/                 # TypeScript types
├── .azure/
│   └── provision.sh           # Script infraestructura Azure
├── .github/
│   └── workflows/
│       └── azure-deploy.yml   # CI/CD GitHub Actions
└── .env.example               # Template de variables de entorno
```

---

## Servicios Azure Utilizados

| Servicio | SKU | Propósito |
|---|---|---|
| Azure Database for PostgreSQL Flexible Server | Standard_B2ms | Base de datos principal |
| Azure Blob Storage | Standard LRS | Almacenamiento de documentos PDF |
| Azure App Service | B2 Linux | Hosting Next.js |
| Azure Active Directory | (existente CSDM) | Autenticación |
| Microsoft Graph API | — | Búsqueda de usuarios + email |

---

## Costo Estimado (mensual, canadacentral)

| Servicio | Costo aprox. |
|---|---|
| PostgreSQL Flexible (B2ms, 32 GB) | ~$45 CAD/mes |
| Blob Storage (100 GB) | ~$3 CAD/mes |
| App Service B2 | ~$85 CAD/mes |
| **Total** | **~$133 CAD/mes** |

> Para reducir costos en desarrollo: usar PostgreSQL B1ms (~$15) y App Service B1 (~$22).
