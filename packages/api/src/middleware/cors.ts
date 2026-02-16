import { cors } from 'hono/cors';

export const corsMiddleware = cors({
  origin: ['http://localhost:5173', 'http://localhost:8787'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  maxAge: 86400,
});
