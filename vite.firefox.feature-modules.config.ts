import { defineConfig } from 'vite'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'dist-firefox',
        emptyOutDir: false,
        target: 'es2022',
        lib: {
            entry: {
                'firefox-feature-auto-pause': path.resolve(__dirname, 'src/features/AutoPause.ts'),
                'firefox-feature-bilibili-auto-subtitle': path.resolve(__dirname, 'src/features/BilibiliAutoSubtitle.ts'),
                'firefox-feature-bilibili-auto-quality': path.resolve(__dirname, 'src/features/BilibiliAutoQuality.ts'),
                'firefox-feature-bilibili-cdn': path.resolve(__dirname, 'src/features/BilibiliCDN.ts'),
                'firefox-feature-h5-enhancer': path.resolve(__dirname, 'src/features/H5Enhancer.ts'),
                'firefox-feature-bilibili-fast-pause': path.resolve(__dirname, 'src/features/BilibiliFastPause.ts'),
                'firefox-feature-stats-speed-converter': path.resolve(__dirname, 'src/features/StatsSpeedConverter.ts'),
                'firefox-feature-youtube-seek-blocker': path.resolve(__dirname, 'src/features/YouTubeSeekBlocker.ts'),
                'firefox-feature-youtube-fast-pause': path.resolve(__dirname, 'src/features/YouTubeFastPause.ts'),
                'firefox-feature-youtube-original-audio': path.resolve(__dirname, 'src/features/YouTubeOriginalAudio.ts'),
                'firefox-feature-youtube-subtitle-overlay': path.resolve(__dirname, 'src/features/YouTubeSubtitleOverlay.ts'),
                'firefox-feature-youtube-cdn-status': path.resolve(__dirname, 'src/features/YouTubeCdnStatus.ts'),
                'firefox-feature-bilibili-space-blocker': path.resolve(__dirname, 'src/features/BilibiliSpaceBlocker.ts'),
                'firefox-feature-youtube-member-blocker': path.resolve(__dirname, 'src/features/YouTubeMemberBlocker.ts')
            },
            formats: ['es'],
            fileName: (_format, entryName) => `assets/${entryName}.js`
        },
        rollupOptions: {
            output: {
                chunkFileNames: 'assets/firefox-shared-[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash][extname]'
            }
        }
    }
})
