# Repository Guidelines

## Project Structure & Module Organization
`src/popup` contains the Svelte settings UI, `src/background` holds the MV3 service worker, and `src/content` contains browser content-script entry points, including Firefox variants. Put site-specific behavior under `src/features` (`youtube`, `bilibili`, `douyin`) and shared helpers under `src/lib`. Reusable UI lives in `src/components`. Static extension assets are in `public/`, screenshots and store images are in `assets/`, and packaging or verification helpers are in `scripts/`. Treat `dist/` as generated output.

## Build, Test, and Development Commands
`npm install` installs dependencies. `npm run dev` starts the Vite dev server for popup work. `npm run build` or `npm run build:chrome` creates the Chrome/Edge bundle in `dist/`. `npm run build:firefox` rebuilds with Firefox-specific content modules. `npm run check` runs `svelte-check` against the TypeScript and Svelte codebase. Use `npm run validate:chrome-package` and `npm run validate:firefox-low-memory` before release-oriented changes. For YouTube member-filter selector work, use `npm run check:yt-member-selectors` or `npm run update:yt-member-selectors`.

## Coding Style & Naming Conventions
Use TypeScript, Svelte 4, and the existing `@/` alias. Follow surrounding formatting instead of reflowing unrelated files: Svelte components commonly use 2-space indentation, while some TypeScript utility files use 4 spaces. Name Svelte components in PascalCase, shared modules in camelCase, and keep explicit suffixes such as `*.page.ts`, `*.shared.ts`, and `*.firefox.ts` when a file targets a specific runtime.

## Testing Guidelines
This repository currently relies on static checks and package verification instead of a standalone unit-test suite. Run `npm run check` for every change, then run the platform validator that matches your scope. If you touch cross-browser behavior, validate both Chrome and Firefox builds. For selector-driven logic, review snapshot output and include manual verification notes for the affected site and page type.

## Commit & Pull Request Guidelines
Recent history follows Conventional Commit prefixes with concise Chinese summaries, for example `fix: 修复 YouTube 屏蔽会员视频失效` and `feat: 优化字幕样式面板`. Keep each commit focused on one change. Pull requests should explain the user-visible result, list affected browsers or sites, link related issues, and attach screenshots or recordings for popup or overlay UI changes. Highlight any manifest, permission, or packaging changes explicitly.

## Security & Configuration Tips
Do not commit secrets, local browser data, or generated release artifacts. Review `public/manifest.json` carefully when changing permissions or host access. Prefer the checked-in scripts under `scripts/` over ad hoc packaging commands so Chrome and Firefox release steps stay reproducible.
