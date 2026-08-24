import { exactServerBuild } from './vite.server-build.js';

/** Builds the Bun Fetch entry without retaining its adapter in the Node artifact. */
export default exactServerBuild(
	new URL('./src/bun-server-entry.ts', import.meta.url),
	'dist-bun-server',
	'bun-server-entry.js'
);
