import { describe, expect, it } from 'vitest';
import { resolveSubtitleButtonMountTarget } from '../mountTarget';

type FakeNode = {
    name: string;
    parentElement: FakeNode | null;
};

function node(name: string, parentElement: FakeNode | null = null): FakeNode {
    return { name, parentElement };
}

describe('resolveSubtitleButtonMountTarget', () => {
    it('mounts beside a nested settings button using its actual parent', () => {
        const controls = node('controls');
        const rightGroup = node('right-group', controls);
        const settings = node('settings', rightGroup);

        expect(resolveSubtitleButtonMountTarget(controls, settings)).toEqual({
            container: rightGroup,
            reference: settings
        });
    });

    it('falls back to the controls root when settings are unavailable', () => {
        const controls = node('controls');
        expect(resolveSubtitleButtonMountTarget(controls, null)).toEqual({
            container: controls,
            reference: null
        });
    });
});
