import { requireAdmin, jsonError } from '../../../lib/auth.js';
import { logActivity, botSummary } from '../../../lib/events.js';

const STALE_DAYS = 3;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!(await requireAdmin(request, env))) return jsonError('Admin sign-in required.', 401);
  if (!env.DB) return jsonError('CRM storage is not configured.', 503);

  const leads = await env.DB.prepare(`
    SELECT id, name, score, status, next_action, created_at FROM leads
    WHERE status IN ('new', 'contacted') ORDER BY created_at DESC LIMIT 100
  `).all();

  const today = new Date().toISOString().slice(0, 10);
  let reviewed = 0;
  let recorded = 0;

  for (const lead of leads.results || []) {
    reviewed += 1;
    const age = Date.now() - Date.parse(lead.created_at);
    const hot = Number(lead.score) >= 70;
    const stale = Number.isFinite(age) && age >= STALE_MS;
    if (!hot && !stale) continue;

    const type = stale ? 'follow-up' : 'priority';
    const existing = await env.DB.prepare(`
      SELECT id FROM activities WHERE lead_id = ? AND type = ? AND substr(created_at, 1, 10) = ? LIMIT 1
    `).bind(lead.id, type, today).first();
    if (existing) continue;

    const detail = stale
      ? 'no update for ' + STALE_DAYS + '+ days · ' + (lead.next_action || 'send a check-in')
      : 'score ' + lead.score + ' · ' + (lead.next_action || 'review this lead');

    await logActivity(env, {
      leadId: lead.id,
      type,
      summary: botSummary(stale ? 'queued follow-up' : 'flagged priority lead', detail),
      actor: 'bot'
    });
    recorded += 1;
  }

  await logActivity(env, {
    leadId: null,
    type: 'bot-run',
    summary: botSummary('completed pipeline review', reviewed + ' leads checked · ' + recorded + ' records added'),
    actor: 'bot'
  });

  return Response.json({
    ok: true,
    reviewed,
    recorded,
    message: 'Bot review complete.'
  }, { headers: { 'Cache-Control': 'no-store' } });
}
