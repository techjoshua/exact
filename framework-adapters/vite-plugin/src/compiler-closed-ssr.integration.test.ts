import path from 'node:path';
import { build } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import {
	createCompilerClosedSsrFixture,
	verifyCompilerClosedSsr,
	compilerClosedSsrResult
} from '../../test-support/compiler-closed-ssr.js';
import { exact } from './index.js';

it('keeps compiled scheduled SSR free of client reactive machinery', async () => {
	const fixture = await createCompilerClosedSsrFixture();
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
	expect(await verifyCompilerClosedSsr(path.join(fixture.root, 'bundle/server.mjs'))).toEqual(
		compilerClosedSsrResult
	);
}, 30000);
