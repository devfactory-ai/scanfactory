/**
 * Contextual error messages for user-friendly error display
 */

// API error codes to user-friendly messages
const ERROR_CODE_MESSAGES: Record<string, string> = {
  // Authentication errors
  INVALID_CREDENTIALS: 'Email ou mot de passe incorrect',
  TOKEN_EXPIRED: 'Votre session a expiré, veuillez vous reconnecter',
  TOKEN_INVALID: 'Session invalide, veuillez vous reconnecter',
  UNAUTHORIZED: 'Vous devez être connecté pour effectuer cette action',
  FORBIDDEN: "Vous n'avez pas les droits pour effectuer cette action",

  // Validation errors
  VALIDATION_ERROR: 'Données invalides, veuillez vérifier les champs',
  INVALID_EMAIL: 'Adresse email invalide',
  INVALID_PASSWORD: 'Mot de passe invalide',
  WEAK_PASSWORD: 'Le mot de passe doit contenir au moins 8 caractères',

  // Document errors
  DOCUMENT_NOT_FOUND: 'Document introuvable',
  DOCUMENT_ALREADY_VALIDATED: 'Ce document a déjà été validé',
  DOCUMENT_LOCKED: 'Ce document est en cours de traitement par un autre utilisateur',

  // File errors
  FILE_TOO_LARGE: 'Le fichier est trop volumineux (max 10MB)',
  INVALID_FILE_TYPE: 'Type de fichier non supporté (PNG, JPG, PDF uniquement)',
  UPLOAD_FAILED: "Échec de l'envoi du fichier",

  // Processing errors
  EXTRACTION_FAILED: "Échec de l'extraction des données",
  OCR_FAILED: 'Échec de la reconnaissance de texte',
  PIPELINE_NOT_FOUND: 'Pipeline de traitement introuvable',

  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'Trop de requêtes, veuillez patienter',

  // Server errors
  INTERNAL_ERROR: 'Erreur serveur, veuillez réessayer',
  SERVICE_UNAVAILABLE: 'Service temporairement indisponible',
  MAINTENANCE: 'Maintenance en cours, veuillez réessayer plus tard',
};

// HTTP status code to user-friendly messages
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'Requête invalide',
  401: 'Veuillez vous reconnecter',
  403: "Accès refusé",
  404: 'Ressource introuvable',
  408: 'Délai de réponse dépassé',
  409: 'Conflit de données',
  413: 'Fichier trop volumineux',
  422: 'Données invalides',
  429: 'Trop de requêtes, veuillez patienter',
  500: 'Erreur serveur',
  502: 'Service indisponible',
  503: 'Service en maintenance',
  504: 'Délai de réponse dépassé',
};

// Context-specific error messages
const CONTEXT_MESSAGES: Record<string, Record<string, string>> = {
  login: {
    default: 'Connexion impossible, veuillez réessayer',
    401: 'Email ou mot de passe incorrect',
    429: 'Trop de tentatives, veuillez patienter 1 minute',
  },
  upload: {
    default: "Échec de l'envoi du fichier",
    413: 'Fichier trop volumineux (max 10MB)',
    415: 'Format de fichier non supporté',
  },
  validation: {
    default: 'Erreur lors de la validation',
    409: 'Ce document a été modifié par un autre utilisateur',
  },
  fetch: {
    default: 'Erreur de chargement des données',
    404: 'Données introuvables',
  },
};

export interface AppError extends Error {
  code?: string;
  status?: number;
}

export interface ErrorMessageOptions {
  context?: keyof typeof CONTEXT_MESSAGES;
  fallback?: string;
}

/**
 * Get a user-friendly error message from an error object
 */
export function getErrorMessage(
  error: unknown,
  options: ErrorMessageOptions = {}
): string {
  const { context, fallback = 'Une erreur est survenue' } = options;

  // Handle null/undefined
  if (!error) {
    return fallback;
  }

  // Handle AppError with code
  if (isAppError(error)) {
    // First try error code
    if (error.code && ERROR_CODE_MESSAGES[error.code]) {
      return ERROR_CODE_MESSAGES[error.code];
    }

    // Then try context-specific message by status
    if (context && error.status && CONTEXT_MESSAGES[context]) {
      const contextMsg = CONTEXT_MESSAGES[context][error.status];
      if (contextMsg) {
        return contextMsg;
      }
    }

    // Then try generic HTTP status message
    if (error.status && HTTP_STATUS_MESSAGES[error.status]) {
      return HTTP_STATUS_MESSAGES[error.status];
    }

    // Use error message if it looks user-friendly (no technical jargon)
    if (error.message && isUserFriendlyMessage(error.message)) {
      return error.message;
    }
  }

  // Handle string error
  if (typeof error === 'string') {
    return isUserFriendlyMessage(error) ? error : fallback;
  }

  // Use context default if available
  if (context && CONTEXT_MESSAGES[context]?.default) {
    return CONTEXT_MESSAGES[context].default;
  }

  return fallback;
}

/**
 * Type guard for AppError
 */
function isAppError(error: unknown): error is AppError {
  return error instanceof Error || (
    typeof error === 'object' &&
    error !== null &&
    'message' in error
  );
}

/**
 * Check if a message is user-friendly (not technical)
 */
function isUserFriendlyMessage(message: string): boolean {
  // Technical patterns to filter out
  const technicalPatterns = [
    /^HTTP error/i,
    /^Error:/i,
    /^TypeError/i,
    /^SyntaxError/i,
    /^ReferenceError/i,
    /^fetch failed/i,
    /^network/i,
    /undefined|null/i,
    /^\[object/i,
    /^Cannot read/i,
    /^Failed to/i,
  ];

  return !technicalPatterns.some(pattern => pattern.test(message));
}

/**
 * Format validation errors from API response
 */
export function formatValidationErrors(
  errors: Record<string, string[]> | null | undefined
): string[] {
  if (!errors) return [];

  const messages: string[] = [];
  for (const [field, fieldErrors] of Object.entries(errors)) {
    for (const error of fieldErrors) {
      messages.push(`${formatFieldName(field)}: ${error}`);
    }
  }
  return messages;
}

/**
 * Format field name for display
 */
function formatFieldName(field: string): string {
  // Convert snake_case or camelCase to readable format
  return field
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .replace(/^\w/, c => c.toUpperCase())
    .trim();
}

/**
 * Create an error handler for React Query mutations
 */
export function createMutationErrorHandler(context: keyof typeof CONTEXT_MESSAGES) {
  return (error: unknown): string => {
    return getErrorMessage(error, { context });
  };
}
