#!/bin/bash
# =============================================================================
# Script de aprovisionamiento de infraestructura Azure
# App Approbations de Factures — CSDM
#
# Prerrequisitos:
#   - Azure CLI instalado y autenticado (az login)
#   - Tenant de Azure AD existente (CSDM)
#
# Uso:
#   chmod +x .azure/provision.sh
#   ./.azure/provision.sh
# =============================================================================

set -euo pipefail

# ─── Variables — ajustar antes de ejecutar ────────────────────────────────────
RESOURCE_GROUP="rg-approbations-factures"
LOCATION="canadacentral"
APP_NAME="approbations-factures"
POSTGRES_SERVER="pgserver-${APP_NAME}"
POSTGRES_DB="approbations"
POSTGRES_USER="adminpg"
STORAGE_ACCOUNT="st${APP_NAME//[-_]/}"     # Sin guiones (máx 24 chars)
STORAGE_CONTAINER="facturas-documents"
APP_SERVICE_PLAN="asp-${APP_NAME}"
APP_SERVICE_NAME="app-${APP_NAME}"
APP_SERVICE_SKU="B2"                        # B1 = dev, B2 = prod

echo "=== Aprovisionando infraestructura Azure para ${APP_NAME} ==="
echo "Región: ${LOCATION} | RG: ${RESOURCE_GROUP}"

# ─── 1. Resource Group ────────────────────────────────────────────────────────
echo "[1/7] Creando Resource Group..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

# ─── 2. Azure Database for PostgreSQL Flexible Server ────────────────────────
echo "[2/7] Creando servidor PostgreSQL Flexible..."
POSTGRES_PASSWORD=$(openssl rand -base64 24)
echo "    Password generado — guardarlo en un gestor de secretos!"
echo "    POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"

az postgres flexible-server create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_SERVER" \
  --location "$LOCATION" \
  --admin-user "$POSTGRES_USER" \
  --admin-password "$POSTGRES_PASSWORD" \
  --sku-name "Standard_B2ms" \
  --tier "Burstable" \
  --storage-size 32 \
  --version 16 \
  --public-access 0.0.0.0 \
  --output table

echo "[2b/7] Creando base de datos ${POSTGRES_DB}..."
az postgres flexible-server db create \
  --resource-group "$RESOURCE_GROUP" \
  --server-name "$POSTGRES_SERVER" \
  --database-name "$POSTGRES_DB" \
  --output table

POSTGRES_HOST="${POSTGRES_SERVER}.postgres.database.azure.com"
DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:5432/${POSTGRES_DB}?sslmode=require"

# ─── 3. Azure Storage Account + Container ────────────────────────────────────
echo "[3/7] Creando Storage Account..."
az storage account create \
  --resource-group "$RESOURCE_GROUP" \
  --name "${STORAGE_ACCOUNT:0:24}" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --kind StorageV2 \
  --https-only true \
  --min-tls-version TLS1_2 \
  --output table

STORAGE_KEY=$(az storage account keys list \
  --resource-group "$RESOURCE_GROUP" \
  --account-name "${STORAGE_ACCOUNT:0:24}" \
  --query "[0].value" -o tsv)

echo "[3b/7] Creando container Blob '${STORAGE_CONTAINER}'..."
az storage container create \
  --name "$STORAGE_CONTAINER" \
  --account-name "${STORAGE_ACCOUNT:0:24}" \
  --account-key "$STORAGE_KEY" \
  --public-access off \
  --output table

# ─── 4. App Service Plan ──────────────────────────────────────────────────────
echo "[4/7] Creando App Service Plan (${APP_SERVICE_SKU})..."
az appservice plan create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_SERVICE_PLAN" \
  --location "$LOCATION" \
  --sku "$APP_SERVICE_SKU" \
  --is-linux \
  --output table

# ─── 5. App Service (Node.js 20) ─────────────────────────────────────────────
echo "[5/7] Creando App Service..."
az webapp create \
  --resource-group "$RESOURCE_GROUP" \
  --plan "$APP_SERVICE_PLAN" \
  --name "$APP_SERVICE_NAME" \
  --runtime "NODE:20-lts" \
  --output table

# ─── 6. App Settings (variables de entorno) ───────────────────────────────────
echo "[6/7] Configurando variables de entorno en App Service..."

NEXTAUTH_SECRET=$(openssl rand -base64 32)

az webapp config appsettings set \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_SERVICE_NAME" \
  --settings \
    NODE_ENV="production" \
    NEXTAUTH_URL="https://${APP_SERVICE_NAME}.azurewebsites.net" \
    NEXTAUTH_SECRET="$NEXTAUTH_SECRET" \
    DATABASE_URL="$DATABASE_URL" \
    AZURE_STORAGE_ACCOUNT_NAME="${STORAGE_ACCOUNT:0:24}" \
    AZURE_STORAGE_ACCOUNT_KEY="$STORAGE_KEY" \
    AZURE_STORAGE_CONTAINER_FACTURAS="$STORAGE_CONTAINER" \
    PORT="8080" \
    WEBSITE_RUN_FROM_PACKAGE="1" \
  --output table

echo ""
echo "⚠️  PENDIENTE — Agregar manualmente en App Settings:"
echo "    AZURE_AD_CLIENT_ID=<del registro de app en Azure AD CSDM>"
echo "    AZURE_AD_CLIENT_SECRET=<del registro de app>"
echo "    AZURE_AD_TENANT_ID=<tenant ID de CSDM>"

# ─── 7. Regla de firewall PostgreSQL para App Service ─────────────────────────
echo "[7/7] Permitiendo IPs salientes de App Service en PostgreSQL..."
APP_IPS=$(az webapp show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$APP_SERVICE_NAME" \
  --query "outboundIpAddresses" -o tsv)

IFS=',' read -ra IPS <<< "$APP_IPS"
for i in "${!IPS[@]}"; do
  az postgres flexible-server firewall-rule create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$POSTGRES_SERVER" \
    --rule-name "AppService-IP-${i}" \
    --start-ip-address "${IPS[$i]}" \
    --end-ip-address "${IPS[$i]}" \
    --output table 2>/dev/null || true
done

# ─── Resumen ──────────────────────────────────────────────────────────────────
echo ""
echo "✅ Infraestructura creada exitosamente!"
echo ""
echo "┌─────────────────────────────────────────────────────────┐"
echo "│                    RESUMEN RECURSOS                     │"
echo "├─────────────────────────────────────────────────────────┤"
echo "│ Resource Group  : ${RESOURCE_GROUP}"
echo "│ App Service URL : https://${APP_SERVICE_NAME}.azurewebsites.net"
echo "│ PostgreSQL Host : ${POSTGRES_HOST}"
echo "│ Storage Account : ${STORAGE_ACCOUNT:0:24}"
echo "│ NEXTAUTH_SECRET : ${NEXTAUTH_SECRET}"
echo "└─────────────────────────────────────────────────────────┘"
echo ""
echo "⚡ Próximos pasos:"
echo "   1. Registrar la app en Azure AD y agregar CLIENT_ID/SECRET/TENANT_ID"
echo "   2. Ejecutar: npm run db:migrate"
echo "   3. Ejecutar: npm run db:seed"
echo "   4. Configurar GitHub Actions con los secrets del repositorio"
echo "   5. Hacer push a main para el primer deploy"
