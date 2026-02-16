import { Hono } from 'hono';
import type { Env } from '../index';
import { createToken, storeSession, invalidateSession, verifyToken } from './jwt';
import { ValidationError, UnauthorizedError } from '../lib/errors';

// Simple password hashing using Web Crypto API
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const inputHash = await hashPassword(password);
  return inputHash === hash;
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

  return c.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

// POST /api/auth/refresh
authRoutes.post('/refresh', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token manquant');
  }

  const oldToken = authHeader.substring(7);
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

  return c.json({
    token: newToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
});

// POST /api/auth/logout
authRoutes.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    if (payload) {
      await invalidateSession(c.env.CACHE, payload.sub);
    }
  }

  return c.json({ success: true });
});

// GET /api/auth/me - Get current user info
authRoutes.get('/me', async (c) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Token manquant');
  }

  const token = authHeader.substring(7);
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
