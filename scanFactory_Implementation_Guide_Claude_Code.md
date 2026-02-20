# scanFactory - Guide de Mise en Œuvre pour Claude Code
## Intégration GutenOCR & Mistral OCR 3

**Pour:** Claude Code  
**Projet:** scanFactory  
**Date:** 20 Février 2026  
**Auteur:** Yassine Techini, DevFactory

---

## 🎯 OBJECTIF DE CE DOCUMENT

Ce guide fournit à Claude Code toutes les informations nécessaires pour implémenter l'intégration de GutenOCR et Mistral OCR 3 dans scanFactory de manière autonome et efficace.

---

## 📋 CONTEXTE DU PROJET

### Vue d'ensemble de scanFactory
scanFactory est une plateforme de reconnaissance de documents qui offre actuellement :
- Support multi-moteurs OCR (Tesseract, EasyOCR, PaddleOCR)
- API REST pour traitement de documents
- Interface web/mobile
- Pipeline de post-traitement

### Objectif de l'intégration
Ajouter deux nouveaux moteurs OCR de dernière génération :
1. **GutenOCR** - VLM open-source basé sur Qwen2.5-VL
2. **Mistral OCR 3** - API OCR commerciale de Mistral AI

### Bénéfices attendus
- Précision accrue sur documents complexes (tableaux, formulaires)
- Meilleure préservation de la structure
- Support manuscrit amélioré
- Multilingue avancé (100+ langues)

---

## 🏗️ ARCHITECTURE CIBLE

```
scanFactory/
├── src/
│   ├── ocr_engines/
│   │   ├── __init__.py
│   │   ├── base_adapter.py           # Interface de base
│   │   ├── gutenocr_adapter.py       # ✨ NOUVEAU
│   │   ├── mistral_ocr_adapter.py    # ✨ NOUVEAU
│   │   ├── engine_manager.py         # ✨ ÉTENDU
│   │   └── tesseract_adapter.py      # Existant
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── ocr_endpoints.py          # ✨ ÉTENDU
│   │   └── models.py                 # ✨ ÉTENDU
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── ocr_result.py             # ✨ ÉTENDU
│   │   └── document.py               # Existant
│   │
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   └── logging_config.py         # ✨ NOUVEAU
│   │
│   └── monitoring/
│       ├── __init__.py
│       └── metrics.py                # ✨ NOUVEAU
│
├── config/
│   ├── ocr_engines.yaml              # ✨ ÉTENDU
│   └── settings.py
│
├── tests/
│   ├── unit/
│   │   ├── test_gutenocr_adapter.py  # ✨ NOUVEAU
│   │   └── test_mistral_adapter.py   # ✨ NOUVEAU
│   │
│   └── integration/
│       └── test_engine_manager.py    # ✨ ÉTENDU
│
├── docker/
│   ├── Dockerfile.gutenocr           # ✨ NOUVEAU
│   ├── Dockerfile.mistral            # ✨ NOUVEAU
│   └── docker-compose.yml            # ✨ ÉTENDU
│
├── k8s/
│   ├── deployment-gutenocr.yaml      # ✨ NOUVEAU
│   └── deployment-mistral.yaml       # ✨ NOUVEAU
│
├── docs/
│   ├── API.md                        # ✨ ÉTENDU
│   └── INTEGRATION_GUIDE.md          # ✨ NOUVEAU
│
├── requirements.txt                  # ✨ ÉTENDU
├── .env.example                      # ✨ ÉTENDU
└── README.md                         # ✨ ÉTENDU
```

---

## 🚀 PLAN D'IMPLÉMENTATION

### Phase 1: Fondations (Priorité: HAUTE)

#### Tâche 1.1: Créer l'interface de base
**Fichier:** `src/ocr_engines/base_adapter.py`

