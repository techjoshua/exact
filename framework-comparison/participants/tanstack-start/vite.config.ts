import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

/** Builds TanStack Start through its production Vite and runtime-specific Nitro integration. */
export default defineConfig({
	root: fileURLToPath(new URL('.', import.meta.url)),
	server: { host: '127.0.0.1' },
	plugins: [
		tanstackStart(),
		nitro({
			preset: process.env.COMPARISON_BUILD_RUNTIME === 'bun' ? 'bun' : 'node-middleware',
			serveStatic: true,
			...(process.env.COMPARISON_BUILD_RUNTIME === 'bun'
				? { output: { dir: fileURLToPath(new URL('./.output-bun', import.meta.url)) } }
				: {})
		}),
		react()
	]
});
