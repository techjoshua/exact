import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { build } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { createTaskProgressFixture } from '../../test-support/task-progress.js';
import { exact } from './index.js';

it('delivers compiled progress over HTTP before a gated server task can finish', async () => {
	const fixture = await createTaskProgressFixture();
	onTestFinished(fixture.dispose);
	await build({
		root: fixture.root,
		configFile: false,
		logLevel: 'silent',
		plugins: [
			exact({
				applicationRoot: fixture.root,
				target: 'server',
				serverComponents: true,
				reactCompatibility: false
			})
		],
		build: {
			ssr: path.join(fixture.root, 'run.ts'),
			outDir: path.join(fixture.root, 'bundle'),
			rollupOptions: { output: { entryFileNames: 'server.mjs' } }
		},
		ssr: { noExternal: true }
	});
	const result = await promisify(execFile)(
		process.execPath,
		[path.join(fixture.root, 'bundle/server.mjs')],
		{ timeout: 10000 }
	);
	expect(JSON.parse(result.stdout)).toEqual({ progress: true, completed: true });
}, 30000);
