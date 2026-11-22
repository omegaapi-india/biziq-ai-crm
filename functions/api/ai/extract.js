import { requireAdmin, jsonError } from '../../../lib/auth.js';
import { cleanText, extractLead, redactContact } from '../../../lib/extract.js';
import { loadWeights } from '../../../lib/learning.js';
import { buildExtractionPrompt, callCloudModel, publicModelConfig, validateModelConfig } from '../../../lib/model.js';

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

  const body = await readBody(request);
  const message = cleanText(body.message);
  if (message.length < 10) return jsonError('Paste a longer enquiry message.', 400);

  const weights = await loadWeights(env);
  let refinement = typeof body.refinement === 'string' ? body.refinement.slice(0, 4000) : '';
  let model = publicModelConfig(null);

  if (body.modelConfig && typeof body.modelConfig === 'object') {
    const config = validateModelConfig(body.modelConfig);
    model = publicModelConfig(config);
    if (config.provider === 'cloud') {
      try {
        const result = await callCloudModel(config, buildExtractionPrompt(message));
        refinement = JSON.stringify(result.json || { suggestion: result.text });
      } catch (error) {
        return jsonError(error instanceof Error ? error.message : 'Model request failed.', 502);
      }
    } else {
      return Response.json({
        ok: true,
        needsBrowserBridge: true,
        prompt: buildExtractionPrompt(message),
        model
      }, { headers: { 'Cache-Control': 'no-store' } });
    }
  }

  const lead = extractLead({ message, source: body.source, weights, refinement });
  return Response.json({ ok: true, lead, model }, { headers: { 'Cache-Control': 'no-store' } });
}
