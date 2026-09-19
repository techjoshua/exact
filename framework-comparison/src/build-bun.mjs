import { assertComparisonWorkspaceDependencies } from './workspace-dependencies.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

assertComparisonWorkspaceDependencies();

// Keep production Bun artifacts separate so runtime selection cannot reuse a Node build.
const directory = fileURLToPath(new URL('..', import.meta.url));
for (const [command, args, cwd] of [
	[
		'node_modules/vite/bin/vite.js',
		['build', '--config', 'participants/react/vite.bun-server.config.ts'],
		directory
	],
	['../../node_modules/vite/bin/vite.js', ['build'], `${directory}/participants/sveltekit`],
	['node_modules/nuxt/bin/nuxt.mjs', ['build', '--cwd', 'participants/nuxt'], directory],
	[
		'node_modules/vite/bin/vite.js',
		['build', '--config', 'participants/tanstack-start/vite.config.ts'],
		directory
	]
]) {
	const result = spawnSync(process.execPath, [command, ...args], {
		cwd,
		env: { ...process.env, COMPARISON_BUILD_RUNTIME: 'bun' },
		stdio: 'inherit',
		windowsHide: true
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error(`Bun target build failed: ${command} ${args.join(' ')}`);
}
