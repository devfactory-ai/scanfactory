/**
 * Security Configuration for Mobile App
 *
 * Certificate Pinning Implementation
 *
 * For production deployment:
 * 1. Install react-native-ssl-pinning: npm install react-native-ssl-pinning
 * 2. Use Expo development build or eject to bare workflow
 * 3. Generate certificate pins using:
 *    openssl s_client -connect api.scanfactory.tn:443 | openssl x509 -pubkey -noout | openssl rsa -pubin -outform der | openssl dgst -sha256 -binary | openssl enc -base64
 * 4. Update CERTIFICATE_PINS with the generated pins
 */

// Production API domains that should be pinned
const PINNED_DOMAINS = [
  'api.scanfactory.tn',
  'scanfactory.tn',
];

// SHA-256 certificate public key pins
// Format: base64-encoded SHA-256 hash of the certificate's SubjectPublicKeyInfo
// Include backup pins for certificate rotation
const CERTIFICATE_PINS: Record<string, string[]> = {
  'api.scanfactory.tn': [
    // Primary certificate pin (replace with actual pin before production)
    'PLACEHOLDER_PRIMARY_PIN_BASE64',
    // Backup certificate pin for rotation
    'PLACEHOLDER_BACKUP_PIN_BASE64',
  ],
  'scanfactory.tn': [
    'PLACEHOLDER_PRIMARY_PIN_BASE64',
    'PLACEHOLDER_BACKUP_PIN_BASE64',
  ],
};

// Development/staging bypass
const ALLOW_INSECURE_IN_DEV = __DEV__;

/**
 * Check if a URL is targeting a pinned domain
 */
export function isPinnedDomain(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    return PINNED_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

/**
 * Get certificate pins for a domain
 */
export function getCertificatePins(hostname: string): string[] | null {
  // Direct match
  if (CERTIFICATE_PINS[hostname]) {
    return CERTIFICATE_PINS[hostname];
  }

  // Check parent domain
  for (const domain of Object.keys(CERTIFICATE_PINS)) {
    if (hostname.endsWith(`.${domain}`)) {
      return CERTIFICATE_PINS[domain];
    }
  }

  return null;
}

/**
 * Security configuration for the API client
 */
export interface SecurityConfig {
  /** Enable certificate pinning (requires native module in production) */
  enablePinning: boolean;
  /** Allow insecure connections in development */
  allowInsecureInDev: boolean;
  /** Pinned domains */
  pinnedDomains: string[];
  /** Certificate pins by domain */
  certificatePins: Record<string, string[]>;
}

/**
 * Get security configuration for current environment
 */
export function getSecurityConfig(): SecurityConfig {
  return {
    enablePinning: !ALLOW_INSECURE_IN_DEV,
    allowInsecureInDev: ALLOW_INSECURE_IN_DEV,
    pinnedDomains: PINNED_DOMAINS,
    certificatePins: CERTIFICATE_PINS,
  };
}

/**
 * Validate that a request URL is allowed
 * Throws an error if the URL is not allowed
 */
export function validateRequestUrl(url: string): void {
  const config = getSecurityConfig();

  // In dev mode, allow all requests
  if (config.allowInsecureInDev) {
    return;
  }

  // In production, only allow HTTPS to pinned domains
  const parsedUrl = new URL(url);

  if (parsedUrl.protocol !== 'https:') {
    throw new Error(
      `Security Error: Non-HTTPS requests are not allowed in production. URL: ${url}`
    );
  }

  if (!isPinnedDomain(url)) {
    throw new Error(
      `Security Error: Request to non-pinned domain is not allowed. Domain: ${parsedUrl.hostname}`
    );
  }
}

/**
 * Secure fetch wrapper
 *
 * In development: Uses standard fetch
 * In production: Should be replaced with SSL-pinned fetch from react-native-ssl-pinning
 *
 * Usage with react-native-ssl-pinning (for production):
 * ```typescript
 * import { fetch as sslFetch } from 'react-native-ssl-pinning';
 *
 * export async function secureFetch(url: string, options: RequestInit = {}): Promise<Response> {
 *   const hostname = new URL(url).hostname;
 *   const pins = getCertificatePins(hostname);
 *
 *   return sslFetch(url, {
 *     ...options,
 *     sslPinning: {
 *       certs: pins ?? [],
 *     },
 *     timeoutInterval: 30000,
 *   });
 * }
 * ```
 */
export async function secureFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  // Validate URL before making request
  validateRequestUrl(url);

  // In development, use standard fetch
  // In production, this should be replaced with SSL-pinned fetch
  const response = await fetch(url, options);

  return response;
}

/**
 * Check if native SSL pinning module is available
 * Returns true if react-native-ssl-pinning is installed
 */
export function isNativePinningAvailable(): boolean {
  try {
    // Try to import the native module
    // This will throw if not installed
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-ssl-pinning');
    return true;
  } catch {
    return false;
  }
}

/**
 * Get security status for debugging/monitoring
 */
export function getSecurityStatus(): {
  nativePinningAvailable: boolean;
  pinningEnabled: boolean;
  environment: 'development' | 'production';
  pinnedDomainsCount: number;
} {
  return {
    nativePinningAvailable: isNativePinningAvailable(),
    pinningEnabled: !ALLOW_INSECURE_IN_DEV,
    environment: __DEV__ ? 'development' : 'production',
    pinnedDomainsCount: PINNED_DOMAINS.length,
  };
}
