import { exact } from '@exactjs/vite-plugin';
import { fileURLToPath } from 'node:url';

/** Builds the eXact server-rendering entry independently from its browser artifact. */
export default {
	root: fileURLToPath(new URL('.', import.meta.url)),
	plugins: [exact()],
	build: {
		ssr: 'src/server-entry.tsx',
		outDir: 'dist-server',
		emptyOutDir: true,
		rollupOptions: { output: { entryFileNames: 'server-entry.js' } }
	}
};
