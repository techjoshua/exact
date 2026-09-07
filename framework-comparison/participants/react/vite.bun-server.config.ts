import { fileURLToPath } from 'node:url';

/** Builds the streaming React entry consumed by Bun's native Fetch server. */
export default {
	root: fileURLToPath(new URL('.', import.meta.url)),
	build: {
		ssr: 'src/bun-server-entry.tsx',
		outDir: 'dist-bun-server',
		emptyOutDir: true,
		rollupOptions: { output: { entryFileNames: 'bun-server-entry.js' } }
	}
};
