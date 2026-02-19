import { Hono } from 'hono';
import type { Env } from '../index';
import {
  createToken,
  createTokenPair,
  createAccessToken,
  storeSession,
  storeRefreshSession,
  invalidateSession,
  verifyToken,
  verifyRefreshToken,
  blacklistRefreshToken,
  getTokenExpiry,
} from './jwt';
import { requestOTP, verifyOTP } from './otp';
import { ValidationError, UnauthorizedError } from '../lib/errors';
import { hashPassword, verifyPassword, needsMigration } from './password';
import { authRateLimit } from '../middleware/rateLimit';
import { logAudit } from '../lib/audit';

// Cookie configuration
const AUTH_COOKIE_NAME = 'auth_token';
const REFRESH_COOKIE_NAME = 'refresh_token';
const AUTH_COOKIE_MAX_AGE = 15 * 60; // 15 minutes (access token)
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days (refresh token)

/**
 * Set authentication cookie with secure flags (access token)
 */
function setAuthCookie(
  c: { header: (name: string, value: string) => void; env: Env },
  token: string
): void {
  const isProduction = c.env.ENVIRONMENT === 'production';

  c.header(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${AUTH_COOKIE_MAX_AGE}${isProduction ? '; Secure' : ''}`
  );
}

/**
 * Set refresh token cookie (long-lived, separate from access token)
 */
function setRefreshCookie(
  c: { header: (name: string, value: string) => void; env: Env },
  token: string
): void {
  const isProduction = c.env.ENVIRONMENT === 'production';

  // Refresh token cookie - HttpOnly, Secure, SameSite=Strict
  // Path=/api/auth to limit exposure (only auth endpoints can read it)
  c.header(
    'Set-Cookie',
    `${REFRESH_COOKIE_NAME}=${token}; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=${REFRESH_COOKIE_MAX_AGE}${isProduction ? '; Secure' : ''}`
  );
}

/**
 * Clear authentication cookies (both access and refresh)
 */
function clearAuthCookies(
  c: { header: (name: string, value: string) => void; env: Env }
): void {
  const isProduction = c.env.ENVIRONMENT === 'production';

  c.header(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProduction ? '; Secure' : ''}`
  );
}

/**
 * Clear refresh cookie
 */
function clearRefreshCookie(
  c: { header: (name: string, value: string) => void; env: Env }
): void {
  const isProduction = c.env.ENVIRONMENT === 'production';

  c.header(
    'Set-Cookie',
    `${REFRESH_COOKIE_NAME}=; Path=/api/auth; HttpOnly; SameSite=Strict; Max-Age=0${isProduction ? '; Secure' : ''}`
  );
}

// Legacy function for backward compatibility
function clearAuthCookie(
  c: { header: (name: string, value: string) => void; env: Env }
): void {
  clearAuthCookies(c);
  clearRefreshCookie(c);
}

/**
 * Parse cookies from request
 */
