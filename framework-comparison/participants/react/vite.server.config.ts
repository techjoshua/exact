import { fileURLToPath } from 'node:url';

/** Builds the React server-rendering entry independently from its browser artifact. */
export default {
	root: fileURLToPath(new URL('.', import.meta.url)),
	build: {
		ssr: 'src/server-entry.tsx',
		outDir: 'dist-server',
		emptyOutDir: true,
		rollupOptions: { output: { entryFileNames: 'server-entry.js' } }
	}
};
