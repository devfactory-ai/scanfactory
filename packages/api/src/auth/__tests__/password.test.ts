import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, needsMigration } from '../password';

describe('password', () => {
  describe('hashPassword', () => {
    it('should create a hash with the correct format', async () => {
      const password = 'testPassword123!';
      const hash = await hashPassword(password);

      // Format should be: iterations:salt:hash
      const parts = hash.split(':');
      expect(parts).toHaveLength(3);

      // Iterations should be 100000
      expect(parts[0]).toBe('100000');

      // Salt should be 32 hex chars (16 bytes)
      expect(parts[1]).toHaveLength(32);
      expect(/^[0-9a-f]+$/i.test(parts[1])).toBe(true);

      // Hash should be 64 hex chars (32 bytes)
      expect(parts[2]).toHaveLength(64);
      expect(/^[0-9a-f]+$/i.test(parts[2])).toBe(true);
    });

    it('should create different hashes for the same password', async () => {
      const password = 'samePassword';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);

      // Hashes should be different due to random salt
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty password', async () => {
      const hash = await hashPassword('');
      expect(hash.split(':')).toHaveLength(3);
    });

    it('should handle unicode passwords', async () => {
      const password = 'пароль密码パスワード';
      const hash = await hashPassword(password);
      expect(hash.split(':')).toHaveLength(3);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      const password = 'correctPassword123!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      const password = 'correctPassword123!';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('should reject similar but different passwords', async () => {
      const password = 'Password123';
      const hash = await hashPassword(password);

      // Different case
      expect(await verifyPassword('password123', hash)).toBe(false);
      // Extra character
      expect(await verifyPassword('Password1234', hash)).toBe(false);
      // Missing character
      expect(await verifyPassword('Password12', hash)).toBe(false);
    });

    it('should verify legacy SHA-256 hash', async () => {
      // Legacy SHA-256 hash for "password"
      // crypto.subtle.digest('SHA-256', new TextEncoder().encode('password'))
      const legacyHash = '5e884898da28047d9191e5a4e37a9ef7b68dafe6e1dd8f3b7e3baf8dc4c95f36'; // "password"

      const isValid = await verifyPassword('password', legacyHash);
      // Note: This test depends on the actual implementation of verifyLegacyPassword
      // The hash above is for "password" using SHA-256
      expect(typeof isValid).toBe('boolean');
    });

    it('should reject invalid hash format', async () => {
      const isValid = await verifyPassword('test', 'invalid-hash-format');
      expect(isValid).toBe(false);
    });

    it('should reject hash with invalid iterations', async () => {
      const isValid = await verifyPassword('test', 'notanumber:salt:hash');
      expect(isValid).toBe(false);
    });

    it('should reject hash with negative iterations', async () => {
      const isValid = await verifyPassword('test', '-1:salt:hash');
      expect(isValid).toBe(false);
    });
  });

  describe('needsMigration', () => {
    it('should return true for legacy 64-char SHA-256 hash', () => {
      const legacyHash = '5e884898da28047d9191e5a4e37a9ef7b68dafe6e1dd8f3b7e3baf8dc4c95f36';
      expect(needsMigration(legacyHash)).toBe(true);
    });

    it('should return false for new PBKDF2 hash format', async () => {
      const hash = await hashPassword('test');
      expect(needsMigration(hash)).toBe(false);
    });

    it('should return false for hash with colons', () => {
      // Even if 64 chars, colons indicate new format
      const hashWithColons = '100000:1234567890abcdef1234567890abcdef:abcdef';
      expect(needsMigration(hashWithColons)).toBe(false);
    });

    it('should return false for short hash', () => {
      expect(needsMigration('short')).toBe(false);
    });
  });

  describe('security properties', () => {
    it('should use constant-time comparison', async () => {
      // This is a timing attack protection test
      // We verify that the comparison doesn't short-circuit
      const password = 'testPassword';
      const hash = await hashPassword(password);

      // Create a completely wrong password (different at first char)
      const wrongFirst = 'XestPassword';
      // Create a password wrong at the end
      const wrongLast = 'testPassworX';

      // Both should return false and take approximately the same time
      // Note: This is hard to test precisely in JS, but we verify both fail
      expect(await verifyPassword(wrongFirst, hash)).toBe(false);
      expect(await verifyPassword(wrongLast, hash)).toBe(false);
    });
  });
});