function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return {};

  return cookieHeader.split(';').reduce((acc, cookie) => {
    const [name, ...rest] = cookie.trim().split('=');
    acc[name] = rest.join('='); // Handle values with = in them
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Extract auth token from cookie or Authorization header (for backward compatibility)
 */
function getAuthToken(request: Request): string | null {
  // First try cookie
  const cookies = parseCookies(request);
  if (cookies[AUTH_COOKIE_NAME]) {
    return cookies[AUTH_COOKIE_NAME];
  }

  // Fall back to Authorization header (backward compatibility for mobile app)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

/**
 * Extract refresh token from cookie
 */
function getRefreshToken(request: Request): string | null {
  const cookies = parseCookies(request);
  return cookies[REFRESH_COOKIE_NAME] || null;
}

/**
 * Check if request is from a mobile client
 * Mobile clients need the token in the response body since httpOnly cookies
 * don't work well with React Native fetch
 */
function isMobileClient(request: Request): boolean {
  const userAgent = request.headers.get('User-Agent') ?? '';
  // Check for common mobile app user agents
  return (
    userAgent.includes('Expo') ||
    userAgent.includes('okhttp') ||
    userAgent.includes('Dalvik') ||
    userAgent.includes('CFNetwork') ||
    request.headers.get('X-Mobile-Client') === 'true'
  );
}

interface LoginBody {
  email: string;
  password: string;
}

interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: 'admin' | 'operator' | 'consultant';
  active: number;
}

const authRoutes = new Hono<{ Bindings: Env }>();

// Apply rate limiting to sensitive auth endpoints
authRoutes.use('/login', authRateLimit);
authRoutes.use('/otp/request', authRateLimit);
authRoutes.use('/otp/verify', authRateLimit);

// POST /api/auth/login
authRoutes.post('/login', async (c) => {
  const body = await c.req.json<LoginBody>();

  if (!body.email || !body.password) {
    throw new ValidationError('Email et mot de passe requis');
  }

  // Find user by email
  const user = await c.env.DB.prepare(
    'SELECT id, email, password_hash, name, role, active FROM users WHERE email = ?'
  )
    .bind(body.email)
    .first<User>();

  if (!user) {
    throw new UnauthorizedError('Email ou mot de passe incorrect');
  }

  if (!user.active) {
    throw new UnauthorizedError('Compte désactivé');
  }

  // Verify password
  const isValid = await verifyPassword(body.password, user.password_hash);
  if (!isValid) {
    throw new UnauthorizedError('Email ou mot de passe incorrect');
  }

  // Migrate legacy password hash if needed (SHA-256 → PBKDF2)
  if (needsMigration(user.password_hash)) {
    const newHash = await hashPassword(body.password);
    await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .bind(newHash, user.id)
      .run();
  }

  // Create token pair (access + refresh)
  const { accessToken, refreshToken } = await createTokenPair(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    c.env.JWT_SECRET
  );

  // Store sessions in KV
  await Promise.all([
    storeSession(c.env.CACHE, user.id, accessToken),
    storeRefreshSession(c.env.CACHE, user.id, refreshToken),
  ]);

  // Set httpOnly cookies
  setAuthCookie(c, accessToken);
  setRefreshCookie(c, refreshToken);

  // Audit log: successful login
  await logAudit(c.env.DB, {
    userId: user.id,
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    newValue: { method: 'password', email: user.email },
  });

  // Include tokens in response for mobile clients (cookies don't work well with RN)
  const { accessTokenExpiry, refreshTokenExpiry } = getTokenExpiry();
  const responseData: {
    user: { id: string; email: string; name: string; role: string };
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    token?: string; // Legacy field for backward compatibility
  } = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };

  if (isMobileClient(c.req.raw)) {
    responseData.accessToken = accessToken;
    responseData.refreshToken = refreshToken;
    responseData.expiresIn = accessTokenExpiry;
    responseData.token = accessToken; // Legacy compatibility
  }

  return c.json(responseData);
});

// POST /api/auth/refresh - Refresh access token using refresh token
authRoutes.post('/refresh', async (c) => {
  // Try to get refresh token from cookie first, then from body (mobile)
  let refreshTokenValue = getRefreshToken(c.req.raw);

  if (!refreshTokenValue) {
    // Try to get from request body (for mobile clients)
    try {
      const body = await c.req.json<{ refreshToken?: string }>();
      refreshTokenValue = body.refreshToken ?? null;
    } catch {
      // No body or invalid JSON
    }
  }

  if (!refreshTokenValue) {
    throw new UnauthorizedError('Refresh token manquant');
  }

  // Verify refresh token (checks signature, expiry, and blacklist)
  const payload = await verifyRefreshToken(
    refreshTokenValue,
    c.env.JWT_SECRET,
    c.env.CACHE
  );

  if (!payload) {
    // Clear cookies if refresh token is invalid
    clearAuthCookie(c);
    throw new UnauthorizedError('Refresh token invalide ou expiré');
  }

  // Check if user is still active
  const user = await c.env.DB.prepare(
    'SELECT id, email, name, role, active FROM users WHERE id = ?'
  )
    .bind(payload.sub)
    .first<User>();

  if (!user || !user.active) {
    throw new UnauthorizedError('Utilisateur non trouvé ou désactivé');
  }

  // Rotate refresh token (blacklist old one, create new pair)
  await blacklistRefreshToken(c.env.CACHE, refreshTokenValue);

  // Create new token pair
  const { accessToken, refreshToken: newRefreshToken } = await createTokenPair(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    c.env.JWT_SECRET
  );

  // Update sessions in KV
  await Promise.all([
    storeSession(c.env.CACHE, user.id, accessToken),
    storeRefreshSession(c.env.CACHE, user.id, newRefreshToken),
  ]);

  // Set httpOnly cookies with new tokens
  setAuthCookie(c, accessToken);
  setRefreshCookie(c, newRefreshToken);

  // Include tokens in response for mobile clients
  const { accessTokenExpiry } = getTokenExpiry();
  const responseData: {
    user: { id: string; email: string; name: string; role: string };
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    token?: string; // Legacy
  } = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };

  if (isMobileClient(c.req.raw)) {
    responseData.accessToken = accessToken;
    responseData.refreshToken = newRefreshToken;
    responseData.expiresIn = accessTokenExpiry;
    responseData.token = accessToken; // Legacy
  }

  return c.json(responseData);
});

