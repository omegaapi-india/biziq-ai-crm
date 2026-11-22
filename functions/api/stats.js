import { requireAdmin, jsonError } from '../../lib/auth.js';
import { loadWeights } from '../../lib/learning.js';

export async function onRequestGet(context) {
  const { request, env } = context;
  if (!(await requireAdmin(request, env))) return jsonError('Admin sign-in required.', 401);
  if (!env.DB) return jsonError('CRM storage is not configured.', 503);

  const totals = await env.DB.prepare(`
    SELECT COUNT(*) AS total, AVG(score) AS avgScore FROM leads
  `).first();

  const statusRows = await env.DB.prepare(`
    SELECT status, COUNT(*) AS count FROM leads GROUP BY status
  `).all();

  const intentRows = await env.DB.prepare(`
    SELECT intent, COUNT(*) AS count FROM leads GROUP BY intent ORDER BY count DESC LIMIT 6
  `).all();

  const revenueRow = await env.DB.prepare(`
    SELECT COUNT(*) AS wins, COALESCE(SUM(revenue), 0) AS revenue
    FROM outcomes WHERE result = 'won'
  `).first();

  const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const trendRows = await env.DB.prepare(`
    SELECT substr(created_at, 1, 10) AS day, COUNT(*) AS count
    FROM leads WHERE created_at >= ? GROUP BY day ORDER BY day ASC
  `).bind(since).all();

  const weights = await loadWeights(env);

  return Response.json({
    ok: true,
    stats: {
      totalLeads: totals ? totals.total : 0,
      averageScore: totals && totals.avgScore ? Math.round(totals.avgScore) : 0,
      wins: revenueRow ? revenueRow.wins : 0,
      revenue: revenueRow ? revenueRow.revenue : 0,
      status: statusRows.results || [],
      intents: intentRows.results || [],
      trend: trendRows.results || [],
      weights
    }
  }, { headers: { 'Cache-Control': 'no-store' } });
}
