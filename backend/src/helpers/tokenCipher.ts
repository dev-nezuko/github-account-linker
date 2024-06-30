import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const FORMAT = 'v1';
const ALGORITHM = 'aes-256-gcm';

export const encryptToken = (token: string, key: Buffer): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const body = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return [FORMAT, ...[iv, body, cipher.getAuthTag()].map(part => part.toString('base64url'))].join('.');
};

export const decryptToken = (stored: string, key: Buffer): string => {
  // Rows written before tokens were encrypted hold "Bearer <token>" in clear text.
  // They are still readable so the user can revoke; the next sign-in re-encrypts.
  if (stored.startsWith('Bearer ')) return stored.slice('Bearer '.length);
  const [format, iv, body, tag] = stored.split('.');
  if (format !== FORMAT || !iv || !body || !tag) throw new Error('Unrecognised stored token format');
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64url')), decipher.final()]).toString('utf8');
};
