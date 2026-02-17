import type { Env } from '../../index';

/**
 * Configuration des modèles Workers AI disponibles
 * Tous ces modèles sont gratuits sur Cloudflare Workers AI
 */
export const AI_MODELS = {
  // Llama 3.1 - Meilleur pour l'extraction structurée
  LLAMA_3_1_8B: '@cf/meta/llama-3.1-8b-instruct',
  LLAMA_3_1_70B: '@cf/meta/llama-3.1-70b-instruct',

  // Mistral - Bon équilibre performance/vitesse
  MISTRAL_7B: '@cf/mistral/mistral-7b-instruct-v0.1',

  // Qwen - Bon pour le multilingue
  QWEN_1_5_7B: '@cf/qwen/qwen1.5-7b-chat-awq',

  // Gemma - Léger et rapide
  GEMMA_7B: '@cf/google/gemma-7b-it-lora',
} as const;

// Modèle par défaut
const DEFAULT_MODEL = AI_MODELS.LLAMA_3_1_8B;

/**
 * Résultat de l'extraction
 */
export interface AIExtractionResult {
  success: boolean;
  data?: Record<string, {
    value: unknown;
    confidence: number;
  }>;
  error?: string;
  model: string;
  tokens_used?: number;
}

/**
 * Configuration d'un champ à extraire
 */
export interface FieldConfig {
  name: string;
  type: 'string' | 'number' | 'date' | 'boolean' | 'array';
  description?: string;
  required?: boolean;
}

/**
 * Service d'extraction de données avec Cloudflare Workers AI
 */
export class WorkersAIExtractor {
  private env: Env;
  private model: string;

  constructor(env: Env, model: string = DEFAULT_MODEL) {
    this.env = env;
    this.model = model;
  }

  /**
   * Extrait les données d'un bulletin de soins
   */
  async extractBulletinSoin(ocrText: string): Promise<AIExtractionResult> {
    const systemPrompt = `Tu es un expert en extraction de données de documents médicaux français.
Tu dois extraire les informations d'un bulletin de soins et retourner UNIQUEMENT un objet JSON valide.
Ne retourne RIEN d'autre que le JSON, pas de texte explicatif.`;

    const userPrompt = `Analyse ce texte OCR d'un bulletin de soins et extrait les informations au format JSON:

TEXTE OCR:
${ocrText}

Extrait ces champs (mets null si non trouvé):
{
  "patient_nom": {"value": "string", "confidence": 0.0-1.0},
  "patient_prenom": {"value": "string", "confidence": 0.0-1.0},
  "patient_nir": {"value": "string (13-15 chiffres)", "confidence": 0.0-1.0},
  "patient_date_naissance": {"value": "YYYY-MM-DD", "confidence": 0.0-1.0},
  "date_soins": {"value": "YYYY-MM-DD", "confidence": 0.0-1.0},
  "prescripteur_nom": {"value": "string", "confidence": 0.0-1.0},
  "prescripteur_finess": {"value": "string", "confidence": 0.0-1.0},
  "actes": {"value": [{"code": "string", "libelle": "string", "montant": number}], "confidence": 0.0-1.0},
  "montant_total": {"value": number, "confidence": 0.0-1.0},
  "organisme": {"value": "string", "confidence": 0.0-1.0}
}

Réponds UNIQUEMENT avec le JSON:`;

    return this.runExtraction(systemPrompt, userPrompt, 'bulletin_soin');
  }

  /**
   * Extrait les données d'une facture médicale
   */
  async extractFacture(ocrText: string): Promise<AIExtractionResult> {
    const systemPrompt = `Tu es un expert en extraction de données de factures médicales françaises.
Tu dois extraire les informations et retourner UNIQUEMENT un objet JSON valide.
Ne retourne RIEN d'autre que le JSON, pas de texte explicatif.`;

    const userPrompt = `Analyse ce texte OCR d'une facture et extrait les informations au format JSON:

TEXTE OCR:
${ocrText}

Extrait ces champs (mets null si non trouvé):
{
  "numero_facture": {"value": "string", "confidence": 0.0-1.0},
  "date_facture": {"value": "YYYY-MM-DD", "confidence": 0.0-1.0},
  "emetteur_nom": {"value": "string", "confidence": 0.0-1.0},
  "emetteur_siret": {"value": "string", "confidence": 0.0-1.0},
  "emetteur_adresse": {"value": "string", "confidence": 0.0-1.0},
  "patient_nom": {"value": "string", "confidence": 0.0-1.0},
  "lignes": {"value": [{"description": "string", "quantite": number, "prix_unitaire": number, "montant": number}], "confidence": 0.0-1.0},
  "sous_total_ht": {"value": number, "confidence": 0.0-1.0},
  "tva": {"value": number, "confidence": 0.0-1.0},
  "total_ttc": {"value": number, "confidence": 0.0-1.0},
  "mode_paiement": {"value": "string", "confidence": 0.0-1.0}
}

Réponds UNIQUEMENT avec le JSON:`;

    return this.runExtraction(systemPrompt, userPrompt, 'facture');
  }