// POST /api/auth/logout
authRoutes.post('/logout', async (c) => {
  const token = getAuthToken(c.req.raw);
  const refreshTokenValue = getRefreshToken(c.req.raw);
  let userId: string | null = null;

  if (token) {
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    if (payload) {
      userId = payload.sub;
      await invalidateSession(c.env.CACHE, payload.sub);
    }
  }

  // Blacklist refresh token if present
  if (refreshTokenValue) {
    await blacklistRefreshToken(c.env.CACHE, refreshTokenValue);
  }

  // Clear httpOnly cookies (both access and refresh)
  clearAuthCookie(c);

  // Audit log: logout (only if user was authenticated)
  if (userId) {
    await logAudit(c.env.DB, {
      userId,
      action: 'logout',
      entityType: 'user',
      entityId: userId,
    });
  }

  return c.json({ success: true });
});

// POST /api/auth/otp/request - Request OTP code
authRoutes.post('/otp/request', async (c) => {
  const body = await c.req.json<{ phone: string }>();

  if (!body.phone) {
    throw new ValidationError('Numéro de téléphone requis');
  }

  const result = await requestOTP(c.env, body.phone);

  if (!result.success) {
    throw new ValidationError(result.message);
  }

  return c.json({ message: result.message });
});

// POST /api/auth/otp/verify - Verify OTP code
authRoutes.post('/otp/verify', async (c) => {
  const body = await c.req.json<{ phone: string; code: string }>();

  if (!body.phone || !body.code) {
    throw new ValidationError('Numéro de téléphone et code requis');
  }

  const result = await verifyOTP(c.env, body.phone, body.code);

  if (!result.success) {
    throw new UnauthorizedError(result.message);
  }

  // Create token pair and store session
  if (result.user) {
    const { accessToken, refreshToken } = await createTokenPair(
      {
        sub: result.user.id,
        email: result.user.email || '',
        name: result.user.name,
        role: result.user.role as 'admin' | 'operator' | 'consultant',
      },
      c.env.JWT_SECRET
    );

    await Promise.all([
      storeSession(c.env.CACHE, result.user.id, accessToken),
      storeRefreshSession(c.env.CACHE, result.user.id, refreshToken),
    ]);

    setAuthCookie(c, accessToken);
    setRefreshCookie(c, refreshToken);

    // Audit log: successful OTP login
    await logAudit(c.env.DB, {
      userId: result.user.id,
      action: 'login',
      entityType: 'user',
      entityId: result.user.id,
      newValue: { method: 'otp', phone: result.user.phone },
    });

    // Include tokens in response for mobile clients
    const { accessTokenExpiry } = getTokenExpiry();
    const responseData: {
      user: typeof result.user;
      accessToken?: string;
      refreshToken?: string;
      expiresIn?: number;
      token?: string; // Legacy
    } = {
      user: result.user,
    };

    if (isMobileClient(c.req.raw)) {
      responseData.accessToken = accessToken;
      responseData.refreshToken = refreshToken;
      responseData.expiresIn = accessTokenExpiry;
      responseData.token = accessToken; // Legacy
    }

    return c.json(responseData);
  }

  return c.json({ user: result.user });
});

// GET /api/auth/me - Get current user info
authRoutes.get('/me', async (c) => {
  const token = getAuthToken(c.req.raw);

  if (!token) {
    throw new UnauthorizedError('Token manquant');
  }

  const payload = await verifyToken(token, c.env.JWT_SECRET);

  if (!payload) {
    throw new UnauthorizedError('Token invalide ou expiré');
  }

  return c.json({
    user: {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    },
  });
});

export { authRoutes, hashPassword };
