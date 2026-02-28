#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const matrixPath = path.join(repoRoot, 'src/features/youtube/member-selector-matrix.json');
const snapshotPath = path.join(repoRoot, 'docs/regression/yt-member-selector.snapshot.txt');
const shouldUpdate = process.argv.includes('--update');

/**
 * @typedef {{
 *   id: string;
 *   all: string[];
 *   listModes?: string[];
 * }} Scene
 *
 * @typedef {{
 *   cardSelectors: string[];
 *   channelSelectors: string[];
 *   scenes: Scene[];
 * }} Matrix
 */

/**
 * @param {unknown} value
 * @returns {asserts value is Matrix}
 */
function assertMatrixShape(value) {
    if (!value || typeof value !== 'object') {
        throw new Error('matrix must be an object');
    }
    const matrix = /** @type {Record<string, unknown>} */ (value);
    if (!Array.isArray(matrix.cardSelectors) || !matrix.cardSelectors.every(item => typeof item === 'string')) {
        throw new Error('cardSelectors must be a string[]');
    }
    if (!Array.isArray(matrix.channelSelectors) || !matrix.channelSelectors.every(item => typeof item === 'string')) {
        throw new Error('channelSelectors must be a string[]');
    }
    if (!Array.isArray(matrix.scenes)) {
        throw new Error('scenes must be an array');
    }
    matrix.scenes.forEach((scene, index) => {
        if (!scene || typeof scene !== 'object') {
            throw new Error(`scene[${index}] must be an object`);
        }
        const record = /** @type {Record<string, unknown>} */ (scene);
        if (typeof record.id !== 'string' || record.id.length === 0) {
            throw new Error(`scene[${index}].id must be a non-empty string`);
        }
        if (!Array.isArray(record.all) || !record.all.every(item => typeof item === 'string')) {
            throw new Error(`scene[${index}].all must be a string[]`);
        }
        if (record.listModes !== undefined &&
            (!Array.isArray(record.listModes) || !record.listModes.every(item => typeof item === 'string'))) {
            throw new Error(`scene[${index}].listModes must be a string[] when provided`);
        }
    });
}

/**
 * @param {Scene[]} scenes
 * @param {'all'|'list'} mode
 */
function flattenSelectors(scenes, mode) {
    const out = [];
    for (const scene of scenes) {
        const selectors = mode === 'all' ? scene.all : (scene.listModes ?? scene.all);
        out.push(...selectors);
    }
    return [...new Set(out)];
}

/**
 * @param {Matrix} matrix
 */
function buildSnapshotText(matrix) {
    const allSelectors = flattenSelectors(matrix.scenes, 'all');
    const listSelectors = flattenSelectors(matrix.scenes, 'list');
    const sceneLines = matrix.scenes.map((scene) => {
        const listModeLength = (scene.listModes ?? scene.all).length;
        return `${scene.id} | all:${scene.all.length} | list:${listModeLength}`;
    });

    return [
        '# YouTube Member Selector Snapshot',
        '',
        `Scenes: ${matrix.scenes.length}`,
        `Card selectors: ${matrix.cardSelectors.length}`,
        `Channel selectors: ${matrix.channelSelectors.length}`,
        `All-mode selectors: ${allSelectors.length}`,
        `List-mode selectors: ${listSelectors.length}`,
        '',
        '## Scene Matrix',
        ...sceneLines,
        '',
        '## All Mode Selectors',
        ...allSelectors.map((sel, index) => `${index + 1}. ${sel}`),
        '',
        '## List Mode Selectors',
        ...listSelectors.map((sel, index) => `${index + 1}. ${sel}`),
        ''
    ].join('\n');
}

async function run() {
    const matrixJson = await readFile(matrixPath, 'utf8');
    const parsed = JSON.parse(matrixJson);
    assertMatrixShape(parsed);
    const matrix = /** @type {Matrix} */ (parsed);
    const nextSnapshot = buildSnapshotText(matrix);

    if (shouldUpdate) {
        await mkdir(path.dirname(snapshotPath), { recursive: true });
        await writeFile(snapshotPath, nextSnapshot, 'utf8');
        console.log(`updated ${path.relative(repoRoot, snapshotPath)}`);
        return;
    }

    let currentSnapshot = '';
    try {
        currentSnapshot = await readFile(snapshotPath, 'utf8');
    } catch {
        console.error(`snapshot missing: ${path.relative(repoRoot, snapshotPath)}`);
        console.error('run: node scripts/member-selector-snapshot.mjs --update');
        process.exitCode = 1;
        return;
    }

    if (currentSnapshot !== nextSnapshot) {
        console.error(`selector snapshot mismatch: ${path.relative(repoRoot, snapshotPath)}`);
        console.error('run: node scripts/member-selector-snapshot.mjs --update');
        process.exitCode = 1;
        return;
    }

    console.log('selector snapshot matched');
}

run().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
});
