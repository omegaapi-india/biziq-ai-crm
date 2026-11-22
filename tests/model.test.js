import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExtractionPrompt, publicModelConfig, validateModelConfig } from '../lib/model.js';

test('default local config uses a loopback URL and model name', () => {
  const config = validateModelConfig({});
  assert.equal(config.provider, 'local');
  assert.equal(config.baseUrl, 'http://127.0.0.1:8789');
  assert.equal(config.model, 'llama3.2');
});

test('local config rejects non-loopback hosts', () => {
  assert.throws(() => validateModelConfig({ provider: 'local', baseUrl: 'https://example.com' }), /127\.0\.0\.1/);
});

test('cloud config requires HTTPS', () => {
  assert.throws(() => validateModelConfig({
    provider: 'cloud', baseUrl: 'http://api.example.com/v1', apiKey: 'abcdefgh', model: 'test'
  }), /HTTPS/);
});

test('cloud config rejects private hosts', () => {
  assert.throws(() => validateModelConfig({
    provider: 'cloud', baseUrl: 'https://192.168.1.10/v1', apiKey: 'abcdefgh', model: 'test'
  }), /Private/);
});

test('cloud config rejects credentials embedded in the URL', () => {
  assert.throws(() => validateModelConfig({
    provider: 'cloud', baseUrl: 'https://user:pass@api.example.com/v1', apiKey: 'abcdefgh', model: 'test'
  }), /credentials/);
});

test('cloud config requires a reasonable key and model', () => {
  assert.throws(() => validateModelConfig({
    provider: 'cloud', baseUrl: 'https://api.example.com/v1', apiKey: 'short', model: 'test'
  }), /API key/);
  assert.throws(() => validateModelConfig({
    provider: 'cloud', baseUrl: 'https://api.example.com/v1', apiKey: 'abcdefgh', model: ''
  }), /model name/);
});

test('valid cloud config is accepted and normalized', () => {
  const config = validateModelConfig({
    provider: 'cloud', baseUrl: 'https://api.example.com/v1/', apiKey: 'abcdefgh123', model: 'demo-model'
  });
  assert.equal(config.baseUrl, 'https://api.example.com/v1');
  assert.equal(config.provider, 'cloud');
});

test('publicModelConfig never returns the key', () => {
  const config = validateModelConfig({
    provider: 'cloud', baseUrl: 'https://api.example.com/v1', apiKey: 'abcdefgh123', model: 'demo-model'
  });
  const safe = publicModelConfig(config);
  assert.equal(safe.hasKey, true);
  assert.equal(JSON.stringify(safe).includes('abcdefgh123'), false);
});

test('prompt is built from redacted message text', () => {
  const prompt = buildExtractionPrompt('Contact me at person@example.com or +91 98765 43210 about pricing.');
  assert.match(prompt, /\[email\]/);
  assert.match(prompt, /\[number\]/);
  assert.doesNotMatch(prompt, /person@example\.com/);
});