```python
from abc import ABC, abstractmethod
from typing import Dict, Any, List

class BaseOCRAdapter(ABC):
    """Interface de base pour tous les adaptateurs OCR"""
    
    @abstractmethod
    def process_image(self, image_path: str, **kwargs) -> Dict[str, Any]:
        """Traite une image et retourne les résultats OCR"""
        pass
    
    @abstractmethod
    def batch_process(self, image_paths: List[str], **kwargs) -> List[Dict[str, Any]]:
        """Traite un lot d'images"""
        pass
    
    @abstractmethod
    def get_info(self) -> Dict[str, Any]:
        """Retourne les informations sur l'adaptateur"""
        pass
```

**Instructions pour Claude Code:**
1. Créer le fichier avec l'interface abstraite
2. Ajouter la documentation docstring complète
3. Inclure les type hints pour tous les paramètres
4. Prévoir l'extensibilité pour futurs moteurs

#### Tâche 1.2: Implémenter GutenOCR Adapter
**Fichier:** `src/ocr_engines/gutenocr_adapter.py`

**Code complet disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 3.1.2

**Points d'attention:**
1. Gestion CPU/GPU automatique
2. Support des deux modèles (3B/7B)
3. Tous les formats de sortie (TEXT, TEXT2D, LINES, WORDS, etc.)
4. Gestion robuste des erreurs
5. Estimation de confiance

**Instructions pour Claude Code:**
```
Créer src/ocr_engines/gutenocr_adapter.py en suivant le code de la section 3.1.2.
- Hériter de BaseOCRAdapter
- Implémenter tous les formats de sortie
- Ajouter des logs structurés
- Gérer les exceptions proprement
- Tester la détection CPU/GPU
```

#### Tâche 1.3: Implémenter Mistral OCR Adapter
**Fichier:** `src/ocr_engines/mistral_ocr_adapter.py`

**Code complet disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 3.2.2

**Points d'attention:**
1. Gestion de l'API key
2. Support document URL et upload
3. Extraction des données structurées (tables, headers, footers)
4. Retry logic pour robustesse
5. Rate limiting

**Instructions pour Claude Code:**
```
Créer src/ocr_engines/mistral_ocr_adapter.py en suivant le code de la section 3.2.2.
- Implémenter l'upload de fichiers vers stockage
- Gérer les retry avec backoff exponentiel
- Parser correctement la réponse API
- Extraire les données structurées
- Ajouter des métriques de coût
```

#### Tâche 1.4: Mettre à jour le gestionnaire de moteurs
**Fichier:** `src/ocr_engines/engine_manager.py`

**Code complet disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 4.1

**Points d'attention:**
1. Ajout des énumérations pour nouveaux moteurs
2. Logique de sélection automatique intelligente
3. Fonction de comparaison de moteurs
4. Gestion du cache des modèles

**Instructions pour Claude Code:**
```
Étendre src/ocr_engines/engine_manager.py:
- Ajouter GUTENOCR_3B, GUTENOCR_7B, MISTRAL_OCR à l'enum OCREngine
- Implémenter auto_select_engine avec règles intelligentes
- Ajouter compare_engines pour benchmarking
- Gérer l'initialisation paresseuse des modèles lourds
```

### Phase 2: API et Intégration (Priorité: HAUTE)

#### Tâche 2.1: Étendre les modèles de données
**Fichier:** `src/models/ocr_result.py`

**Code disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 5.1

**Instructions pour Claude Code:**
```
Créer/Étendre src/models/ocr_result.py:
- Ajouter le champ structured_data pour Mistral OCR
- Supporter les métadonnées spécifiques à chaque moteur
- Implémenter la sérialisation JSON propre
- Ajouter validation avec Pydantic
```

#### Tâche 2.2: Créer les endpoints API
**Fichier:** `src/api/ocr_endpoints.py`

**Code disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 5.2

**Endpoints à implémenter:**
- `POST /api/v1/ocr/process` - Traitement single document
- `POST /api/v1/ocr/batch` - Traitement batch
- `GET /api/v1/ocr/engines` - Liste des moteurs disponibles
- `POST /api/v1/ocr/compare` - Comparaison de moteurs

**Instructions pour Claude Code:**
```
Implémenter les endpoints dans src/api/ocr_endpoints.py:
- Utiliser FastAPI avec validation Pydantic
- Supporter upload de fichiers ET URL
- Implémenter la sélection automatique de moteur
- Ajouter documentation OpenAPI complète
- Gérer les erreurs avec codes HTTP appropriés
```

