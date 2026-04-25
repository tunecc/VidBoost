import { access, readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const firefoxDistDir = path.join(repoRoot, 'dist-firefox');
const manifestPath = path.join(firefoxDistDir, 'manifest.json');

const REQUIRED_FILES = [
    'assets/background.js',
    'assets/content-firefox.js',
    'assets/bb-cdn.page.js',
    'assets/douyin-playback-rate.page.js',
    'assets/firefox-feature-auto-pause.js',
    'assets/firefox-feature-bilibili-auto-subtitle.js',
    'assets/firefox-feature-bilibili-auto-quality.js',
    'assets/firefox-feature-bilibili-fast-pause.js',
    'assets/firefox-feature-bilibili-cdn.js',
    'assets/firefox-feature-bilibili-space-blocker.js',
    'assets/firefox-feature-h5-enhancer.js',
    'assets/firefox-feature-stats-speed-converter.js',
    'assets/firefox-feature-youtube-cdn-status.js',
    'assets/firefox-feature-youtube-fast-pause.js',
    'assets/firefox-feature-youtube-member-blocker.js',
    'assets/firefox-feature-youtube-original-audio.js',
    'assets/firefox-feature-youtube-subtitle-overlay.js',
    'assets/firefox-feature-youtube-seek-blocker.js',
    'assets/yt-cdn-status.page.js',
    'assets/yt-original-audio.page.js',
    'assets/yt-subtitle-overlay.page.js',
    'assets/yt-member-prefilter.page.js'
];

const REQUIRED_FIREFOX_MODULE_GLOB = 'assets/firefox-*.js';
const MAX_CONTENT_FIREFOX_BYTES = 20 * 1024;
const REQUIRED_DATA_COLLECTION = 'websiteContent';
const REQUIRED_DYNAMIC_MODULE_MATCHES = [
    '*://*/*',
    'http://127.0.0.1/*',
    'http://localhost/*'
];
const UNEXPECTED_FIREFOX_FILES = [
    'assets/content.js'
];
const REQUIRED_MAIN_WORLD_ENTRIES = [
    {
        scriptPath: 'assets/bb-cdn.page.js',
        matches: ['*://*.bilibili.com/*']
    },
    {
        scriptPath: 'assets/douyin-playback-rate.page.js',
        matches: ['*://*.douyin.com/*']
    },
    {
        scriptPath: 'assets/yt-member-prefilter.page.js',
        matches: [
            'http://127.0.0.1/*',
            'http://localhost/*',
            '*://youtu.be/*',
            '*://youtube.com/*',
            '*://*.youtube.com/*'
        ]
    },
    {
        scriptPath: 'assets/yt-original-audio.page.js',
        matches: [
            'http://127.0.0.1/*',
            'http://localhost/*',
            '*://youtu.be/*',
            '*://youtube.com/*',
            '*://*.youtube.com/*'
        ]
    },
    {
        scriptPath: 'assets/yt-subtitle-overlay.page.js',
        matches: [
            'http://127.0.0.1/*',
            'http://localhost/*',
            '*://youtu.be/*',
            '*://youtube.com/*',
            '*://*.youtube.com/*'
        ]
    },
    {
        scriptPath: 'assets/yt-cdn-status.page.js',
        matches: [
            'http://127.0.0.1/*',
            'http://localhost/*',
            '*://youtu.be/*',
            '*://youtube.com/*',
            '*://*.youtube.com/*'
        ]
    }
];

function fail(message) {
    throw new Error(message);
}

function assert(condition, message) {
    if (!condition) fail(message);
}

async function ensureFileExists(relativePath) {
    const filePath = path.join(firefoxDistDir, relativePath);
    await access(filePath);
    return filePath;
}

async function collectFiles(rootDir, prefix = '') {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async (entry) => {
        const relativePath = path.join(prefix, entry.name);
        const absolutePath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            return await collectFiles(absolutePath, relativePath);
        }
        return [relativePath];
    }));
    return files.flat();
}

function hasResource(resources, target) {
    return Array.isArray(resources) && resources.includes(target);
}

function hasAllMatches(entry, expectedMatches) {
    return Array.isArray(entry?.matches)
        && expectedMatches.every((match) => entry.matches.includes(match));
}

