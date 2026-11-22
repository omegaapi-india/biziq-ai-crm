import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanText, clamp, extractLead, mergeRefinement, redactContact } from '../lib/extract.js';

const message = 'Hi, my name is Rohan Kumar from Netra Studio. We need pricing for 40 seats this week. My email is rohan@example.com and we have a budget of ₹2 lakh.';

test('cleanText collapses control characters and whitespace', () => {
  assert.equal(cleanText('  hello\x00\n world  '), 'hello world');
});

test('clamp keeps scores inside demo range', () => {
  assert.equal(clamp(4, 10, 98), 10);
  assert.equal(clamp(999, 10, 98), 98);
  assert.equal(clamp(55, 10, 98), 55);
});

test('redactContact removes email and phone-like numbers', () => {
  const redacted = redactContact('Mail rohan@example.com or call +91 98765 43210 now.');
  assert.match(redacted, /\[email\]/);
  assert.match(redacted, /\[number\]/);
  assert.doesNotMatch(redacted, /rohan@example\.com/);
});

test('extractLead finds name, business, intent and contact from a sample', () => {
  const lead = extractLead({ message });
  assert.equal(lead.name, 'Rohan Kumar');
  assert.equal(lead.business, 'Netra Studio');
  assert.equal(lead.intent, 'pricing');
  assert.equal(lead.email, 'rohan@example.com');
  assert.ok(lead.score >= 60);
  assert.ok(lead.tags.includes('budget'));
  assert.match(lead.message, /\[email\]/);
});

test('extractLead uses custom weights', () => {
  const base = extractLead({ message });
  const boosted = extractLead({
    message,
    weights: { budget: 30, urgency: 30, decision: 30, need: 30, timeline: 30, email: 30, phone: 30, detail: 30 }
  });
  assert.ok(boosted.score >= base.score);
});

test('extractLead rejects very short messages', () => {
  assert.throws(() => extractLead({ message: 'hi there' }), /at least a short enquiry/);
});

test('finds support and partnership intents', () => {
  assert.equal(extractLead({ message: 'Our billing page is broken and we need support from your team.' }).intent, 'support');
  assert.equal(extractLead({ message: 'We want to partner with your company on a reseller plan.' }).intent, 'partnership');
});

test('mergeRefinement accepts JSON from a model without destroying base fields', () => {
  const base = extractLead({ message });
  const merged = mergeRefinement(base, '{"name":"R. Kumar","intent":"demo","score":91,"tags":["vip"]}');
  assert.equal(merged.name, 'R. Kumar');
  assert.equal(merged.intent, 'demo');
  assert.equal(merged.score, 91);
  assert.ok(merged.tags.includes('vip'));
  assert.equal(merged.email, base.email);
});

test('mergeRefinement falls back to a short suggestion for plain text', () => {
  const base = extractLead({ message });
  const merged = mergeRefinement(base, 'Try a phone follow-up first.');
  assert.equal(merged.suggestion, 'Try a phone follow-up first.');
});
