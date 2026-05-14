import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const SECTION_ORDER = [
    ['feat', '新功能'],
    ['fix', '修复'],
    ['perf', '性能优化'],
    ['refactor', '重构'],
    ['docs', '文档'],
    ['build', '构建与发布'],
    ['ci', 'CI / 自动化'],
    ['chore', '维护'],
    ['test', '测试'],
    ['other', '其他变更']
];

function fail(message) {
    throw new Error(message);
}

function readFlag(flagName) {
    const args = process.argv.slice(2);
    const flagIndex = args.indexOf(flagName);
    if (flagIndex === -1) return '';
    return args[flagIndex + 1] ?? '';
}

function runGit(args) {
    return execFileSync('git', args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
}

function tryGit(args) {
    try {
        return runGit(args);
    } catch {
        return '';
    }
}

function normalizeTag(input) {
    const trimmed = String(input || '').trim();
    if (!trimmed) return '';
    return trimmed.startsWith('refs/tags/') ? trimmed.slice('refs/tags/'.length) : trimmed;
}

function normalizeVersionFromTag(tag) {
    return tag.startsWith('v') ? tag.slice(1) : tag;
}

function classifyCommit(subject) {
    const conventionalMatch = subject.match(/^([a-zA-Z]+)(\([^)]+\))?!?:\s*(.+)$/);
    if (conventionalMatch) {
        const type = conventionalMatch[1].toLowerCase();
        const normalizedType = SECTION_ORDER.some(([id]) => id === type) ? type : 'other';
        return {
            type: normalizedType,
            text: conventionalMatch[3].trim()
        };
    }

    if (/^修复/.test(subject)) {
        return { type: 'fix', text: subject };
    }
    if (/^(新增|优化|增强)/.test(subject)) {
        return { type: 'feat', text: subject };
    }
    return { type: 'other', text: subject };
}

function extractChangelogSection(changelog, currentTag) {
    if (!changelog.trim()) return '';

    const normalizedVersion = normalizeVersionFromTag(currentTag);
    const heading = `## [${normalizedVersion}]`;
    const startIndex = changelog.indexOf(heading);
    if (startIndex === -1) return '';

    const sectionStart = changelog.indexOf('\n', startIndex);
    if (sectionStart === -1) return '';

    const nextSectionIndex = changelog.indexOf('\n## [', sectionStart + 1);
    const rawSection = nextSectionIndex === -1
        ? changelog.slice(sectionStart + 1)
        : changelog.slice(sectionStart + 1, nextSectionIndex);
    return rawSection.trim();
}

function renderNotes({ currentTag, previousTag, repo, commits, changelogSection }) {
    const grouped = new Map(SECTION_ORDER.map(([id]) => [id, []]));
    for (const commit of commits) {
        const { type, text } = classifyCommit(commit.subject);
        grouped.get(type)?.push(`- ${text} (\`${commit.sha}\`)`);
    }

    const lines = [];
    lines.push(`## VidBoost ${normalizeVersionFromTag(currentTag)}`);
    lines.push('');

    if (previousTag) {
        lines.push(`基于 \`${previousTag}\` 到 \`${currentTag}\` 之间的提交自动整理。`);
    } else {
        lines.push(`首次发布，当前 tag 为 \`${currentTag}\`。`);
    }
    lines.push('');

    if (changelogSection.trim()) {
        lines.push(changelogSection.trim());
        lines.push('');
        lines.push('---');
        lines.push('');
        lines.push('## 自动整理的代码变更');
        lines.push('');
    }

    let renderedSection = false;
    for (const [sectionId, title] of SECTION_ORDER) {
        const items = grouped.get(sectionId) ?? [];
        if (items.length === 0) continue;
        renderedSection = true;
        lines.push(`### ${title}`);
        lines.push(...items);
        lines.push('');
    }

    if (!renderedSection) {
        lines.push('- 该版本没有检测到可归类的提交说明。');
        lines.push('');
    }

    if (repo && previousTag) {
        lines.push(`**Full Changelog**: https://github.com/${repo}/compare/${previousTag}...${currentTag}`);
        lines.push('');
    }

    return `${lines.join('\n').trimEnd()}\n`;
}

async function main() {
    const currentTag = normalizeTag(readFlag('--current-tag') || process.env.GITHUB_REF_NAME || '');
    const previousTagFlag = normalizeTag(readFlag('--previous-tag'));
    const repo = String(readFlag('--repo') || process.env.GITHUB_REPOSITORY || '').trim();
    const outputPath = String(readFlag('--output') || '').trim();
    const changelogPath = String(readFlag('--changelog') || 'CHANGELOG.md').trim();

    if (!currentTag) {
        fail('缺少当前 tag，请传入 --current-tag v1.6.2');
    }

    const previousTag = previousTagFlag || tryGit(['describe', '--tags', '--abbrev=0', `${currentTag}^`]);
    const range = previousTag ? `${previousTag}..${currentTag}` : currentTag;
    const commitLines = tryGit(['log', '--format=%H%x09%s', range])
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    const commits = commitLines.map((line) => {
        const [fullSha, ...subjectParts] = line.split('\t');
        return {
            sha: fullSha.slice(0, 7),
            subject: subjectParts.join('\t').trim()
        };
    }).filter((entry) => entry.subject);

    const changelogRaw = await readFile(path.resolve(repoRoot, changelogPath), 'utf8');
    const changelogSection = extractChangelogSection(changelogRaw, currentTag);
    const notes = renderNotes({
        currentTag,
        previousTag,
        repo,
        commits,
        changelogSection
    });

    if (outputPath) {
        await writeFile(path.resolve(repoRoot, outputPath), notes, 'utf8');
        console.log(`[generate-release-notes] Wrote ${path.relative(repoRoot, path.resolve(repoRoot, outputPath))}`);
        return;
    }

    process.stdout.write(notes);
}

main().catch((error) => {
    console.error(`[generate-release-notes] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
});
