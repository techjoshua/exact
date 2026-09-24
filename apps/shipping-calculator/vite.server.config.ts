import { defineConfig } from 'vite';
import { exact } from '@exactjs/vite-plugin';

export default defineConfig({
	plugins: [exact({ target: 'server', serverComponents: true })],
	build: {
		target: 'node22',
		outDir: 'dist/server',
		emptyOutDir: true,
		ssr: 'src/start.ts',
		rollupOptions: { output: { entryFileNames: 'start.js' } }
	}
});
