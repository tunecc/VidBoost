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
        outDir: 'dist',
        emptyOutDir: false,
        lib: {
            entry: path.resolve(__dirname, 'src/features/media-kernel/mediaKernel.page.ts'),
            name: 'VidBoostMediaKernelPage',
            formats: ['iife'],
            fileName: () => 'assets/media-kernel.page.js'
        },
        rollupOptions: {
            output: {
                extend: true
            }
        }
    }
})
