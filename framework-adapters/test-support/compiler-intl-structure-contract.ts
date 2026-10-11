import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildDiagnosticFixture } from './compiler-diagnostic-build.js';

/** Checks translated structure callback types through each host's strict build pipeline. */
export async function verifyCompilerIntlStructureContract(adapter: 'vite' | 'webpack' | 'bun') {
	const parent = path.resolve('.tmp/compiler-intl-structure-adapters');
	await mkdir(parent, { recursive: true });
	const root = await mkdtemp(path.join(parent, adapter + '-'));
	try {
		await Promise.all([
			writeFile(
				path.join(root, 'package.json'),
				JSON.stringify({ name: '@fixture/compiler-intl-structure', type: 'module', private: true })
			),
			writeFile(path.join(root, 'exact.config.mjs'), 'export default {};'),
			writeFile(
				path.join(root, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						target: 'ESNext',
						module: 'ESNext',
						moduleResolution: 'Bundler',
						jsx: 'preserve',
						strict: true
					},
					include: ['entry.tsx']
				})
			),
			writeFile(
				path.join(root, 'entry.tsx'),
				`import * as intl from '@exactjs/intl/enhancements' with {type:'exact-enhancement'};
import * as time from '@exactjs/time/enhancements' with {type:'exact-enhancement'};
function Widget(){return()=> <span>widget</span>}
export function Page(){return()=> <p intl:message><time time:update>{Math.floor(Date.now()/1000)}</time><em>elapsed</em><_ intl:fragment="widget"><Widget/></_></p>}`
			)
		]);
		for (const target of ['client', 'server'] as const)
			await buildDiagnosticFixture(adapter, root, target, true);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
}
