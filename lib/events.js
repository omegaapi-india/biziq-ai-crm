// The built-in bot writes a short activity record for every meaningful change.

import { cleanText } from './extract.js';

export async function logActivity(env, entry) {
  if (!env.DB) return;

  const leadId = entry.leadId ? String(entry.leadId).slice(0, 80) : null;
  const type = cleanText(entry.type, 40) || 'note';
  const summary = cleanText(entry.summary, 240);
  const actor = cleanText(entry.actor, 30) || 'bot';
  if (!summary) return;

  await env.DB.prepare(`
    INSERT INTO activities (id, lead_id, type, summary, actor, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), leadId, type, summary, actor, new Date().toISOString()).run();
}

export function botSummary(action, detail) {
  return 'Bot: ' + cleanText(action, 80) + (detail ? ' — ' + cleanText(detail, 140) : '');
}