### Phase 3: Configuration et Infrastructure (Priorité: MOYENNE)

#### Tâche 3.1: Configuration YAML
**Fichier:** `config/ocr_engines.yaml`

**Template disponible dans:** `scanFactory_OCR_Integration_Spec.md` sections 3.1.1 et 3.2.1

**Instructions pour Claude Code:**
```
Créer config/ocr_engines.yaml avec:
- Configuration GutenOCR (modèles 3B/7B, hardware, task types)
- Configuration Mistral OCR (API, pricing, formats)
- Paramètres de fallback et timeouts
- Règles de sélection automatique
```

#### Tâche 3.2: Variables d'environnement
**Fichier:** `.env.example`

```bash
# GutenOCR Configuration
GUTENOCR_MODEL=rootsautomation/GutenOCR-3B
GUTENOCR_USE_CPU=true
GUTENOCR_CACHE_DIR=/app/models
GUTENOCR_MAX_BATCH_SIZE=4

# Mistral OCR Configuration
MISTRAL_API_KEY=your_mistral_api_key_here
MISTRAL_MODEL=mistral-ocr-2512
MISTRAL_TIMEOUT=60
MISTRAL_RETRY_ATTEMPTS=3

# Storage Configuration (pour Mistral)
STORAGE_TYPE=s3  # s3, azure, gcs, local
S3_BUCKET=scanfactory-uploads
S3_REGION=eu-west-1
```

**Instructions pour Claude Code:**
```
Créer .env.example avec toutes les variables nécessaires.
Documenter chaque variable dans un commentaire.
```

#### Tâche 3.3: Requirements
**Fichier:** `requirements.txt`

```txt
# Existants
fastapi>=0.100.0
uvicorn>=0.23.0
pillow>=9.0.0

# GutenOCR
torch>=2.0.0
transformers>=4.30.0
qwen-vl-utils>=0.1.0

# Mistral OCR
mistralai>=1.0.0

# Monitoring
prometheus-client>=0.17.0

# Utils
python-dotenv>=1.0.0
pydantic>=2.0.0
python-multipart>=0.0.6
```

**Instructions pour Claude Code:**
```
Étendre requirements.txt en ajoutant les dépendances pour GutenOCR et Mistral.
Spécifier les versions minimales.
Ajouter les dépendances optionnelles (GPU) dans requirements-gpu.txt.
```

### Phase 4: Containerisation (Priorité: MOYENNE)

#### Tâche 4.1: Dockerfile GutenOCR
**Fichier:** `docker/Dockerfile.gutenocr`

**Code disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 6.2

**Instructions pour Claude Code:**
```
Créer docker/Dockerfile.gutenocr:
- Base image Python 3.11
- Installation des dépendances système
- Support multi-stage pour optimisation
- Configuration cache transformers
- Healthcheck endpoint
```

#### Tâche 4.2: Docker Compose
**Fichier:** `docker-compose.yml`

**Code disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 6.2

**Instructions pour Claude Code:**
```
Étendre docker-compose.yml:
- Service scanfactory-ocr-gutenocr
- Service scanfactory-ocr-mistral
- Service scanfactory-gateway (orchestrateur)
- Volumes pour models et data
- Network configuration
```

### Phase 5: Monitoring et Tests (Priorité: BASSE - mais importante)

#### Tâche 5.1: Métriques Prometheus
**Fichier:** `src/monitoring/metrics.py`

**Code disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 7.1

**Instructions pour Claude Code:**
```
Créer src/monitoring/metrics.py:
- Métriques de requêtes par moteur
- Histogrammes de temps de traitement
- Gauges pour taux de succès et confiance
- Export Prometheus format
```

#### Tâche 5.2: Logging structuré
**Fichier:** `src/utils/logging_config.py`

**Code disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 7.2

**Instructions pour Claude Code:**
```
Créer src/utils/logging_config.py:
- Logger avec format JSON structuré
- Contexte de traçabilité (trace_id)
- Niveaux configurables
- Rotation des logs
```

