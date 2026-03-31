import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const chromeDistDir = path.join(repoRoot, 'dist');
const firefoxDistDir = path.join(repoRoot, 'dist-firefox');
const manifestPath = path.join(firefoxDistDir, 'manifest.json');
const mode = process.argv[2] || 'full';

const FIREFOX_EXTENSION_ID = 'vidboost@tunecc.dev';
const FIREFOX_MIN_VERSION = '121.0';
const FIREFOX_REQUIRED_DATA_COLLECTION = ['websiteContent'];
const CHROME_CONTENT_SCRIPT_PATH = 'assets/content.js';
const FIREFOX_CONTENT_SCRIPT_PATH = 'assets/content-firefox.js';
const FIREFOX_DYNAMIC_MODULE_MATCHES = [
    '*://*/*',
    'http://127.0.0.1/*',
    'http://localhost/*'
];
const FIREFOX_YOUTUBE_MAIN_WORLD_MATCHES = [
    'http://127.0.0.1/*',
    'http://localhost/*',
    '*://youtu.be/*',
    '*://youtube.com/*',
    '*://*.youtube.com/*'
];
const FIREFOX_YOUTUBE_MAIN_WORLD_SCRIPTS = [
    'assets/yt-member-prefilter.page.js',
    'assets/yt-original-audio.page.js',
    'assets/yt-cdn-status.page.js'
];
const FIREFOX_UNEXPECTED_FILES = [
    'assets/content.js'
];

async function removeFilesNamed(rootDir, fileName) {
    const entries = await readdir(rootDir, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            await removeFilesNamed(entryPath, fileName);
            return;
        }
        if (entry.isFile() && entry.name === fileName) {
            await rm(entryPath, { force: true });
        }
    }));
}

async function pruneFirefoxPackageArtifacts() {
    await Promise.all(FIREFOX_UNEXPECTED_FILES.map((relativePath) =>
        rm(path.join(firefoxDistDir, relativePath), { force: true })
    ));
    await removeFilesNamed(firefoxDistDir, '.DS_Store');
}

function hasMainWorldContentScript(contentScripts, scriptPath) {
    return contentScripts.some((entry) => Array.isArray(entry?.js)
        && entry.js.includes(scriptPath)
        && entry.world === 'MAIN');
}

function remapFirefoxContentScript(contentScripts) {
    return contentScripts.map((entry) => {
        if (!Array.isArray(entry?.js) || !entry.js.includes(CHROME_CONTENT_SCRIPT_PATH)) {
            return entry;
        }

        return {
            ...entry,
            js: entry.js.map((scriptPath) => (
                scriptPath === CHROME_CONTENT_SCRIPT_PATH
                    ? FIREFOX_CONTENT_SCRIPT_PATH
                    : scriptPath
            ))
        };
    });
}

function appendFirefoxDynamicModuleResources(webAccessibleResources) {
    const existingEntries = Array.isArray(webAccessibleResources)
        ? [...webAccessibleResources]
        : [];

    const alreadyListed = existingEntries.some((entry) => Array.isArray(entry?.resources)
        && entry.resources.includes('assets/firefox-*.js'));
    if (alreadyListed) {
        return existingEntries;
    }

    existingEntries.push({
        resources: ['assets/firefox-*.js'],
        matches: [...FIREFOX_DYNAMIC_MODULE_MATCHES]
    });
    return existingEntries;
}

function toFirefoxManifest(manifest) {
    const serviceWorkerPath = manifest?.background?.service_worker;
    if (typeof serviceWorkerPath !== 'string' || !serviceWorkerPath.trim()) {
        throw new Error('dist/manifest.json 缺少 background.service_worker，无法生成 Firefox manifest');
    }

    const contentScripts = Array.isArray(manifest.content_scripts)
        ? remapFirefoxContentScript([...manifest.content_scripts])
        : [];

    for (const scriptPath of FIREFOX_YOUTUBE_MAIN_WORLD_SCRIPTS) {
        if (hasMainWorldContentScript(contentScripts, scriptPath)) continue;
        contentScripts.push({
            matches: [...FIREFOX_YOUTUBE_MAIN_WORLD_MATCHES],
            js: [scriptPath],
            run_at: 'document_start',
            world: 'MAIN'
        });
    }

    return {
        ...manifest,
        background: {
            scripts: [serviceWorkerPath],
            type: manifest?.background?.type === 'module' ? 'module' : 'module'
        },
        content_scripts: contentScripts,
        web_accessible_resources: appendFirefoxDynamicModuleResources(
            manifest.web_accessible_resources
        ),
        browser_specific_settings: {
            ...(manifest.browser_specific_settings ?? {}),
            gecko: {
                ...(manifest.browser_specific_settings?.gecko ?? {}),
                id: manifest.browser_specific_settings?.gecko?.id || FIREFOX_EXTENSION_ID,
                strict_min_version:
                    manifest.browser_specific_settings?.gecko?.strict_min_version
                    || FIREFOX_MIN_VERSION,
                data_collection_permissions: {
                    required: Array.isArray(
                        manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required
                    ) && manifest.browser_specific_settings.gecko.data_collection_permissions.required.length > 0
                        ? [
                            ...manifest.browser_specific_settings.gecko.data_collection_permissions.required
                        ]
                        : [...FIREFOX_REQUIRED_DATA_COLLECTION],
                    optional: Array.isArray(
                        manifest.browser_specific_settings?.gecko?.data_collection_permissions?.optional
                    )
                        ? [...manifest.browser_specific_settings.gecko.data_collection_permissions.optional]
                        : []
                }
            }
        }
    };
}

async function main() {
    if (mode === 'prepare' || mode === 'full') {
        await rm(firefoxDistDir, { recursive: true, force: true });
        await mkdir(firefoxDistDir, { recursive: true });
        await cp(chromeDistDir, firefoxDistDir, { recursive: true });

        console.log(`[firefox-build] Prepared ${path.relative(repoRoot, firefoxDistDir)} from dist/`);
    }

    if (mode === 'finalize' || mode === 'full') {
        const rawManifest = await readFile(manifestPath, 'utf8');
        const manifest = JSON.parse(rawManifest);
        const firefoxManifest = toFirefoxManifest(manifest);

        await writeFile(
            manifestPath,
            `${JSON.stringify(firefoxManifest, null, 2)}\n`,
            'utf8'
        );
        await pruneFirefoxPackageArtifacts();

        console.log(`[firefox-build] Wrote Firefox manifest to ${path.relative(repoRoot, manifestPath)}`);
        console.log(`[firefox-build] Output directory: ${path.relative(repoRoot, firefoxDistDir)}`);
    }
}

main().catch((error) => {
    console.error('[firefox-build] Failed:', error);
    process.exitCode = 1;
});
