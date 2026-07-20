import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeH5CompatMode,
  isMediaKernelEnvelope,
  MEDIA_KERNEL_CHANNEL,
  MEDIA_KERNEL_PAGE_SOURCE,
  MEDIA_KERNEL_PROTOCOL_VERSION
} from '../protocol.ts';

describe('normalizeH5CompatMode', () => {
  it('accepts safe/compat/strict', () => {
    assert.equal(normalizeH5CompatMode('safe'), 'safe');
    assert.equal(normalizeH5CompatMode('compat'), 'compat');
    assert.equal(normalizeH5CompatMode('strict'), 'strict');
  });

  it('falls back to compat for unknown', () => {
    assert.equal(normalizeH5CompatMode(undefined), 'compat');
    assert.equal(normalizeH5CompatMode('nope'), 'compat');
    assert.equal(normalizeH5CompatMode(1, 'safe'), 'safe');
  });
});

describe('isMediaKernelEnvelope', () => {
  it('rejects wrong source/channel/version', () => {
    assert.equal(
      isMediaKernelEnvelope(
        {
          source: MEDIA_KERNEL_PAGE_SOURCE,
          channel: MEDIA_KERNEL_CHANNEL,
          version: MEDIA_KERNEL_PROTOCOL_VERSION,
          type: 'pong'
        },
        MEDIA_KERNEL_PAGE_SOURCE
      ),
      true
    );
    assert.equal(
      isMediaKernelEnvelope(
        {
          source: 'other',
          channel: MEDIA_KERNEL_CHANNEL,
          version: MEDIA_KERNEL_PROTOCOL_VERSION,
          type: 'pong'
        },
        MEDIA_KERNEL_PAGE_SOURCE
      ),
      false
    );
  });
});
