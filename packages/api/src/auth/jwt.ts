import type { Env } from '../index';

export interface JWTPayload {
  sub: string;
  email: string;
  name: string;
  role: 'admin' | 'operator' | 'consultant';
  iat: number;
  exp: number;
  type?: 'access' | 'refresh'; // Token type for refresh token flow
}

const ALGORITHM = 'HS256';

// SEC-03: Short-lived access tokens + long-lived refresh tokens
const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days

// Legacy expiry for backward compatibility
const TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours (deprecated, use ACCESS_TOKEN_EXPIRY)

function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

async function createSignature(
  data: string,
  secret: string
): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(data)
  );
  return new Uint8Array(signature);
}

async function verifySignature(
  data: string,
  signature: Uint8Array,
  secret: string
): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  return crypto.subtle.verify(
    'HMAC',
    key,
    signature,
    new TextEncoder().encode(data)
  );
}

export async function createToken(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + TOKEN_EXPIRY,
  };

  const header = { alg: ALGORITHM, typ: 'JWT' };
  const headerEncoded = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const payloadEncoded = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(fullPayload))
  );
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;
  const signature = await createSignature(dataToSign, secret);
  const signatureEncoded = base64UrlEncode(signature);

  return `${dataToSign}.${signatureEncoded}`;
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  const dataToVerify = `${headerEncoded}.${payloadEncoded}`;
  const signature = base64UrlDecode(signatureEncoded);

  const isValid = await verifySignature(dataToVerify, signature, secret);
  if (!isValid) return null;

  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(payloadEncoded))
  ) as JWTPayload;

  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) return null;

  return payload;
}

// Store token in KV for session management
export async function storeSession(
  cache: KVNamespace,
  userId: string,
  token: string
): Promise<void> {
  await cache.put(`session:${userId}`, token, {
    expirationTtl: TOKEN_EXPIRY,
  });
}

export async function invalidateSession(
  cache: KVNamespace,
  userId: string
): Promise<void> {
  await cache.delete(`session:${userId}`);
}

export async function getSession(
  cache: KVNamespace,
  userId: string
): Promise<string | null> {
  return cache.get(`session:${userId}`);
}

// =============================================================================
// SEC-03: Refresh Token Functions
// =============================================================================

/**
 * Create an access token (short-lived, 15 minutes)
 */
export async function createAccessToken(
  payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    type: 'access',
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY,
  };

  const header = { alg: ALGORITHM, typ: 'JWT' };
  const headerEncoded = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const payloadEncoded = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(fullPayload))
  );
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;
  const signature = await createSignature(dataToSign, secret);
  const signatureEncoded = base64UrlEncode(signature);

  return `${dataToSign}.${signatureEncoded}`;
}

/**
 * Create a refresh token (long-lived, 7 days)
 */
export async function createRefreshToken(
  payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>,
  secret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    type: 'refresh',
    iat: now,
    exp: now + REFRESH_TOKEN_EXPIRY,
  };

  const header = { alg: ALGORITHM, typ: 'JWT' };
  const headerEncoded = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header))
  );
  const payloadEncoded = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(fullPayload))
  );
  const dataToSign = `${headerEncoded}.${payloadEncoded}`;
  const signature = await createSignature(dataToSign, secret);
  const signatureEncoded = base64UrlEncode(signature);

  return `${dataToSign}.${signatureEncoded}`;
}

/**
 * Create both access and refresh tokens
 */
export async function createTokenPair(
  payload: Omit<JWTPayload, 'iat' | 'exp' | 'type'>,
  secret: string
): Promise<{ accessToken: string; refreshToken: string }> {
  const [accessToken, refreshToken] = await Promise.all([
    createAccessToken(payload, secret),
    createRefreshToken(payload, secret),
  ]);
  return { accessToken, refreshToken };
}

/**
 * Verify a refresh token and check it's not blacklisted
 */
export async function verifyRefreshToken(
  token: string,
  secret: string,
  cache: KVNamespace
): Promise<JWTPayload | null> {
  const payload = await verifyToken(token, secret);

  if (!payload) return null;

  // Must be a refresh token
  if (payload.type !== 'refresh') return null;

  // Check if token is blacklisted (revoked)
  const isBlacklisted = await cache.get(`blacklist:${token.slice(-32)}`);
  if (isBlacklisted) return null;

  return payload;
}

/**
 * Blacklist a refresh token (for logout or rotation)
 */
export async function blacklistRefreshToken(
  cache: KVNamespace,
  token: string,
  expiresInSec: number = REFRESH_TOKEN_EXPIRY
): Promise<void> {
  // Use last 32 chars of token as key to save space
  await cache.put(`blacklist:${token.slice(-32)}`, '1', {
    expirationTtl: expiresInSec,
  });
}

/**
 * Store refresh token session
 */
export async function storeRefreshSession(
  cache: KVNamespace,
  userId: string,
  refreshToken: string
): Promise<void> {
  await cache.put(`refresh:${userId}`, refreshToken, {
    expirationTtl: REFRESH_TOKEN_EXPIRY,
  });
}

/**
 * Get token expiry times for client
 */
export function getTokenExpiry() {
  return {
    accessTokenExpiry: ACCESS_TOKEN_EXPIRY,
    refreshTokenExpiry: REFRESH_TOKEN_EXPIRY,
  };
}
