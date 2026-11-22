// Deterministic lead extraction and adaptive scoring.
// Runs on the server without any model; optional model text can refine it.

export const DEFAULT_WEIGHTS = Object.freeze({
  budget: 22,
  urgency: 18,
  decision: 16,
  need: 14,
  timeline: 10,
  email: 10,
  phone: 6,
  detail: 4
});

const STOP_NAMES = new Set([
  'looking', 'trying', 'wanting', 'needing', 'interested', 'from', 'with',
  'this', 'that', 'just', 'your', 'team', 'regarding', 'about', 'please'
]);

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function cleanText(value, limit = 2000) {
  return String(value ?? '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

export function redactContact(text) {
  return cleanText(text)
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/gi, '[email]')
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[number]');
}

function findEmail(text) {
  const match = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/i);
  return match ? match[0].toLowerCase().slice(0, 160) : null;
}

function findPhone(text) {
  const match = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  if (!match) return null;
  const digits = match[0].replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 18 ? digits : null;
}

function titleCaseName(raw) {
  if (!raw) return null;
  const words = raw
    .split(/\s+/)
    .filter((word) => word && !STOP_NAMES.has(word.toLowerCase()))
    .slice(0, 3);
  return words.length ? words.join(' ') : null;
}

function findName(text, email) {
  const named = text.match(
    /(?:my name is|name\s*:|this is)\s+([A-Za-z][A-Za-z.'-]{1,30}(?:\s+[A-Za-z][A-Za-z.'-]{1,30}){0,2})/i
  );
  if (named) {
    const value = titleCaseName(named[1]);
    if (value) return value.slice(0, 80);
  }

  const spoken = text.match(/(?:^|[.!?]\s+)i(?:'m| am)\s+([A-Z][A-Za-z.'-]{1,30})/);
  if (spoken) return spoken[1].slice(0, 80);

  if (email) {
    const local = email.split('@')[0].replace(/[._+-]+/g, ' ').trim();
    return local ? local.slice(0, 80) : null;
  }
  return null;
}

function findBusiness(text) {
  const named = text.match(
    /(?:company|business|startup|firm|organisation|organization)(?:\s+is|\s+called|:)?\s+([A-Za-z0-9][\w&-]{1,40}(?:\s+[A-Za-z][\w&-]{1,40}){0,2})/i
  );
  if (named) return named[1].slice(0, 100);

  const from = text.match(/\bfrom\s+([A-Z][\w&-]{1,40}(?:\s+[A-Z][\w&-]{1,40}){0,2})/);
  return from ? from[1].slice(0, 100) : null;
}

function findIntent(text) {
  if (/pric(e|ing)|quote|cost|budget|rate card/i.test(text)) return 'pricing';
  if (/demo|walkthrough|see (it|the tool)|trial/i.test(text)) return 'demo';
  if (/integrat|api|connect|sync|plugin/i.test(text)) return 'integration';
  if (/support|issue|problem|help with|broken/i.test(text)) return 'support';
  if (/partner|collaborat|reseller|affiliate/i.test(text)) return 'partnership';
  if (/hiring|career|job|vacancy/i.test(text)) return 'career';
  return 'general';
}

function findSignals(text, email, phone) {
  return {
    budget: /budget|₹|rs\.?|inr|lakh|crore|\d+\s*k\b|afford|invest/i.test(text),
    urgency: /urgent|asap|today|tomorrow|immediately|deadline|quickly/i.test(text),
    decision: /founder|owner|director|manager|head|ceo|decision|approve|we decide/i.test(text),
    need: /need|looking for|want|searching|require|interested|help/i.test(text),
    timeline: /this week|next week|this month|next month|\d+\s*(days|weeks|months)/i.test(text),
    email: Boolean(email),
    phone: Boolean(phone),
    detail: cleanText(text).length >= 80
  };
}

function scoreSignals(signals, weights) {
  let score = 8;
  for (const [key, active] of Object.entries(signals)) {
    if (!active) continue;
    const weight = Number(weights && weights[key]);
    score += Number.isFinite(weight) ? weight : DEFAULT_WEIGHTS[key] || 0;
  }
  return clamp(score, 10, 98);
}

function tagsFor(signals, intent) {
  const tags = [intent];
  for (const [key, active] of Object.entries(signals)) {
    if (active) tags.push(key);
  }
  return tags.slice(0, 10);
}

function nextActionFor(signals, intent) {
  if (signals.urgency && signals.budget) return 'Call today with pricing options';
  if (intent === 'pricing') return 'Send a short pricing sheet';
  if (intent === 'demo') return 'Book a 15-minute demo';
  if (intent === 'integration') return 'Share integration notes';
  if (intent === 'support') return 'Route to support queue';
  if (intent === 'partnership') return 'Send partnership brief';
  if (signals.decision) return 'Reply directly to the decision maker';
  return 'Send a friendly follow-up';
}

export function parseRefinement(refinement) {
  if (!refinement) return {};
  let raw = cleanText(refinement, 4000);
  raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return { suggestion: raw.slice(0, 400) };
  }
}

export function extractLead(input = {}) {
  const message = cleanText(input.message);
  if (message.length < 10) {
    throw new Error('Paste at least a short enquiry message.');
  }

  const source = cleanText(input.source, 40).toLowerCase() || 'website';
  const email = findEmail(message);
  const phone = findPhone(message);
  const signals = findSignals(message, email, phone);
  const weights = input.weights && typeof input.weights === 'object'
    ? input.weights
    : DEFAULT_WEIGHTS;

  const base = {
    name: findName(message, email),
    business: findBusiness(message),
    email,
    phone,
    source,
    message: redactContact(message),
    intent: findIntent(message),
    signals,
    score: scoreSignals(signals, weights),
    tags: tagsFor(signals, findIntent(message)),
    nextAction: nextActionFor(signals, findIntent(message))
  };

  return mergeRefinement(base, input.refinement);
}

export function mergeRefinement(base, refinement) {
  const extra = parseRefinement(refinement);
  const result = { ...base };

  for (const key of ['name', 'business', 'intent', 'nextAction', 'suggestion']) {
    if (typeof extra[key] === 'string' && extra[key].trim()) {
      result[key] = cleanText(extra[key], key === 'suggestion' ? 400 : 100);
    }
  }

  if (Number.isFinite(Number(extra.score))) {
    result.score = clamp(Number(extra.score), 10, 98);
  }

  if (Array.isArray(extra.tags)) {
    const merged = new Set([...base.tags, ...extra.tags.map((tag) => cleanText(tag, 24)).filter(Boolean)]);
    result.tags = [...merged].slice(0, 10);
  }

  return result;
}
