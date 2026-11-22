// Adaptive scoring loop stored in D1.
// This is a transparent weight update, not a black-box model training job.

import { DEFAULT_WEIGHTS, clamp } from './extract.js';

const WEIGHT_KEY = 'lead-score-weights';

function normalize(value) {
  const weights = { ...DEFAULT_WEIGHTS };
  if (!value || typeof value !== 'object') return weights;

  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    const candidate = Number(value[key]);
    if (Number.isFinite(candidate)) weights[key] = clamp(candidate, 4, 30);
  }
  return weights;
}

export async function loadWeights(env) {
  if (!env.DB) return { ...DEFAULT_WEIGHTS };
  try {
    const row = await env.DB.prepare('SELECT value FROM learning WHERE key = ?')
      .bind(WEIGHT_KEY)
      .first();
    if (!row || !row.value) return { ...DEFAULT_WEIGHTS };
    return normalize(JSON.parse(row.value));
  } catch {
    return { ...DEFAULT_WEIGHTS };
  }
}

export async function saveWeights(env, weights) {
  if (!env.DB) return normalize(weights);
  const value = JSON.stringify(normalize(weights));
  await env.DB.prepare(`
    INSERT INTO learning (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(WEIGHT_KEY, value, new Date().toISOString()).run();
  return normalize(weights);
}

export function adjustWeights(weights, signals, result, revenue = 0) {
  const next = normalize(weights);
  const won = result === 'won';
  const strengthen = won ? 1 : -1;

  for (const [key, active] of Object.entries(signals || {})) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_WEIGHTS, key)) continue;
    if (active) {
      next[key] = clamp(next[key] + strengthen, 4, 30);
    } else {
      next[key] = clamp(next[key] - strengthen, 4, 30);
    }
  }

  if (won && Number(revenue) > 0) {
    next.budget = clamp(next.budget + 2, 4, 30);
    next.decision = clamp(next.decision + 1, 4, 30);
  }

  return next;
}

export async function learnFromOutcome(env, signals, result, revenue) {
  const current = await loadWeights(env);
  const updated = adjustWeights(current, signals, result, revenue);
  await saveWeights(env, updated);
  return updated;
}
