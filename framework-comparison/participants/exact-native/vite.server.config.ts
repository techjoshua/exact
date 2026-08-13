import { defineConfig } from 'vite';

export default defineConfig({
	build: {
		target: 'node24',
		outDir: 'dist/server',
		emptyOutDir: true,
		ssr: 'src/start.ts',
		rollupOptions: { output: { entryFileNames: 'start.js' } }
	}
});