#### Tâche 5.3: Tests unitaires
**Fichiers:** `tests/unit/test_*_adapter.py`

**Code disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 8.1

**Instructions pour Claude Code:**
```
Créer les tests unitaires:
- test_gutenocr_adapter.py
  * Test initialisation
  * Test process_image
  * Test batch_process
  * Test gestion erreurs
  
- test_mistral_ocr_adapter.py
  * Test initialisation
  * Test process_document
  * Test upload
  * Test extraction structured data
```

#### Tâche 5.4: Tests d'intégration
**Fichier:** `tests/integration/test_engine_manager.py`

**Code disponible dans:** `scanFactory_OCR_Integration_Spec.md` section 8.2

**Instructions pour Claude Code:**
```
Créer tests/integration/test_engine_manager.py:
- Test auto-sélection de moteur
- Test comparaison multi-moteurs
- Test fallback en cas d'erreur
- Test end-to-end avec API
```

---

## 🎓 GUIDE DE DÉCISIONS TECHNIQUES

### Quand utiliser quel moteur ?

#### GutenOCR 3B
**Utiliser pour:**
- Documents standard
- Cas où vitesse > précision
- Environnements avec RAM limitée (8GB)
- Déploiements CPU-only

**Ne pas utiliser pour:**
- Documents extrêmement complexes
- Manuscrits historiques
- Cas critique où précision maximale requise

#### GutenOCR 7B
**Utiliser pour:**
- Documents complexes
- Manuscrits
- Tables multi-niveaux
- Cas où précision > vitesse
- Environnements avec GPU

**Ne pas utiliser pour:**
- Traitement temps-réel
- Environnements avec RAM limitée
- Déploiements CPU-only (trop lent)

#### Mistral OCR 3
**Utiliser pour:**
- Documents avec structure importante (formulaires, invoices)
- Besoin d'extraction de données structurées
- Pas de contrainte de coût ($2/1000 pages acceptable)
- Pas d'infrastructure GPU disponible

**Ne pas utiliser pour:**
- Volumes très élevés (coût)
- Données sensibles ne pouvant quitter le cloud client
- Besoin de déploiement on-premise

### Règles de sélection automatique

```python
def auto_select_logic(criteria):
    """
    Logique de sélection automatique
    """
    priority = criteria.get('priority')  # 'speed' | 'accuracy' | 'cost'
    doc_type = criteria.get('document_type')
    complexity = criteria.get('complexity')  # 'low' | 'medium' | 'high'
    
    # Coût prioritaire
    if priority == 'cost':
        return 'tesseract'  # Gratuit
    
    # Vitesse prioritaire
    if priority == 'speed':
        if complexity == 'low':
            return 'tesseract'
        else:
            return 'gutenocr-3b'
    
    # Précision prioritaire
    if priority == 'accuracy':
        if doc_type in ['manuscript', 'historical']:
            return 'gutenocr-7b'  # Meilleur sur manuscrits
        
        elif doc_type in ['form', 'invoice', 'technical']:
            return 'mistral_ocr'  # Meilleur sur structure
        
        else:
            return 'gutenocr-3b'  # Bon compromis
    
    # Défaut
    return 'gutenocr-3b'
```

---

## 🔧 CHECKLIST D'IMPLÉMENTATION

### Phase 1: Fondations ✅
- [ ] Créer `base_adapter.py` avec interface abstraite
- [ ] Implémenter `gutenocr_adapter.py` complet
- [ ] Implémenter `mistral_ocr_adapter.py` complet
- [ ] Étendre `engine_manager.py` avec nouveaux moteurs
- [ ] Tester localement les adaptateurs individuellement

### Phase 2: API ✅
- [ ] Étendre `ocr_result.py` pour données structurées
- [ ] Créer endpoints dans `ocr_endpoints.py`
- [ ] Tester endpoints avec Postman/curl
- [ ] Documenter API avec OpenAPI/Swagger

