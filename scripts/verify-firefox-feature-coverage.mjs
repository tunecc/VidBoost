import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const chromeContentPath = path.join(repoRoot, 'src/content/index.ts');
const firefoxContentPath = path.join(repoRoot, 'src/content/index.firefox.ts');

const EXPECTED_DEFERRED_MAPPINGS = new Map([
    ['h5Enhancer', 'firefox-feature-h5-enhancer'],
    ['autoPauseFeature', 'firefox-feature-auto-pause'],
    ['bilibiliAutoSubtitle', 'firefox-feature-bilibili-auto-subtitle'],
    ['bilibiliFastPause', 'firefox-feature-bilibili-fast-pause'],
    ['bilibiliCdn', 'firefox-feature-bilibili-cdn'],
    ['statsSpeedConverter', 'firefox-feature-stats-speed-converter'],
    ['youtubeSeekBlocker', 'firefox-feature-youtube-seek-blocker'],
    ['youtubeFastPause', 'firefox-feature-youtube-fast-pause'],
    ['youtubeOriginalAudio', 'firefox-feature-youtube-original-audio'],
    ['youtubeCdnStatus', 'firefox-feature-youtube-cdn-status'],
    ['bilibiliSpaceBlocker', 'firefox-feature-bilibili-space-blocker'],
    ['youtubeMemberBlocker', 'firefox-feature-youtube-member-blocker']
]);

function fail(message) {
    throw new Error(message);
}

function assert(condition, message) {
    if (!condition) fail(message);
}

function extractConstArray(source, name) {
    const match = source.match(new RegExp(`const\\s+${name}\\s*=\\s*\\[(.*?)\\];`, 's'));
    if (!match) {
        fail(`未找到数组定义: ${name}`);
    }

    return match[1]
        .split('\n')
        .map((line) => line.trim())
        .map((line) => line.replace(/,$/, ''))
        .filter(Boolean);
}

function extractDeferredMappings(source) {
    const mappings = new Map();
    const pattern = /const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*createDeferredFeature(?:Controller)?\([\s\S]*?loadFirefoxFeatureModule\('([^']+)'\)/g;
    let match = pattern.exec(source);
    while (match) {
        const rawName = match[1];
        const featureName = rawName.endsWith('Controller')
            ? rawName.slice(0, -'Controller'.length)
            : rawName;
        mappings.set(featureName, match[2]);
        match = pattern.exec(source);
    }
    return mappings;
}

function extractFirefoxModuleMapKeys(source) {
    const match = source.match(/type\s+FirefoxFeatureModuleMap\s*=\s*{([\s\S]*?)^};/m);
    if (!match) {
        fail('未找到 FirefoxFeatureModuleMap');
    }

    return [...match[1].matchAll(/'([^']+)'\s*:/g)].map((item) => item[1]);
}

async function main() {
    const [chromeSource, firefoxSource] = await Promise.all([
        readFile(chromeContentPath, 'utf8'),
        readFile(firefoxContentPath, 'utf8')
    ]);

    const chromeFeatures = extractConstArray(chromeSource, 'features');
    const firefoxFeatures = extractConstArray(firefoxSource, 'features');

    assert(
        JSON.stringify(chromeFeatures) === JSON.stringify(firefoxFeatures),
        [
            'Chrome/Firefox features 数组不一致',
            `chrome: ${chromeFeatures.join(', ')}`,
            `firefox: ${firefoxFeatures.join(', ')}`
        ].join('\n')
    );

    const deferredMappings = extractDeferredMappings(firefoxSource);
    assert(
        deferredMappings.size === EXPECTED_DEFERRED_MAPPINGS.size,
        `Firefox 延迟加载模块数量异常: ${deferredMappings.size}`
    );

    for (const [featureName, assetName] of EXPECTED_DEFERRED_MAPPINGS) {
        assert(
            deferredMappings.get(featureName) === assetName,
            `Firefox 延迟模块映射不正确: ${featureName} -> ${deferredMappings.get(featureName) ?? 'missing'}`
        );
    }

    const moduleMapKeys = extractFirefoxModuleMapKeys(firefoxSource).sort();
    const expectedModuleKeys = [...EXPECTED_DEFERRED_MAPPINGS.values()].sort();
    assert(
        JSON.stringify(moduleMapKeys) === JSON.stringify(expectedModuleKeys),
        [
            'FirefoxFeatureModuleMap 与延迟加载资产不一致',
            `map: ${moduleMapKeys.join(', ')}`,
            `expected: ${expectedModuleKeys.join(', ')}`
        ].join('\n')
    );

    const directFeatureNames = firefoxFeatures.filter((featureName) => !EXPECTED_DEFERRED_MAPPINGS.has(featureName));
    assert(
        directFeatureNames.length === 0,
        `Firefox 仍存在未延迟加载的 feature: ${directFeatureNames.join(', ')}`
    );

    const summary = {
        chromeFeatures: chromeFeatures.length,
        firefoxFeatures: firefoxFeatures.length,
        deferredFeatures: deferredMappings.size,
        directFeatures: directFeatureNames.length
    };

    console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
    console.error(`[verify-firefox-feature-coverage] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
