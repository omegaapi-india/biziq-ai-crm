import { requireAdmin } from '../../../lib/auth.js';

export async function onRequestGet(context) {
  const signedIn = await requireAdmin(context.request, context.env);
  return Response.json({ ok: true, signedIn, workspace: signedIn ? 'BizIQ CRM' : null }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
