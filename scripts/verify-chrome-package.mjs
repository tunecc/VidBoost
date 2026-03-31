import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const chromeDistDir = path.join(repoRoot, 'dist');
const manifestPath = path.join(chromeDistDir, 'manifest.json');

const REQUIRED_FILES = [
    'assets/background.js',
    'assets/content.js',
    'assets/bb-cdn.page.js',
    'assets/douyin-playback-rate.page.js',
    'assets/yt-cdn-status.page.js',
    'assets/yt-member-prefilter.page.js',
    'assets/yt-original-audio.page.js'
];

async function ensureFileExists(relativePath) {
    await access(path.join(chromeDistDir, relativePath));
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

function fail(message) {
    throw new Error(message);
}

function assert(condition, message) {
    if (!condition) fail(message);
}

async function main() {
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);

    assert(manifest.manifest_version === 3, 'Chrome manifest_version 必须保持 3');
    assert(
        manifest.background?.service_worker === 'assets/background.js',
        'Chrome background.service_worker 路径错误'
    );

    const contentScripts = Array.isArray(manifest.content_scripts) ? manifest.content_scripts : [];
    const mainContentEntry = contentScripts.find((entry) =>
        Array.isArray(entry?.js) && entry.js.includes('assets/content.js')
    );
    assert(mainContentEntry, 'Chrome content_scripts 缺少 assets/content.js');
    assert(
        !contentScripts.some((entry) => Array.isArray(entry?.js) && entry.js.includes('assets/content-firefox.js')),
        'Chrome manifest 不应引用 assets/content-firefox.js'
    );

    await Promise.all(REQUIRED_FILES.map((relativePath) => ensureFileExists(relativePath)));

    const allFiles = await collectFiles(chromeDistDir);
    const unexpectedFiles = allFiles.filter((relativePath) => {
        const normalized = relativePath.split(path.sep).join('/');
        return normalized === '.DS_Store'
            || normalized.endsWith('/.DS_Store')
            || normalized === 'assets/content-firefox.js'
            || normalized.startsWith('assets/firefox-feature-')
            || normalized.startsWith('assets/firefox-shared-');
    });

    assert(
        unexpectedFiles.length === 0,
        `Chrome 包仍包含 Firefox 或垃圾文件: ${unexpectedFiles.join(', ')}`
    );

    const summary = {
        manifestPath: path.relative(repoRoot, manifestPath),
        verifiedFiles: REQUIRED_FILES.length,
        unexpectedFiles: unexpectedFiles.length,
        contentScript: 'assets/content.js'
    };

    console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
    console.error(`[verify-chrome-package] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
