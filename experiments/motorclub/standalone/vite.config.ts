import { defineConfig } from 'vite';

// Dependencies and generated caches are isolated from the active factory.
export default defineConfig({ cacheDir: '.vite-cache' });
