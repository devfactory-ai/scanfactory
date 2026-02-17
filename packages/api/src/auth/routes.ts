import { Hono } from 'hono';
import type { Env } from '../index';
import { createToken, storeSession, invalidateSession, verifyToken } from './jwt';
import { requestOTP, verifyOTP } from './otp';
import { ValidationError, UnauthorizedError } from '../lib/errors';
import { hashPassword, verifyPassword, needsMigration } from './password';
import { authRateLimit } from '../middleware/rateLimit';
import { logAudit } from '../lib/audit';

// Cookie configuration
const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

/**
 * Set authentication cookie with secure flags
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
 * Clear authentication cookie
 */
function clearAuthCookie(
  c: { header: (name: string, value: string) => void; env: Env }
): void {
  const isProduction = c.env.ENVIRONMENT === 'production';

  c.header(
    'Set-Cookie',
    `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isProduction ? '; Secure' : ''}`
  );
}

/**
 * Extract auth token from cookie or Authorization header (for backward compatibility)
 */
function getAuthToken(request: Request): string | null {
  // First try cookie
  const cookieHeader = request.headers.get('Cookie');
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
      const [name, value] = cookie.trim().split('=');
      acc[name] = value;
      return acc;
    }, {} as Record<string, string>);

    if (cookies[AUTH_COOKIE_NAME]) {
      return cookies[AUTH_COOKIE_NAME];
    }
  }

  // Fall back to Authorization header (backward compatibility for mobile app)
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
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

  // Create JWT
  const token = await createToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    c.env.JWT_SECRET
  );

  // Store session in KV
  await storeSession(c.env.CACHE, user.id, token);

  // Set httpOnly cookie
  setAuthCookie(c, token);

  // Audit log: successful login
  await logAudit(c.env.DB, {
    userId: user.id,
    action: 'login',
    entityType: 'user',
    entityId: user.id,
    newValue: { method: 'password', email: user.email },
  });

  // Include token in response for mobile clients (cookies don't work well with RN)
  const responseData: {
    user: { id: string; email: string; name: string; role: string };
    token?: string;
  } = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };

  if (isMobileClient(c.req.raw)) {
    responseData.token = token;
  }

  return c.json(responseData);
});

// POST /api/auth/refresh
authRoutes.post('/refresh', async (c) => {
  const oldToken = getAuthToken(c.req.raw);

  if (!oldToken) {
    throw new UnauthorizedError('Token manquant');
  }

  const payload = await verifyToken(oldToken, c.env.JWT_SECRET);

  if (!payload) {
    throw new UnauthorizedError('Token invalide ou expiré');
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

  // Create new token
  const newToken = await createToken(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
    c.env.JWT_SECRET
  );

  // Update session in KV
  await storeSession(c.env.CACHE, user.id, newToken);

  // Set httpOnly cookie with new token
  setAuthCookie(c, newToken);

  // Include token in response for mobile clients
  const responseData: {
    user: { id: string; email: string; name: string; role: string };
    token?: string;
  } = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  };

  if (isMobileClient(c.req.raw)) {
    responseData.token = newToken;
  }

  return c.json(responseData);
});

// POST /api/auth/logout
authRoutes.post('/logout', async (c) => {
  const token = getAuthToken(c.req.raw);
  let userId: string | null = null;

  if (token) {
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    if (payload) {
      userId = payload.sub;
      await invalidateSession(c.env.CACHE, payload.sub);
    }
  }

  // Clear httpOnly cookie
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

  // Store session and set cookie
  if (result.token && result.user) {
    await storeSession(c.env.CACHE, result.user.id, result.token);
    setAuthCookie(c, result.token);

    // Audit log: successful OTP login
    await logAudit(c.env.DB, {
      userId: result.user.id,
      action: 'login',
      entityType: 'user',
      entityId: result.user.id,
      newValue: { method: 'otp', phone: result.user.phone },
    });
  }

  // Include token in response for mobile clients
  const responseData: {
    user: typeof result.user;
    token?: string;
  } = {
    user: result.user,
  };

  if (isMobileClient(c.req.raw) && result.token) {
    responseData.token = result.token;
  }

  return c.json(responseData);
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
