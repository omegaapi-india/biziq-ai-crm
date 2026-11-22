import { requireAdmin, jsonError } from '../../../lib/auth.js';
import { cleanText, extractLead } from '../../../lib/extract.js';
import { logActivity, botSummary } from '../../../lib/events.js';

const STATUSES = new Set(['new', 'contacted', 'qualified', 'won', 'lost']);

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  if (!(await requireAdmin(request, env))) return jsonError('Admin sign-in required.', 401);
  if (!env.DB) return jsonError('CRM storage is not configured.', 503);

  const row = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(params.id).first();
  if (!row) return jsonError('Lead not found.', 404);

  return Response.json({ ok: true, lead: row }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  if (!(await requireAdmin(request, env))) return jsonError('Admin sign-in required.', 401);
  if (!env.DB) return jsonError('CRM storage is not configured.', 503);

  const existing = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(params.id).first();
  if (!existing) return jsonError('Lead not found.', 404);

  await env.DB.prepare('DELETE FROM activities WHERE lead_id = ?').bind(params.id).run();
  await env.DB.prepare('DELETE FROM outcomes WHERE lead_id = ?').bind(params.id).run();
  await env.DB.prepare('DELETE FROM model_runs WHERE lead_id = ?').bind(params.id).run();
  await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(params.id).run();

  await logActivity(env, {
    leadId: null,
    type: 'deleted',
    summary: botSummary('removed lead', 'test records cleaned up'),
    actor: 'admin'
  });

  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  if (!(await requireAdmin(request, env))) return jsonError('Admin sign-in required.', 401);
  if (!env.DB) return jsonError('CRM storage is not configured.', 503);

  const body = await readBody(request);
  const existing = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(params.id).first();
  if (!existing) return jsonError('Lead not found.', 404);

  const status = body.status === undefined ? existing.status : cleanText(body.status, 20);
  if (!STATUSES.has(status)) return jsonError('Choose a valid status.', 400);

  const note = body.note === undefined ? existing.note : cleanText(body.note, 2000);
  const nextAction = body.nextAction === undefined
    ? existing.next_action
    : cleanText(body.nextAction, 200);
  const tags = body.tags === undefined
    ? existing.tags
    : JSON.stringify(extractLead({ message: existing.message + ' ' + cleanText(body.tags, 200) }).tags);

  await env.DB.prepare(`
    UPDATE leads SET status = ?, note = ?, next_action = ?, tags = ?, updated_at = ? WHERE id = ?
  `).bind(status, note || null, nextAction || null, tags || '[]', new Date().toISOString(), params.id).run();

  await logActivity(env, {
    leadId: params.id,
    type: 'updated',
    summary: botSummary('lead updated', 'status ' + status),
    actor: 'admin'
  });

  return Response.json({ ok: true, status }, { headers: { 'Cache-Control': 'no-store' } });
}
