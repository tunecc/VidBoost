import rawMatrix from './member-selector-matrix.json';
import type { YTMemberBlockMode } from '../../lib/settings';

type MatrixScene = {
    id: string;
    all: string[];
    listModes?: string[];
};

type MemberSelectorMatrix = {
    cardSelectors: string[];
    channelSelectors: string[];
    scenes: MatrixScene[];
};

const matrix = rawMatrix as MemberSelectorMatrix;

export const MEMBER_CARD_SELECTORS = Object.freeze([...matrix.cardSelectors]);
export const MEMBER_CHANNEL_SELECTORS = Object.freeze([...matrix.channelSelectors]);
export const MEMBER_SCENE_MATRIX = Object.freeze(
    matrix.scenes.map(scene => Object.freeze({
        id: scene.id,
        all: Object.freeze([...scene.all]),
        listModes: Object.freeze([...(scene.listModes ?? scene.all)])
    }))
);

export const MEMBER_BADGE_ARIA_LABELS = Object.freeze(['members only', 'members first']);
export const MEMBER_BADGE_CLASS_NAMES = Object.freeze([
    'yt-badge-shape--membership',
    'badge-style-type-members-only',
    'badge-style-type-membership'
]);
export const MEMBER_COMMERCE_BADGE_CLASS_NAMES = Object.freeze([
    'yt-badge-shape--commerce',
    'ytBadgeShapeCommerce'
]);
export const MEMBER_COMMERCE_ICON_SELECTORS = Object.freeze([
    '.yt-badge-shape__icon',
    '.ytBadgeShapeIcon'
]);
export const MEMBER_MOBILE_BADGE_DATA_TYPE = 'BADGE_STYLE_TYPE_MEMBERS_ONLY';

function dedupeSelectors(selectors: string[]): string[] {
    return Array.from(new Set(selectors));
}

export function getFastMembershipSelectorsForMode(mode: YTMemberBlockMode): string[] {
    const selectors = MEMBER_SCENE_MATRIX.flatMap((scene) => (
        mode === 'all' ? scene.all : scene.listModes
    ));
    return dedupeSelectors(selectors);
}
