import { requireAdmin, jsonError } from '../../lib/auth.js';

function parseTags(value) {
  try {
    const tags = JSON.parse(value || '[]');
    return Array.isArray(tags) ? tags.slice(0, 10) : [];
  } catch {
    return [];
  }
}

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await requireAdmin(request, env))) return jsonError('Admin sign-in required.', 401);
  if (!env.DB) return jsonError('CRM storage is not configured.', 503);

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim().slice(0, 100);
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100));

  let statement;
  let bindings;
  if (query) {
    const like = '%' + query + '%';
    statement = env.DB.prepare(`
      SELECT * FROM leads
      WHERE name LIKE ? OR business LIKE ? OR intent LIKE ? OR source LIKE ?
      ORDER BY created_at DESC LIMIT ?
    `);
    bindings = [like, like, like, like, limit];
  } else {
    statement = env.DB.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT ?');
    bindings = [limit];
  }

  const result = await statement.bind(...bindings).all();
  const leads = (result.results || []).map((row) => ({ ...row, tags: parseTags(row.tags) }));

  return Response.json({ ok: true, count: leads.length, leads }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
