import { requireAdmin, jsonError } from '../../lib/auth.js';
import { cleanText, extractLead } from '../../lib/extract.js';
import { learnFromOutcome } from '../../lib/learning.js';
import { logActivity, botSummary } from '../../lib/events.js';

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
  if (!(await requireAdmin(request, env))) return jsonError('Admin sign-in required.', 401);
  if (!env.DB) return jsonError('CRM storage is not configured.', 503);

  const body = await readBody(request);
  const leadId = cleanText(body.leadId, 80);
  const resultName = cleanText(body.result, 10).toLowerCase();
  if (!leadId) return jsonError('Choose a lead.', 400);
  if (resultName !== 'won' && resultName !== 'lost') return jsonError('Result must be won or lost.', 400);

  const revenue = Math.max(0, Math.min(100000000, Number(body.revenue) || 0));
  const note = cleanText(body.note, 1000);

  const lead = await env.DB.prepare('SELECT id, message, intent, score FROM leads WHERE id = ?')
    .bind(leadId).first();
  if (!lead) return jsonError('Lead not found.', 404);

  const signals = extractLead({ message: lead.message }).signals;
  const weights = await learnFromOutcome(env, signals, resultName, revenue);
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO outcomes (id, lead_id, result, revenue, note, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), leadId, resultName, revenue, note || null, now).run();

  await env.DB.prepare('UPDATE leads SET status = ?, updated_at = ? WHERE id = ?')
    .bind(resultName, now, leadId).run();

  await logActivity(env, {
    leadId,
    type: 'outcome',
    summary: botSummary('recorded outcome', resultName + (revenue ? ' · ₹' + revenue : '')),
    actor: 'admin'
  });
  await logActivity(env, {
    leadId,
    type: 'learning',
    summary: botSummary('updated scoring weights', resultName + ' outcome applied'),
    actor: 'bot'
  });

  return Response.json({ ok: true, result: resultName, weights }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
