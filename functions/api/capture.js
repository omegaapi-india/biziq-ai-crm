import { cleanText, extractLead } from '../../lib/extract.js';
import { loadWeights } from '../../lib/learning.js';
import { logActivity, botSummary } from '../../lib/events.js';
import { buildExtractionPrompt, callCloudModel, publicModelConfig, validateModelConfig } from '../../lib/model.js';

const MAX_BODY = 16000;

async function readBody(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY) throw new Error('Request too large.');
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new Error('Request too large.');
  try {
    const body = JSON.parse(raw);
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.DB) {
    return Response.json({ error: 'CRM storage is not configured.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  let body;
  try {
    body = await readBody(request);
  } catch {
    return Response.json({ error: 'Request too large.' }, {
      status: 413,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  if (cleanText(body.website)) {
    return Response.json({ ok: true, id: 'ignored' }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const startedAt = Number(body.startedAt);
  const formAge = Number.isFinite(startedAt) && startedAt > 0 ? Date.now() - startedAt : -1;
  if (formAge > 0 && formAge < 1200) {
    return Response.json({ error: 'Please take a moment before submitting.' }, {
      status: 429,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const message = cleanText(body.message);
  if (message.length < 10) {
    return Response.json({ error: 'Paste a longer enquiry message.' }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const weights = await loadWeights(env);
  let refinement = typeof body.refinement === 'string' ? body.refinement.slice(0, 4000) : '';
  let modelMeta = { provider: 'rules', model: null, hasKey: false };
  let modelOutcome = 'not-used';

  if (body.modelConfig && typeof body.modelConfig === 'object') {
    try {
      const config = validateModelConfig(body.modelConfig);
      if (config.provider === 'cloud') {
        const result = await callCloudModel(config, buildExtractionPrompt(message));
        refinement = JSON.stringify(result.json || { suggestion: result.text });
        modelMeta = publicModelConfig(config);
        modelOutcome = 'ok';
      } else {
        modelMeta = publicModelConfig(config);
      }
    } catch (error) {
      modelOutcome = 'fallback-rules';
      console.warn(JSON.stringify({
        message: 'BizIQ model fallback',
        reason: error instanceof Error ? error.message : 'unknown model error'
      }));
    }
  }

  let lead;
  try {
    lead = extractLead({ message, source: body.source, weights, refinement });
  } catch {
    return Response.json({ error: 'Could not read that enquiry.' }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' }
    });
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const providerLabel = modelMeta.model
    ? modelMeta.provider + ':' + modelMeta.model
    : 'rules';

  await env.DB.prepare(`
    INSERT INTO leads (
      id, name, business, email, phone, source, message, intent, score,
      status, tags, next_action, model_provider, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?, ?)
  `).bind(
    id,
    lead.name || 'Unnamed lead',
    lead.business || null,
    lead.email || null,
    lead.phone || null,
    lead.source,
    lead.message,
    lead.intent,
    lead.score,
    JSON.stringify(lead.tags),
    lead.nextAction || null,
    providerLabel,
    now,
    now
  ).run();

  await env.DB.prepare(`
    INSERT INTO model_runs (id, lead_id, provider, model, outcome, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), id, modelMeta.provider, modelMeta.model || 'none', modelOutcome, now).run();

  await logActivity(env, {
    leadId: id,
    type: 'classified',
    summary: botSummary('classified lead', lead.intent + ' · score ' + lead.score),
    actor: 'bot'
  });
  await logActivity(env, {
    leadId: id,
    type: 'next-action',
    summary: botSummary('set next action', lead.nextAction),
    actor: 'bot'
  });
  await logActivity(env, {
    leadId: id,
    type: 'model',
    summary: botSummary('analysis source', providerLabel + ' · ' + modelOutcome),
    actor: 'bot'
  });

  return Response.json({
    ok: true,
    id,
    score: lead.score,
    intent: lead.intent,
    nextAction: lead.nextAction,
    model: modelMeta.provider
  }, { headers: { 'Cache-Control': 'no-store' } });
}
