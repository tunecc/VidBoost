# VidBoost Firefox Source Package

This archive is the human-readable source package for the Firefox build of VidBoost.

## Build environment

- Source package generated from the VidBoost repository
- Build system: Node.js + npm
- Lockfile included: `package-lock.json`

Mozilla reviewers use their own default build environment if you do not specify one. See:
https://extensionworkshop.com/documentation/publish/source-code-submission/

## Build commands

From the repository root:

```bash
npm ci
NODE_OPTIONS=--max-old-space-size=512 npm run build:firefox
npm run verify:firefox-package
npm run verify:firefox-coverage
```

## Expected output

- Firefox build output directory: `dist-firefox/`
- Main entry manifest: `dist-firefox/manifest.json`
- Main Firefox content script: `dist-firefox/assets/content-firefox.js`

## Notes

- This project uses Vite bundling, so a source package is provided for AMO review.
- The Firefox build injects:
  - `browser_specific_settings.gecko.id = vidboost@tunecc.dev`
  - `browser_specific_settings.gecko.strict_min_version = 121.0`
- The source package is intended for AMO review, not for direct installation.
