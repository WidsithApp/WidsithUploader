import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte()],
	clearScreen: false,
	server: { port: 1420, strictPort: true },
	build: { target: 'chrome120', outDir: 'dist', emptyOutDir: true },
	test: {
		include: ['tests/**/*.test.ts'],
		environment: 'node',
		testTimeout: 60000
	}
});
