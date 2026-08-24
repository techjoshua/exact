import { buildExactViteApplication } from '@exactjs/vite-plugin/build';

// Client and server emission share one Vite process and one native compiler project generation.
await buildExactViteApplication([
	'participants/exact/vite.config.ts',
	'participants/exact/vite.server.config.ts',
	'participants/exact/vite.bun-server.config.ts'
]);
