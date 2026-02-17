import type { Env } from '../index';
import { createToken } from './jwt';
import { generateId } from '../lib/ulid';

const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const OTP_LENGTH = 6;

interface OTPData {
  code: string;
  phone: string;
  expires_at: number;
  attempts: number;
}

/**
 * Generate a random OTP code
 */
function generateOTP(): string {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < OTP_LENGTH; i++) {
    otp += digits[Math.floor(Math.random() * digits.length)];
  }
  return otp;
}

/**
 * Normalize phone number to E.164 format (Tunisia)
 */
function normalizePhone(phone: string): string {
  // Remove spaces, dashes, etc.
  let normalized = phone.replace(/[\s\-\(\)\.]/g, '');

  // Handle Tunisian format
  if (normalized.startsWith('00216')) {
    normalized = '+216' + normalized.slice(5);
  } else if (normalized.startsWith('216')) {
    normalized = '+216' + normalized.slice(3);
  } else if (normalized.startsWith('0')) {
    normalized = '+216' + normalized.slice(1);
  } else if (!normalized.startsWith('+')) {
    normalized = '+216' + normalized;
  }

  return normalized;
}

/**
 * Send OTP via SMS using Twilio
 * Falls back to logging if Twilio is not configured
 */
async function sendSMS(
  env: Env,
  to: string,
  code: string
): Promise<{ success: boolean; message?: string }> {
  const accountSid = (env as unknown as Record<string, string>).TWILIO_ACCOUNT_SID;
  const authToken = (env as unknown as Record<string, string>).TWILIO_AUTH_TOKEN;
  const fromNumber = (env as unknown as Record<string, string>).TWILIO_PHONE_NUMBER;

  // Stub if Twilio is not configured
  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[OTP STUB] Sending code ${code} to ${to}`);
    return { success: true, message: 'Mode test: code affiché dans les logs' };
  }

  try {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const body = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: `Votre code ScanFactory: ${code}. Valide pendant 5 minutes.`,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Twilio error:', error);
      return { success: false, message: 'Erreur d\'envoi SMS' };
    }

    return { success: true };
  } catch (error) {
    console.error('SMS send error:', error);
    return { success: false, message: 'Erreur d\'envoi SMS' };
  }
}

/**
 * Request an OTP code for a phone number
 */
export async function requestOTP(
  env: Env,
  phone: string
): Promise<{ success: boolean; message: string }> {
  const normalizedPhone = normalizePhone(phone);

  // Validate phone format
  if (!/^\+216[2-9]\d{7}$/.test(normalizedPhone)) {
    return { success: false, message: 'Numéro de téléphone invalide' };
  }

  // Generate OTP
  const code = generateOTP();
  const otpData: OTPData = {
    code,
    phone: normalizedPhone,
    expires_at: Date.now() + OTP_EXPIRY_SECONDS * 1000,
    attempts: 0,
  };

  // Store OTP in KV (expires after 5 minutes)
  await env.CACHE.put(`otp:${normalizedPhone}`, JSON.stringify(otpData), {
    expirationTtl: OTP_EXPIRY_SECONDS,
  });

  // Send SMS
  const result = await sendSMS(env, normalizedPhone, code);

  if (!result.success) {
    return { success: false, message: result.message ?? 'Erreur d\'envoi' };
  }

  return {
    success: true,
    message: result.message ?? 'Code envoyé par SMS',
  };
}

/**
 * Verify an OTP code and return a token if valid
 */
export async function verifyOTP(
  env: Env,
  phone: string,
  code: string
): Promise<{
  success: boolean;
  message: string;
  token?: string;
  user?: {
    id: string;
    phone: string;
    name: string;
    role: 'admin' | 'operator' | 'consultant';
  };
}> {
  const normalizedPhone = normalizePhone(phone);

  // Get OTP from KV
  const otpJson = await env.CACHE.get(`otp:${normalizedPhone}`);
  if (!otpJson) {
    return { success: false, message: 'Code expiré ou inexistant' };
  }

  const otpData = JSON.parse(otpJson) as OTPData;

  // Check attempts
  if (otpData.attempts >= 3) {
    await env.CACHE.delete(`otp:${normalizedPhone}`);
    return { success: false, message: 'Trop de tentatives, demandez un nouveau code' };
  }

  // Verify code
  if (otpData.code !== code) {
    // Increment attempts
    otpData.attempts++;
    await env.CACHE.put(`otp:${normalizedPhone}`, JSON.stringify(otpData), {
      expirationTtl: Math.floor((otpData.expires_at - Date.now()) / 1000),
    });
    return { success: false, message: 'Code incorrect' };
  }

  // Delete OTP
  await env.CACHE.delete(`otp:${normalizedPhone}`);

  // Find or create user
  let user = await env.DB
    .prepare('SELECT * FROM users WHERE phone = ?')
    .bind(normalizedPhone)
    .first<{
      id: string;
      email: string | null;
      phone: string;
      name: string;
      role: 'admin' | 'operator' | 'consultant';
      active: number;
    }>();

  if (!user) {
    // Create new user as operator
    const userId = generateId('user');
    await env.DB
      .prepare(
        `INSERT INTO users (id, phone, name, role, active)
         VALUES (?, ?, ?, 'operator', 1)`
      )
      .bind(userId, normalizedPhone, `Utilisateur ${normalizedPhone.slice(-4)}`)
      .run();

    user = {
      id: userId,
      email: null,
      phone: normalizedPhone,
      name: `Utilisateur ${normalizedPhone.slice(-4)}`,
      role: 'operator',
      active: 1,
    };
  }

  if (!user.active) {
    return { success: false, message: 'Compte désactivé' };
  }

  // Create token
  const token = await createToken(
    {
      sub: user.id,
      email: user.email ?? user.phone,
      name: user.name,
      role: user.role,
    },
    env.JWT_SECRET
  );

  return {
    success: true,
    message: 'Authentification réussie',
    token,
    user: {
      id: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role,
    },
  };
}
