import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function fail(message) {
    throw new Error(message);
}

function normalizeExpectedTag(input) {
    if (!input) return '';
    const trimmed = String(input).trim();
    if (!trimmed) return '';
    const refPrefix = 'refs/tags/';
    const tag = trimmed.startsWith(refPrefix) ? trimmed.slice(refPrefix.length) : trimmed;
    return tag.startsWith('v') ? tag.slice(1) : tag;
}

async function readJson(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const raw = await readFile(absolutePath, 'utf8');
    return JSON.parse(raw);
}

function readFlag(flagName) {
    const args = process.argv.slice(2);
    const flagIndex = args.indexOf(flagName);
    if (flagIndex === -1) return '';
    return args[flagIndex + 1] ?? '';
}

function assertExtensionVersionFormat(version) {
    if (!/^\d+(?:\.\d+){0,3}$/.test(version)) {
        fail(
            `版本号 ${version} 不符合浏览器扩展版本格式；当前流程要求 1 到 4 段纯数字，例如 1.6.2 或 1.6.2.0`
        );
    }
}

async function main() {
    const expectedTag = readFlag('--expected-tag') || process.env.GITHUB_REF_NAME || '';
    const expectedVersion = normalizeExpectedTag(expectedTag);

    const packageJson = await readJson('package.json');
    const packageLock = await readJson('package-lock.json');
    const manifest = await readJson('public/manifest.json');

    const versions = {
        packageJson: String(packageJson.version || '').trim(),
        packageLock: String(packageLock.version || '').trim(),
        packageLockRoot: String(packageLock.packages?.['']?.version || '').trim(),
        manifest: String(manifest.version || '').trim()
    };

    const uniqueVersions = [...new Set(Object.values(versions))];
    if (uniqueVersions.some((value) => !value)) {
        fail(`版本字段不完整：${JSON.stringify(versions)}`);
    }
    if (uniqueVersions.length !== 1) {
        fail(`版本不一致：${JSON.stringify(versions)}`);
    }

    const version = uniqueVersions[0];
    assertExtensionVersionFormat(version);

    if (expectedVersion && expectedVersion !== version) {
        fail(
            `tag 版本与仓库版本不一致：tag=${expectedTag} -> ${expectedVersion}，仓库=${version}`
        );
    }

    console.log(JSON.stringify({
        version,
        expectedTag: expectedTag || null,
        files: versions
    }, null, 2));
}

main().catch((error) => {
    console.error(`[verify-version-consistency] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