### Phase 3: Configuration ✅
- [ ] Créer `ocr_engines.yaml` complet
- [ ] Créer `.env.example` documenté
- [ ] Mettre à jour `requirements.txt`
- [ ] Tester chargement de configuration

### Phase 4: Docker ✅
- [ ] Créer `Dockerfile.gutenocr`
- [ ] Créer `Dockerfile.mistral`
- [ ] Étendre `docker-compose.yml`
- [ ] Tester build et run des conteneurs

### Phase 5: Monitoring & Tests ✅
- [ ] Implémenter métriques Prometheus
- [ ] Implémenter logging structuré
- [ ] Créer tests unitaires
- [ ] Créer tests d'intégration
- [ ] Atteindre >80% code coverage

### Phase 6: Documentation ✅
- [ ] README avec quickstart
- [ ] Guide d'intégration détaillé
- [ ] Documentation API
- [ ] Exemples de code
- [ ] Troubleshooting guide

---

## 🎯 CRITÈRES DE SUCCÈS

### Critères fonctionnels
1. ✅ Les 3 moteurs (GutenOCR 3B/7B, Mistral OCR) sont opérationnels
2. ✅ L'API REST expose tous les endpoints spécifiés
3. ✅ La sélection automatique de moteur fonctionne correctement
4. ✅ Les données structurées sont correctement extraites (Mistral)
5. ✅ Le batch processing fonctionne efficacement

### Critères techniques
1. ✅ Code coverage > 80%
2. ✅ Tous les tests passent (unit + integration)
3. ✅ Les conteneurs Docker buildent sans erreur
4. ✅ Les métriques Prometheus sont exportées
5. ✅ La documentation est complète et à jour

### Critères de performance
1. ✅ GutenOCR 3B: < 5s par page (CPU)
2. ✅ GutenOCR 7B: < 10s par page (GPU)
3. ✅ Mistral OCR: < 3s par page (API)
4. ✅ Batch: >100 pages/minute (GutenOCR 7B GPU)
5. ✅ Mémoire: < 16GB pour GutenOCR 7B

---

## 🐛 TROUBLESHOOTING

### Problèmes courants et solutions

#### 1. GutenOCR: Out of Memory (OOM)
**Symptôme:** Crash avec "CUDA out of memory" ou "Killed"

**Solutions:**
```python
# Option 1: Forcer CPU
adapter = GutenOCRAdapter(use_cpu=True)

# Option 2: Utiliser le modèle 3B au lieu de 7B
adapter = GutenOCRAdapter(model_id="rootsautomation/GutenOCR-3B")

# Option 3: Réduire batch size
config['gutenocr']['hardware']['gpu']['batch_size'] = 1
```

#### 2. Mistral OCR: API Key Invalid
**Symptôme:** 401 Unauthorized

**Solutions:**
```bash
# Vérifier la variable d'environnement
echo $MISTRAL_API_KEY

# Vérifier le fichier .env
cat .env | grep MISTRAL_API_KEY

# Tester l'API key manuellement
curl -H "Authorization: Bearer $MISTRAL_API_KEY" \
  https://api.mistral.ai/v1/ocr
```

#### 3. GutenOCR: Modèle ne se télécharge pas
**Symptôme:** Erreur de connexion à HuggingFace

**Solutions:**
```bash
# Vérifier connexion internet
ping huggingface.co

# Télécharger manuellement
python -c "from transformers import AutoProcessor; \
  AutoProcessor.from_pretrained('rootsautomation/GutenOCR-3B')"

# Configurer proxy si nécessaire
export HF_ENDPOINT=https://huggingface.co
export HTTP_PROXY=http://proxy:8080
```

#### 4. Docker: Cannot find CUDA
**Symptôme:** Torch ne détecte pas le GPU

**Solutions:**
```yaml
# docker-compose.yml - Ajouter runtime nvidia
services:
  gutenocr:
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
```

---

## 📚 RESSOURCES COMPLÉMENTAIRES

### Documentation officielle
- **GutenOCR:** https://github.com/Roots-Automation/GutenOCR
- **Mistral OCR:** https://docs.mistral.ai/capabilities/vision/
- **Qwen2.5-VL:** https://huggingface.co/Qwen/Qwen2.5-VL-3B
- **FastAPI:** https://fastapi.tiangolo.com/

