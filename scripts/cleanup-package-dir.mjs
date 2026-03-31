import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const targetArg = process.argv[2];

if (!targetArg) {
    console.error('[cleanup-package-dir] Missing target directory');
    process.exit(1);
}

const targetDir = path.resolve(process.cwd(), targetArg);

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

await removeFilesNamed(targetDir, '.DS_Store');
console.log(`[cleanup-package-dir] Cleaned ${targetArg}`);
