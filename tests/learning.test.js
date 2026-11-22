import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_WEIGHTS } from '../lib/extract.js';
import { adjustWeights } from '../lib/learning.js';

const signals = { budget: true, urgency: true, decision: false, need: true, timeline: false, email: true, phone: false, detail: true };

test('won outcomes strengthen active signals', () => {
  const next = adjustWeights(DEFAULT_WEIGHTS, signals, 'won', 0);
  assert.ok(next.budget > DEFAULT_WEIGHTS.budget);
  assert.ok(next.urgency > DEFAULT_WEIGHTS.urgency);
  assert.ok(next.decision < DEFAULT_WEIGHTS.decision);
});

test('lost outcomes weaken active signals', () => {
  const next = adjustWeights(DEFAULT_WEIGHTS, signals, 'lost', 0);
  assert.ok(next.budget < DEFAULT_WEIGHTS.budget);
  assert.ok(next.decision > DEFAULT_WEIGHTS.decision);
});

test('revenue gives an extra boost to budget and decision on a win', () => {
  const plain = adjustWeights(DEFAULT_WEIGHTS, signals, 'won', 0);
  const withRevenue = adjustWeights(DEFAULT_WEIGHTS, signals, 'won', 500000);
  assert.ok(withRevenue.budget > plain.budget);
  assert.ok(withRevenue.decision > plain.decision);
});

test('weights stay inside safe bounds', () => {
  const high = adjustWeights({ ...DEFAULT_WEIGHTS, budget: 30 }, { budget: true }, 'won', 100000000);
  const low = adjustWeights({ ...DEFAULT_WEIGHTS, budget: 4 }, { budget: true }, 'lost', 0);
  assert.equal(high.budget, 30);
  assert.equal(low.budget, 4);
});

test('unknown signal keys are ignored', () => {
  const next = adjustWeights(DEFAULT_WEIGHTS, { madeUpKey: true }, 'won', 0);
  assert.deepEqual(next, DEFAULT_WEIGHTS);
});
