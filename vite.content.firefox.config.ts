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
        lib: {
            entry: path.resolve(__dirname, 'src/content/index.firefox.ts'),
            name: 'VidBoostFirefoxContent',
            formats: ['iife'],
            fileName: () => 'assets/content-firefox.js'
        },
        rollupOptions: {
            output: {
                extend: true
            }
        }
    }
})
