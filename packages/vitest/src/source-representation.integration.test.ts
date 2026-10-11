import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, onTestFinished } from 'vitest';

it.each(['server', 'client'] as const)(
	'keeps executable and raw TSX imports separate in a %s test graph',
	async (target) => {
		const workspace = fileURLToPath(new URL('../../../', import.meta.url));
		await mkdir(path.join(workspace, '.tmp'), { recursive: true });
		const root = await mkdtemp(path.join(workspace, '.tmp/source-representation-vitest-'));
		onTestFinished(() => rm(root, { recursive: true, force: true }));
		const source = 'export function Probe() { return () => <p>source example</p>; }';
		await writeFile(path.join(root, 'Probe.tsx'), source);
		await writeFile(path.join(root, 'exact.config.mjs'), 'export default {};');
		await writeFile(
			path.join(root, 'tsconfig.json'),
			JSON.stringify({
				compilerOptions: {
					jsx: 'preserve',
					module: 'ESNext',
					moduleResolution: 'Bundler',
					strict: true
				}
			})
		);
		await writeFile(
			path.join(root, 'vitest.config.mjs'),
			`import {defineConfig} from 'vitest/config';
import {exactVitest} from '@exactjs/vitest';
export default defineConfig({plugins:[exactVitest({compiler:{target:${JSON.stringify(target)}}})],test:{environment:'node',include:['probe.test.ts']}});`
		);
		const run = () =>
			execFileSync(
				process.execPath,
				[
					path.join(workspace, 'node_modules/vitest/vitest.mjs'),
					'run',
					'--root',
					root,
					'--config',
					'vitest.config.mjs'
				],
				{ cwd: root, encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }
			);
		await writeFile(
			path.join(root, 'probe.test.ts'),
			`import {expect,test} from 'vitest';
import {Probe} from './Probe.js';
test('executable control',()=>expect(Probe).toBeTypeOf('function'));`
		);
		expect(run()).toContain('1 passed');
		await writeFile(
			path.join(root, 'probe.test.ts'),
			`import {expect,test} from 'vitest';
import {Probe} from './Probe.js';
import text from './Probe.tsx?raw';
import queried from './Probe.tsx?raw&example=1';
import url from './Probe.tsx?url';
test('executable and original source',()=>{expect(Probe).toBeTypeOf('function');expect(text).toBe(${JSON.stringify(source)});expect(queried).toBe(text);expect(url).toContain('Probe.tsx');});`
		);
		expect(run()).toContain('1 passed');
	},
	150000
);
