import { exactServerBuild } from './vite.server-build.js';

/** Builds the Node SSR entry without retaining Bun-only response capabilities. */
export default exactServerBuild(
	new URL('./src/server-entry.tsx', import.meta.url),
	'dist-server',
	'server-entry.js'
);
