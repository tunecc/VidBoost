import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const matrixPath = path.join(repoRoot, 'src/features/youtube/member-selector-matrix.json');
const selectorSourcePath = path.join(repoRoot, 'src/features/youtube/memberSelectorMatrix.ts');
const prefilterSourcePath = path.join(repoRoot, 'src/features/youtube/memberNetworkPrefilter.page.ts');

const matrix = JSON.parse(readFileSync(matrixPath, 'utf8'));
const selectorSource = readFileSync(selectorSourcePath, 'utf8');
const prefilterSource = readFileSync(prefilterSourcePath, 'utf8');

const CURRENT_COMMERCE_SELECTOR = '.ytBadgeShapeCommerce > .ytBadgeShapeIcon';

/**
 * @param {string} sceneId
 * @returns {string[]}
 */
function selectorsForScene(sceneId) {
    const scene = matrix.scenes.find((entry) => entry.id === sceneId);
    assert(scene, `missing selector scene: ${sceneId}`);
    return [...scene.all, ...(scene.listModes ?? [])];
}

for (const sceneId of [
    'desktop-rich-feed',
    'desktop-search-list',
    'desktop-related',
    'desktop-channel-grid'
]) {
    assert(
        selectorsForScene(sceneId).some((selector) => selector.includes(CURRENT_COMMERCE_SELECTOR)),
        `scene ${sceneId} is missing current membership badge selector ${CURRENT_COMMERCE_SELECTOR}`
    );
}

for (const requiredToken of ['ytBadgeShapeCommerce', 'ytBadgeShapeIcon']) {
    assert(
        selectorSource.includes(requiredToken),
        `memberSelectorMatrix.ts is missing current badge token: ${requiredToken}`
    );
    assert(
        prefilterSource.includes(requiredToken),
        `memberNetworkPrefilter.page.ts is missing current badge token: ${requiredToken}`
    );
}

console.log('current YouTube member badge coverage verified');