async function main() {
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);

    assert(manifest.manifest_version === 3, 'Firefox manifest_version 必须保持 3');
    assert(Array.isArray(manifest.background?.scripts), 'Firefox background.scripts 缺失');
    assert(manifest.background.scripts[0] === 'assets/background.js', 'Firefox background 脚本路径错误');

    const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
    const mainContentEntry = contentScripts.find((entry) =>
        Array.isArray(entry?.js) && entry.js.includes('assets/content-firefox.js')
    );
    assert(mainContentEntry, 'Firefox content_scripts 未切换到 assets/content-firefox.js');
    assert(
        !contentScripts.some((entry) => Array.isArray(entry?.js) && entry.js.includes('assets/content.js')),
        'Firefox manifest 仍残留 Chrome content.js'
    );

    const gecko = manifest.browser_specific_settings?.gecko;
    assert(typeof gecko?.id === 'string' && gecko.id.length > 0, 'Firefox gecko.id 缺失');
    assert(typeof gecko?.strict_min_version === 'string' && gecko.strict_min_version.length > 0, 'Firefox strict_min_version 缺失');
    const dataCollection = gecko?.data_collection_permissions;
    assert(dataCollection && typeof dataCollection === 'object', 'Firefox data_collection_permissions 缺失');
    assert(
        Array.isArray(dataCollection.required) && dataCollection.required.includes(REQUIRED_DATA_COLLECTION),
        `Firefox data_collection_permissions.required 缺少 ${REQUIRED_DATA_COLLECTION}`
    );
    assert(
        !Array.isArray(dataCollection.required) || !dataCollection.required.includes('none'),
        'Firefox data_collection_permissions.required 不能同时声明 none'
    );
    assert(
        dataCollection.optional === undefined || Array.isArray(dataCollection.optional),
        'Firefox data_collection_permissions.optional 必须是数组'
    );

    const resources = Array.isArray(manifest.web_accessible_resources)
        ? manifest.web_accessible_resources
        : [];
    const dynamicModuleEntry = resources.find((entry) => hasResource(entry?.resources, REQUIRED_FIREFOX_MODULE_GLOB));
    assert(dynamicModuleEntry, 'Firefox 动态模块资源未加入 web_accessible_resources');
    assert(
        hasAllMatches(dynamicModuleEntry, REQUIRED_DYNAMIC_MODULE_MATCHES),
        'Firefox 动态模块资源匹配范围不完整'
    );

    const mainWorldResourceScripts = REQUIRED_MAIN_WORLD_ENTRIES
        .map((entry) => entry.scriptPath)
        .filter((scriptPath) => scriptPath.startsWith('assets/yt-'));
    const mainWorldResourceEntry = resources.find((entry) =>
        mainWorldResourceScripts.every((scriptPath) => hasResource(entry?.resources, scriptPath))
    );
    assert(mainWorldResourceEntry, 'Firefox MAIN world page scripts 未加入 web_accessible_resources');
    assert(
        hasAllMatches(mainWorldResourceEntry, REQUIRED_MAIN_WORLD_ENTRIES[2].matches),
        'Firefox MAIN world page script 资源匹配范围不完整'
    );

    await Promise.all(REQUIRED_FILES.map((relativePath) => ensureFileExists(relativePath)));

    const allFiles = await collectFiles(firefoxDistDir);
    const unexpectedFiles = allFiles.filter((relativePath) => {
        const normalized = relativePath.split(path.sep).join('/');
        return normalized === '.DS_Store'
            || normalized.endsWith('/.DS_Store')
            || UNEXPECTED_FIREFOX_FILES.includes(normalized);
    });
    assert(
        unexpectedFiles.length === 0,
        `Firefox 包仍包含无用文件: ${unexpectedFiles.join(', ')}`
    );

    const firefoxContentStats = await stat(path.join(firefoxDistDir, 'assets/content-firefox.js'));
    assert(
        firefoxContentStats.size <= MAX_CONTENT_FIREFOX_BYTES,
        `content-firefox.js 过大：${firefoxContentStats.size} bytes`
    );

    for (const { scriptPath, matches } of REQUIRED_MAIN_WORLD_ENTRIES) {
        const entry = contentScripts.find((item) =>
            Array.isArray(item?.js) && item.js.includes(scriptPath)
        );
        assert(entry, `Firefox 缺少 MAIN world script: ${scriptPath}`);
        assert(entry.world === 'MAIN', `Firefox MAIN world script 未声明 world=MAIN: ${scriptPath}`);
        assert(
            entry.run_at === 'document_start',
            `Firefox MAIN world script 未声明 run_at=document_start: ${scriptPath}`
        );
        assert(
            hasAllMatches(entry, matches),
            `Firefox MAIN world script 匹配范围不完整: ${scriptPath}`
        );
    }

    const summary = {
        manifestPath: path.relative(repoRoot, manifestPath),
        firefoxContentBytes: firefoxContentStats.size,
        verifiedFiles: REQUIRED_FILES.length,
        unexpectedFiles: unexpectedFiles.length,
        dynamicModuleResource: REQUIRED_FIREFOX_MODULE_GLOB,
        mainWorldScripts: REQUIRED_MAIN_WORLD_ENTRIES.length,
        dataCollectionRequired: dataCollection.required,
        geckoId: gecko.id,
        strictMinVersion: gecko.strict_min_version
    };

    console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
    console.error(`[verify-firefox-package] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
