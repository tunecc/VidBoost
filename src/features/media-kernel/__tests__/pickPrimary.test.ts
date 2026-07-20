import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pickPrimaryVideo, type PrimaryVideoCandidate } from '../pickPrimary.ts';

function v(partial: Partial<PrimaryVideoCandidate> & { id: string }): PrimaryVideoCandidate {
  return {
    width: 640,
    height: 360,
    paused: true,
    ended: false,
    visible: true,
    focusedBoost: 0,
    ...partial
  };
}

describe('pickPrimaryVideo', () => {
  it('returns null for empty list', () => {
    assert.equal(pickPrimaryVideo([]), null);
  });

  it('prefers playing visible larger video', () => {
    const smallPlaying = v({ id: 'a', width: 160, height: 90, paused: false });
    const largePaused = v({ id: 'b', width: 1280, height: 720, paused: true });
    const largePlaying = v({ id: 'c', width: 1280, height: 720, paused: false });
    assert.equal(pickPrimaryVideo([smallPlaying, largePaused, largePlaying])?.id, 'c');
  });

  it('ignores invisible candidates when any visible exists', () => {
    const hidden = v({ id: 'h', width: 1920, height: 1080, visible: false, paused: false });
    const visible = v({ id: 'v', width: 640, height: 360, visible: true, paused: false });
    assert.equal(pickPrimaryVideo([hidden, visible])?.id, 'v');
  });
});
