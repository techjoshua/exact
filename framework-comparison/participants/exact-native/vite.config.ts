import { defineConfig } from 'vite';
import { exact } from '@exactjs/vite-plugin';

export default defineConfig({
	plugins: [exact()],
	build: {
		outDir: 'dist/client',
		emptyOutDir: true,
		manifest: true,
		rollupOptions: { input: 'src/client.ts' }
	}
});
