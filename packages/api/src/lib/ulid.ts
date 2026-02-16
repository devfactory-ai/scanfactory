const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

export function generateULID(): string {
  const now = Date.now();
  let str = '';

  // Encode timestamp (48 bits, 10 chars)
  let time = now;
  for (let i = TIME_LEN - 1; i >= 0; i--) {
    str = ENCODING[time % ENCODING_LEN] + str;
    time = Math.floor(time / ENCODING_LEN);
  }

  // Encode random (80 bits, 16 chars)
  const randomBytes = new Uint8Array(10);
  crypto.getRandomValues(randomBytes);
  for (let i = 0; i < RANDOM_LEN; i++) {
    const byte = randomBytes[Math.floor(i / 2)];
    const shift = (i % 2 === 0) ? 4 : 0;
    const nibble = (byte >> shift) & 0x1f;
    str += ENCODING[nibble];
  }

  return str;
}

export function generateId(prefix: string): string {
  return `${prefix}_${generateULID()}`;
}
