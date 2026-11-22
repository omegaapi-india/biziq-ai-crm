export async function onRequestGet() {
  return Response.json({
    ok: true,
    service: 'BizIQ',
    tagline: 'AI lead capture CRM',
    storage: 'd1-backend',
    mode: 'local-first-rules-with-optional-models',
    models: ['rules', 'local-ollama-bridge', 'byok-openai-compatible'],
    selfLearning: 'adaptive-lead-score-weights',
    botRecorder: 'activity-timeline',
    payment: 'none',
    publicLeadCapture: true
  }, { headers: { 'Cache-Control': 'no-store' } });
}
