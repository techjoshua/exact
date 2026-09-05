import { defineConfig } from 'vite';
import { exact } from '@exactjs/vite-plugin';

export default defineConfig({
	plugins: [exact({ target: 'server' })],
	build: {
		target: 'node24',
		outDir: 'dist/server',
		emptyOutDir: true,
		ssr: 'src/start.ts',
		rollupOptions: {
			external: [/^@exactjs\//],
			output: { entryFileNames: 'start.js' }
		}
	}
});
