#!/bin/bash
# ==========================================================
# DÉPLOIEMENT MANUEL - carbonaze_front
# Lance ce script depuis la racine de ton projet Angular
# Prérequis : Azure CLI + Docker installés et lancés
# ==========================================================

set -e

# ---- VARIABLES ----
RESOURCE_GROUP="rg-carbonaze"
ACR_NAME="acrcarbonaze"
APP_NAME="carbonaze-frontend"
ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
IMAGE_TAG="${ACR_LOGIN_SERVER}/${APP_NAME}:latest"

echo "🚀 Déploiement de carbonaze-frontend..."
echo ""

# ---- 1. Connexion à ACR ----
echo "🔐 Connexion au Container Registry..."
az acr login --name $ACR_NAME

# ---- 2. Build et push de l'image Docker ----
echo ""
echo "🐳 Build de l'image Docker (Angular + Nginx)..."
docker build -t $IMAGE_TAG .
echo ""
echo "⬆️  Push vers ACR..."
docker push $IMAGE_TAG
echo "✅ Image poussée : $IMAGE_TAG"

# ---- 3. Redéploiement de la Container App ----
echo ""
echo "☁️  Redéploiement sur Azure Container Apps..."
az containerapp update \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --image $IMAGE_TAG

# ---- 4. Résumé ----
APP_URL=$(az containerapp show \
  --name $APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query "properties.configuration.ingress.fqdn" -o tsv)

echo ""
echo "============================================================"
echo "✅ Déploiement terminé !"
echo "🌐 URL : https://$APP_URL"
echo "============================================================"
