import { exact } from '@exactjs/vite-plugin';
import { fileURLToPath } from 'node:url';

/** Builds and serves only the independently authored eXact participant. */
export default {
	root: fileURLToPath(new URL('.', import.meta.url)),
	plugins: [exact()],
	server: { host: '127.0.0.1' },
	preview: { host: '127.0.0.1' },
	build: { outDir: 'dist', emptyOutDir: true }
};
