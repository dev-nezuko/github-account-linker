import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import type { Request, CookieOptions } from 'express';
export const VERIFIER_COOKIE = 'github_oauth_verifier';
export const pkceChallenge = (value: string): string => createHash('sha256').update(value).digest('base64url');
export const STATE_COOKIE = 'github_oauth_state';
export const SESSION_COOKIE = 'github_link_session';
export const SESSION_MS = 8 * 60 * 60 * 1000;
export const newNonce = (): string => randomBytes(32).toString('hex');
export const sessionHash = (value: string): string => createHash('sha256').update(value).digest('hex');
export const cookieOptions = (): CookieOptions => ({httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/api/github'});
export function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0,index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index+1).trim()); } catch { return undefined; }
  }
  return undefined;
}
export function validState(expected: string | undefined, actual: unknown): boolean {
  if (!expected || typeof actual !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || !/^[a-f0-9]{64}$/.test(actual)) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
}
