import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function fail(message) {
    throw new Error(message);
}

function normalizeVersion(input) {
    const trimmed = String(input || '').trim();
    const normalized = trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
    if (!/^\d+(?:\.\d+){0,3}$/.test(normalized)) {
        fail(
            `目标版本 ${trimmed} 不符合浏览器扩展版本格式；请使用 1 到 4 段纯数字，例如 1.6.3`
        );
    }
    return normalized;
}

async function readJson(relativePath) {
    const absolutePath = path.join(repoRoot, relativePath);
    const raw = await readFile(absolutePath, 'utf8');
    return JSON.parse(raw);
}

async function writeJson(relativePath, data) {
    const absolutePath = path.join(repoRoot, relativePath);
    await writeFile(absolutePath, `${JSON.stringify(data, null, 4)}\n`, 'utf8');
}

async function main() {
    const nextVersion = normalizeVersion(process.argv[2]);
    if (!nextVersion) {
        fail('缺少目标版本号，例如：npm run version:set -- 1.6.3');
    }

    const packageJson = await readJson('package.json');
    const packageLock = await readJson('package-lock.json');
    const manifest = await readJson('public/manifest.json');

    packageJson.version = nextVersion;
    packageLock.version = nextVersion;
    if (packageLock.packages?.['']) {
        packageLock.packages[''].version = nextVersion;
    }
    manifest.version = nextVersion;

    await Promise.all([
        writeJson('package.json', packageJson),
        writeJson('package-lock.json', packageLock),
        writeJson('public/manifest.json', manifest)
    ]);

    console.log(JSON.stringify({
        version: nextVersion,
        updated: [
            'package.json',
            'package-lock.json',
            'public/manifest.json'
        ],
        nextTag: `v${nextVersion}`
    }, null, 2));
}

main().catch((error) => {
    console.error(`[set-version] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
