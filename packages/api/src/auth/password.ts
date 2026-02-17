/**
 * Secure password hashing using PBKDF2
 *
 * PBKDF2 is recommended for Cloudflare Workers as bcrypt is not available.
 * Uses 100,000 iterations with SHA-256 and random salt.
 */

const ITERATIONS = 100000;
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16; // 128 bits

/**
 * Generate a cryptographically secure random salt
 */
function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * Convert ArrayBuffer to hex string
 */
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to Uint8Array
 */
function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Derive key using PBKDF2
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const passwordBuffer = encoder.encode(password);

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits']
  );

  // Derive key using PBKDF2
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    KEY_LENGTH * 8 // bits
  );

  return derivedBits;
}

/**
 * Hash a password with a random salt
 *
 * Returns format: iterations:salt:hash (all hex encoded)
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const derivedKey = await deriveKey(password, salt);

  const saltHex = bufferToHex(salt.buffer as ArrayBuffer);
  const hashHex = bufferToHex(derivedKey);

  // Format: iterations:salt:hash
  return `${ITERATIONS}:${saltHex}:${hashHex}`;
}

/**
 * Verify a password against a stored hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split(':');

    // Support legacy SHA-256 hashes (no colons, 64 chars)
    if (parts.length === 1 && storedHash.length === 64) {
      return await verifyLegacyPassword(password, storedHash);
    }

    if (parts.length !== 3) {
      return false;
    }

    const [iterationsStr, saltHex, hashHex] = parts;
    const iterations = parseInt(iterationsStr, 10);

    if (isNaN(iterations) || iterations < 1) {
      return false;
    }

    const salt = hexToBuffer(saltHex);
    const storedKey = hexToBuffer(hashHex);

    // Derive key with same parameters
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      storedKey.length * 8
    );

    // Constant-time comparison
    const derivedArray = new Uint8Array(derivedBits);
    if (derivedArray.length !== storedKey.length) {
      return false;
    }

    let diff = 0;
    for (let i = 0; i < derivedArray.length; i++) {
      diff |= derivedArray[i] ^ storedKey[i];
    }

    return diff === 0;
  } catch {
    return false;
  }
}

/**
 * Verify legacy SHA-256 password (for migration)
 * @deprecated Use PBKDF2 for new passwords
 */
async function verifyLegacyPassword(password: string, hash: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const inputHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return inputHash === hash;
}

/**
 * Check if a hash needs migration to new format
 */
export function needsMigration(hash: string): boolean {
  // Legacy SHA-256 hashes are 64 hex chars without colons
  return hash.length === 64 && !hash.includes(':');
}
