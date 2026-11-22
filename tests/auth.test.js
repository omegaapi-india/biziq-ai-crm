import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdminSession,
  readCookie,
  sessionCookie,
  verifyAdminSession,
  verifyAdminPassword
} from '../lib/auth.js';

const secret = 'test-session-secret-that-is-long-enough';

async function requestWithCookie(value) {
  return { headers: { get: () => value ? 'biziq_admin=' + encodeURIComponent(value) : null } };
}

test('admin session token has three signed parts', async () => {
  const token = await createAdminSession(secret);
  assert.equal(token.split('.').length, 3);
  assert.equal(await verifyAdminSession(token, secret), true);
});

test('tampered session token is rejected', async () => {
  const token = await createAdminSession(secret);
  const parts = token.split('.');
  parts[2] = parts[2] === 'a' ? 'b' : 'a';
  assert.equal(await verifyAdminSession(parts.join('.'), secret), false);
});

test('session token with wrong secret is rejected', async () => {
  const token = await createAdminSession(secret);
  assert.equal(await verifyAdminSession(token, 'another-secret'), false);
});

test('expired session token is rejected', async () => {
  const old = Date.now() - (8 * 24 * 60 * 60 * 1000);
  const token = await createAdminSession(secret, old);
  assert.equal(await verifyAdminSession(token, secret), false);
});

test('readCookie reads the named admin cookie', () => {
  assert.equal(readCookie('a=1; biziq_admin=abc%20123; c=3', 'biziq_admin'), 'abc 123');
  assert.equal(readCookie('a=1', 'biziq_admin'), null);
});

test('sessionCookie is HttpOnly and secure on HTTPS', () => {
  const secure = sessionCookie('token', new URL('https://biziq.pages.dev/'));
  assert.match(secure, /HttpOnly/);
  assert.match(secure, /Secure/);
  assert.match(secure, /SameSite=Lax/);
  const local = sessionCookie('token', new URL('http://localhost:8790/'));
  assert.doesNotMatch(local, /Secure/);
});

test('admin password verification uses the configured secret', async () => {
  const env = { ADMIN_PASSWORD_SECRET: 'demo-password' };
  assert.equal(await verifyAdminPassword('demo-password', env), true);
  assert.equal(await verifyAdminPassword('wrong-password', env), false);
  assert.equal(await verifyAdminPassword('demo-password', {}), false);
});
