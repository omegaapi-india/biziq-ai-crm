import {
  createAdminSession,
  jsonError,
  sessionCookie,
  verifyAdminPassword
} from '../../../lib/auth.js';

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.ADMIN_PASSWORD_SECRET || !env.ADMIN_SESSION_SECRET) {
    return jsonError('Admin access is not configured.', 503);
  }

  const body = await readBody(request);
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  if (!password) return jsonError('Enter the admin password.', 400);

  if (!(await verifyAdminPassword(password, env))) {
    return jsonError('Incorrect admin password.', 401);
  }

  const token = await createAdminSession(env.ADMIN_SESSION_SECRET);
  const response = Response.json({ ok: true, workspace: 'BizIQ CRM' });
  response.headers.append('Set-Cookie', sessionCookie(token, new URL(request.url)));
  return response;
}
