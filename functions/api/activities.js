import { requireAdmin, jsonError } from '../../lib/auth.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await requireAdmin(request, env))) return jsonError('Admin sign-in required.', 401);
  if (!env.DB) return jsonError('CRM storage is not configured.', 503);

  const url = new URL(request.url);
  const leadId = (url.searchParams.get('leadId') || '').slice(0, 80);
  const limit = Math.min(300, Math.max(1, Number(url.searchParams.get('limit')) || 120));

  const result = leadId
    ? await env.DB.prepare('SELECT * FROM activities WHERE lead_id = ? ORDER BY created_at DESC LIMIT ?')
      .bind(leadId, limit).all()
    : await env.DB.prepare('SELECT * FROM activities ORDER BY created_at DESC LIMIT ?')
      .bind(limit).all();

  return Response.json({
    ok: true,
    count: (result.results || []).length,
    activities: result.results || []
  }, { headers: { 'Cache-Control': 'no-store' } });
}
