// Shared demo admin session helpers.
// Password and session secrets stay in Wrangler secrets; nothing is written to source.

export const ADMIN_COOKIE = 'biziq_admin';
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

const encoder = new TextEncoder();

function base64UrlEncode(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(input) {
  const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  const remainder = normalized.length % 4;
  const padding = remainder === 0 ? '' : '='.repeat(4 - remainder);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function digest(value) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(String(value))));
}

export async function constantEqual(left, right) {
  const [a, b] = await Promise.all([digest(left), digest(right)]);
  const timingSafeEqual = crypto.subtle && crypto.subtle.timingSafeEqual;
  if (typeof timingSafeEqual === 'function') {
    return timingSafeEqual.call(crypto.subtle, a, b);
  }
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

export async function verifyAdminPassword(password, env) {
  if (!env.ADMIN_PASSWORD_SECRET || typeof password !== 'string' || !password) return false;
  return constantEqual(password, env.ADMIN_PASSWORD_SECRET);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function sign(payload, secret) {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return base64UrlEncode(new Uint8Array(signature));
}

function nonce() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function createAdminSession(secret, issuedAt = Date.now()) {
  const payload = String(issuedAt) + '.' + nonce();
  return payload + '.' + await sign(payload, secret);
}

export async function verifyAdminSession(token, secret) {
  if (!token || !secret) return false;
  const parts = String(token).split('.');
  if (parts.length !== 3) return false;

  const issuedAt = Number(parts[0]);
  if (!Number.isSafeInteger(issuedAt)) return false;
  if (Date.now() - issuedAt > SESSION_SECONDS * 1000 || issuedAt - Date.now() > 60000) return false;

  const payload = parts[0] + '.' + parts[1];
  const expected = await sign(payload, secret);
  return constantEqual(parts[2], expected);
}

export function readCookie(header, name) {
  if (!header) return null;
  const prefix = name + '=';
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      try {
        return decodeURIComponent(trimmed.slice(prefix.length));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function sessionCookie(token, url) {
  const parts = [
    ADMIN_COOKIE + '=' + encodeURIComponent(token),
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=' + SESSION_SECONDS
  ];
  if (url.protocol === 'https:') parts.push('Secure');
  return parts.join('; ');
}

export function clearSessionCookie(url) {
  const parts = [ADMIN_COOKIE + '=', 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (url.protocol === 'https:') parts.push('Secure');
  return parts.join('; ');
}

export async function requireAdmin(request, env) {
  if (!env.ADMIN_SESSION_SECRET) return false;
  const token = readCookie(request.headers.get('cookie'), ADMIN_COOKIE);
  return verifyAdminSession(token, env.ADMIN_SESSION_SECRET);
}

export function jsonError(message, status, extra = {}) {
  return Response.json({ error: message, ...extra }, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}
