import { cp, mkdtemp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const firefoxDistDir = path.join(repoRoot, 'dist-firefox');
const manifestPath = path.join(repoRoot, 'dist-firefox', 'manifest.json');
const releaseDir = path.join(repoRoot, 'releases', 'firefox');

function slugify(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function runZip(args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn('zip', args, {
            cwd,
            stdio: 'inherit'
        });

        child.on('error', (error) => {
            reject(error);
        });
        child.on('close', (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`zip exited with code ${code}`));
        });
    });
}

async function main() {
    const manifestRaw = await readFile(manifestPath, 'utf8');
    const manifest = JSON.parse(manifestRaw);
    const name = typeof manifest.name === 'string' && manifest.name.trim()
        ? manifest.name
        : 'firefox-extension';
    const version = typeof manifest.version === 'string' && manifest.version.trim()
        ? manifest.version
        : '0.0.0';
    const fileName = `${slugify(name)}-firefox-${version}-source.zip`;
    const outputPath = path.join(releaseDir, fileName);

    const rootEntries = await readdir(repoRoot, { withFileTypes: true });
    const viteConfigs = rootEntries
        .filter((entry) => entry.isFile() && /^vite(\..+)?\.config\.ts$/.test(entry.name))
        .map((entry) => entry.name)
        .sort();

    const sourceEntries = [
        'src',
        'public',
        'scripts',
        'README.md',
        'AMO_SOURCE_README.md',
        'package.json',
        'package-lock.json',
        'tsconfig.json',
        'tsconfig.node.json',
        'svelte.config.js',
        'postcss.config.cjs',
        'tailwind.config.cjs',
        ...viteConfigs
    ];

    await mkdir(releaseDir, { recursive: true });
    await rm(outputPath, { force: true });
    const stagingRoot = await mkdtemp(path.join(os.tmpdir(), 'vidboost-firefox-source-'));

    try {
        // AMO 会在源码包根目录查找 manifest.json，因此先把 Firefox 构建产物平铺到根目录。
        const firefoxDistEntries = await readdir(firefoxDistDir);
        await Promise.all(
            firefoxDistEntries.map((entry) =>
                cp(path.join(firefoxDistDir, entry), path.join(stagingRoot, entry), {
                    recursive: true
                })
            )
        );

        await Promise.all(
            sourceEntries.map((entry) =>
                cp(path.join(repoRoot, entry), path.join(stagingRoot, entry), {
                    recursive: true
                })
            )
        );

        await runZip(
            ['-q', '-r', '-X', outputPath, '.', '-x', '*.DS_Store', '__MACOSX/*'],
            stagingRoot
        );
    } finally {
        await rm(stagingRoot, { recursive: true, force: true });
    }

    console.log(`[package-firefox-source] Wrote ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
    console.error(`[package-firefox-source] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