### Exemples de code
- **GutenOCR Demo:** https://ocr.roots.ai/
- **Mistral Cookbook:** https://github.com/mistralai/cookbook

### Papers
- **GutenOCR Paper:** https://arxiv.org/abs/2601.14490
- **Qwen2.5-VL Paper:** [Lien HuggingFace]

---

## 🚦 COMMANDES RAPIDES

### Développement local

```bash
# Installation
pip install -r requirements.txt

# Variables d'environnement
cp .env.example .env
# Éditer .env avec vos clés

# Lancer le serveur
uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Tests
pytest tests/

# Tests avec coverage
pytest --cov=src tests/

# Linting
flake8 src/
black src/
```

### Docker

```bash
# Build
docker-compose build

# Run
docker-compose up -d

# Logs
docker-compose logs -f gutenocr

# Stop
docker-compose down

# Rebuild forcé
docker-compose build --no-cache
```

### Tests API

```bash
# Health check
curl http://localhost:8000/health

# Lister les moteurs
curl http://localhost:8000/api/v1/ocr/engines

# Traiter un document
curl -X POST http://localhost:8000/api/v1/ocr/process \
  -F "file=@test.pdf" \
  -F "engine=gutenocr-3b"

# Comparaison de moteurs
curl -X POST http://localhost:8000/api/v1/ocr/compare \
  -H "Content-Type: application/json" \
  -d '{
    "document_url": "https://example.com/doc.pdf",
    "engines": ["gutenocr-3b", "mistral_ocr"]
  }'
```

---

## ✨ CONSEILS POUR CLAUDE CODE

### 1. Ordre d'implémentation recommandé
1. **D'abord:** Base adapter + GutenOCR adapter (plus simple, local)
2. **Ensuite:** Mistral OCR adapter (nécessite API key et storage)
3. **Puis:** Engine Manager (orchestration)
4. **Puis:** API endpoints
5. **Enfin:** Docker, monitoring, tests

### 2. Points d'attention critiques
- ⚠️ **Gestion mémoire GPU:** GutenOCR 7B peut consommer >16GB
- ⚠️ **API keys:** Ne jamais commit les clés dans le code
- ⚠️ **Timeouts:** Les modèles VLM peuvent être lents, prévoir timeouts généreux
- ⚠️ **Costs:** Mistral OCR est payant, implémenter rate limiting
- ⚠️ **Cache:** Les modèles sont volumineux (3-7GB), bien gérer le cache

### 3. Bonnes pratiques
- ✅ Utiliser type hints partout
- ✅ Documenter chaque fonction avec docstrings
- ✅ Logger tous les appels API et erreurs
- ✅ Implémenter retry logic avec backoff
- ✅ Valider les entrées avec Pydantic
- ✅ Tester avec vrais documents (PDF, images)

### 4. Tests à faire systématiquement
```python
# Pour chaque adaptateur:
1. Test initialisation (CPU/GPU)
2. Test process_image avec succès
3. Test process_image avec erreur (fichier inexistant)
4. Test batch_process
5. Test get_info()

# Pour l'API:
1. Test upload fichier
2. Test URL document
3. Test sélection automatique moteur
4. Test tous les formats de sortie
5. Test gestion erreurs (400, 500)
```

---

## 📞 SUPPORT

En cas de blocage, voici les éléments à fournir:

```
🔍 DEBUG INFO

Environnement:
- OS: [Linux/Mac/Windows]
- Python version: [3.11]
- CUDA available: [Yes/No]
- GPU model: [NVIDIA RTX 3090 / None]
- RAM: [32GB]

Error:
- Fichier: [src/ocr_engines/gutenocr_adapter.py]
- Ligne: [125]
- Message: [Copier l'erreur complète]

Code reproduisant l'erreur:
[Snippet de code minimal]

Logs:
[Logs pertinents]
```

---

**Fin du guide de mise en œuvre**

*Bonne implémentation ! 🚀*
