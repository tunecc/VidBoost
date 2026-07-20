import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  shouldReconcileRate,
  clampReconcileCount,
  DEFAULT_RATE_EPSILON
} from '../stickyPolicy.ts';

describe('shouldReconcileRate', () => {
  it('true when drift exceeds epsilon', () => {
    assert.equal(shouldReconcileRate(1, 2, DEFAULT_RATE_EPSILON), true);
    assert.equal(shouldReconcileRate(2.0, 2.02, DEFAULT_RATE_EPSILON), false);
  });
});

describe('clampReconcileCount', () => {
  it('caps count', () => {
    assert.equal(clampReconcileCount(40, 30), 30);
    assert.equal(clampReconcileCount(5, 30), 5);
  });
});
