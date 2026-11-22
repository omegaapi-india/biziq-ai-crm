// Model-agnostic adapter.
// Default: deterministic rules or a local Ollama bridge.
// Optional: any OpenAI-compatible HTTPS endpoint with a user-supplied key (BYOK).
// Keys are never written to D1, logs, config files, or error messages.

import { redactContact } from './extract.js';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const PRIVATE_PREFIXES = ['10.', '192.168.', '169.254.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.'];

function isPrivateHost(host) {
  const value = String(host || '').toLowerCase();
  if (LOCAL_HOSTS.has(value)) return true;
  if (value.endsWith('.localhost') || value.endsWith('.internal') || value.endsWith('.local')) return true;
  return PRIVATE_PREFIXES.some((prefix) => value.startsWith(prefix));
}

export function validateModelConfig(raw) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const provider = input.provider === 'cloud' ? 'cloud' : 'local';

  if (provider === 'local') {
    const baseUrl = String(input.baseUrl || 'http://127.0.0.1:8789').trim();
    let parsed;
    try {
      parsed = new URL(baseUrl);
    } catch {
      throw new Error('Enter a valid local bridge URL.');
    }
    if (parsed.protocol !== 'http:' || !LOCAL_HOSTS.has(parsed.hostname)) {
      throw new Error('Local models must use http://127.0.0.1 on this machine.');
    }
    const model = String(input.model || 'llama3.2').trim().slice(0, 80);
    if (!model) throw new Error('Enter a local model name.');
    return { provider: 'local', baseUrl: parsed.origin, model };
  }

  const baseUrl = String(input.baseUrl || '').trim();
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error('Enter a valid HTTPS model endpoint.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Cloud endpoints must use HTTPS.');
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error('Private or localhost cloud endpoints are not allowed.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Do not put credentials in the model URL.');
  }

  const apiKey = String(input.apiKey || '').trim();
  if (apiKey.length < 8) throw new Error('Enter your own cloud API key.');

  const model = String(input.model || '').trim();
  if (!model || model.length > 80) throw new Error('Enter a model name.');

  return {
    provider: 'cloud',
    baseUrl: baseUrl.replace(/\/+$/, ''),
    model,
    apiKey
  };
}

export function publicModelConfig(config) {
  if (!config) return { provider: 'rules', model: null, hasKey: false };
  return {
    provider: config.provider,
    baseUrl: config.provider === 'cloud' ? config.baseUrl : null,
    model: config.model,
    hasKey: Boolean(config.apiKey)
  };
}

export function buildExtractionPrompt(message) {
  const safe = redactContact(message).slice(0, 1800);
  return [
    'You extract CRM lead fields from an enquiry message.',
    'Return JSON only with keys: name, business, intent, nextAction, tags.',
    'Never invent contact details. Keep each string under 100 characters.',
    '',
    'Message:',
    safe
  ].join('\n');
}

function parseJsonAnswer(text) {
  const cleaned = String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
  return JSON.parse(cleaned);
}

function friendlyHttpError(status) {
  if (status === 401 || status === 403) return 'The model provider rejected the key.';
  if (status === 404) return 'The model endpoint or model name was not found.';
  if (status === 429) return 'The model provider is rate limiting this key.';
  if (status >= 500) return 'The model provider is temporarily unavailable.';
  return 'The model provider rejected the request.';
}

export async function callCloudModel(config, prompt) {
  const validated = validateModelConfig(config);
  if (validated.provider !== 'cloud') {
    throw new Error('This helper only proxies cloud endpoints.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(validated.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + validated.apiKey
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: validated.model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: 'system', content: 'You are a careful CRM data extraction assistant. Output JSON only.' },
          { role: 'user', content: prompt }
        ]
      })
    });

    if (!response.ok) throw new Error(friendlyHttpError(response.status));

    const data = await response.json();
    const text = String(data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '');
    if (!text.trim()) throw new Error('The model returned an empty answer.');

    return { text, provider: 'cloud', model: validated.model, json: parseJsonAnswer(text) };
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('The model took too long to answer.');
    if (error instanceof SyntaxError) throw new Error('The model returned text instead of JSON.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
