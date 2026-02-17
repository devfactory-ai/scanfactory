#!/bin/bash
# Script de déploiement Modal OCR Service

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Couleurs pour l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== ScanFactory Modal OCR Deployment ===${NC}"

# Vérifier que Modal est installé
if ! command -v modal &> /dev/null; then
    echo -e "${YELLOW}Modal CLI not found. Installing...${NC}"
    pip install modal
fi

# Vérifier l'authentification Modal
echo -e "\n${YELLOW}Checking Modal authentication...${NC}"
if ! modal token show &> /dev/null; then
    echo -e "${RED}Not authenticated with Modal. Please run:${NC}"
    echo "  modal token new"
    exit 1
fi
echo -e "${GREEN}✓ Authenticated with Modal${NC}"

# Créer le secret Anthropic si nécessaire
echo -e "\n${YELLOW}Checking Anthropic API key secret...${NC}"
if ! modal secret list | grep -q "anthropic-api-key"; then
    echo -e "${YELLOW}Creating Anthropic API key secret...${NC}"
    echo "Please enter your Anthropic API key:"
    read -s ANTHROPIC_KEY
    modal secret create anthropic-api-key ANTHROPIC_API_KEY="$ANTHROPIC_KEY"
    echo -e "${GREEN}✓ Secret created${NC}"
else
    echo -e "${GREEN}✓ Secret already exists${NC}"
fi

# Créer le volume pour le cache des modèles
echo -e "\n${YELLOW}Checking model cache volume...${NC}"
if ! modal volume list | grep -q "scanfactory-model-cache"; then
    echo -e "${YELLOW}Creating model cache volume...${NC}"
    modal volume create scanfactory-model-cache
    echo -e "${GREEN}✓ Volume created${NC}"
else
    echo -e "${GREEN}✓ Volume already exists${NC}"
fi

# Déployer l'application
echo -e "\n${YELLOW}Deploying application...${NC}"
modal deploy app.py

echo -e "\n${GREEN}=== Deployment Complete ===${NC}"

# Afficher les URLs des endpoints
echo -e "\n${YELLOW}Endpoints:${NC}"
echo "  Health: https://devfactory-ai--scanfactory-ocr-health.modal.run"
echo "  OCR:    https://devfactory-ai--scanfactory-ocr-process-ocr.modal.run"
echo "  Extract: https://devfactory-ai--scanfactory-ocr-process-extraction.modal.run"
echo "  Full Pipeline: https://devfactory-ai--scanfactory-ocr-process-document.modal.run"

echo -e "\n${YELLOW}Documentation:${NC}"
echo "  https://devfactory-ai--scanfactory-ocr-process-ocr.modal.run/docs"