  /**
   * Extraction générique avec champs personnalisés
   */
  async extractGeneric(ocrText: string, fields: FieldConfig[]): Promise<AIExtractionResult> {
    const fieldsDescription = fields.map(f =>
      `  "${f.name}": {"value": "${f.type}", "confidence": 0.0-1.0}${f.description ? ` // ${f.description}` : ''}`
    ).join(',\n');

    const systemPrompt = `Tu es un expert en extraction de données de documents.
Tu dois extraire les informations et retourner UNIQUEMENT un objet JSON valide.
Ne retourne RIEN d'autre que le JSON, pas de texte explicatif.`;

    const userPrompt = `Analyse ce texte OCR et extrait les informations au format JSON:

TEXTE OCR:
${ocrText}

Extrait ces champs (mets null si non trouvé):
{
${fieldsDescription}
}

Réponds UNIQUEMENT avec le JSON:`;

    return this.runExtraction(systemPrompt, userPrompt, 'generic');
  }

  /**
   * Exécute l'extraction avec le modèle AI
   */
  private async runExtraction(
    systemPrompt: string,
    userPrompt: string,
    pipeline: string
  ): Promise<AIExtractionResult> {
    try {
      const response = await this.env.AI.run(this.model as BaseAiTextGenerationModels, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 2048,
        temperature: 0.1, // Température basse pour des résultats cohérents
      });

      // Extraire le texte de la réponse
      let responseText = '';
      if (typeof response === 'object' && response !== null) {
        if ('response' in response) {
          responseText = String(response.response);
        } else if ('text' in response) {
          responseText = String(response.text);
        }
      }

      // Parser le JSON de la réponse
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          success: false,
          error: 'No JSON found in response',
          model: this.model,
        };
      }

      const data = JSON.parse(jsonMatch[0]);

      return {
        success: true,
        data,
        model: this.model,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        model: this.model,
      };
    }
  }

  /**
   * Analyse la qualité du texte OCR
   */
  async analyzeOCRQuality(ocrText: string): Promise<{
    quality: 'good' | 'medium' | 'poor';
    issues: string[];
    suggestions: string[];
  }> {
    const prompt = `Analyse la qualité de ce texte OCR et retourne un JSON:

TEXTE:
${ocrText.substring(0, 1000)}

Retourne UNIQUEMENT ce JSON:
{
  "quality": "good|medium|poor",
  "issues": ["liste des problèmes détectés"],
  "suggestions": ["suggestions d'amélioration"]
}`;

    try {
      const response = await this.env.AI.run(this.model as BaseAiTextGenerationModels, {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
        temperature: 0.1,
      });

      let responseText = '';
      if (typeof response === 'object' && response !== null && 'response' in response) {
        responseText = String(response.response);
      }

      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback en cas d'erreur
    }

    return {
      quality: 'medium',
      issues: ['Unable to analyze'],
      suggestions: [],
    };
  }
}

/**
 * Type pour les modèles de génération de texte
 */
type BaseAiTextGenerationModels =
  | '@cf/meta/llama-3.1-8b-instruct'
  | '@cf/meta/llama-3.1-70b-instruct'
  | '@cf/mistral/mistral-7b-instruct-v0.1'
  | '@cf/qwen/qwen1.5-7b-chat-awq'
  | '@cf/google/gemma-7b-it-lora';

/**
 * Factory function pour créer l'extracteur
 */
export function createAIExtractor(env: Env, model?: string): WorkersAIExtractor {
  return new WorkersAIExtractor(env, model);
}
