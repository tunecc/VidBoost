import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    plugins: [
        svelte({
            compilerOptions: {
                css: 'injected'
            }
        })
    ],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
            entry: path.resolve(__dirname, 'src/features/youtube/subtitleOverlay.page.ts'),
            name: 'VidBoostYtSubtitleOverlayPage',
            formats: ['iife'],
            fileName: () => 'assets/yt-subtitle-overlay.page.js'
        },
        rollupOptions: {
            output: {
                extend: true,
                inlineDynamicImports: true
            }
        }
    }
})
