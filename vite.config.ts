import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [svelte()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                popup: path.resolve(__dirname, 'popup.html'),
                // We will define content scripts as separate entry points if needed, 
                // but typically content scripts are single JS files. 
                // For Vite to bundle them efficiently as library targets or using specific input configuration:
                content: path.resolve(__dirname, 'src/content/index.ts'),
                background: path.resolve(__dirname, 'src/background/index.ts')
            },
            output: {
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]'
            },
            // Keep content script as a single file to avoid "import" in content.js
            manualChunks: (id) => {
                if (id.includes('src/content') || id.includes('settings-content')) {
                    return 'content';
                }
                return undefined;
            }
        }
    }
})
