import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const firefoxDistDir = path.join(repoRoot, 'dist-firefox');
const manifestPath = path.join(firefoxDistDir, 'manifest.json');
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
    const fileName = `${slugify(name)}-firefox-${version}-unsigned.xpi`;
    const outputPath = path.join(releaseDir, fileName);

    await mkdir(releaseDir, { recursive: true });
    await rm(outputPath, { force: true });

    await runZip(
        ['-q', '-r', '-X', outputPath, '.', '-x', '*.DS_Store', '__MACOSX/*'],
        firefoxDistDir
    );

    console.log(`[package-firefox-xpi] Wrote ${path.relative(repoRoot, outputPath)}`);
}

main().catch((error) => {
    console.error(`[package-firefox-xpi] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
