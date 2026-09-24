import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { build, type Rollup } from 'vite';
import { expect, it, onTestFinished } from 'vitest';
import { exact } from './index.js';
import {
	createMotionHydrationFixture,
	motionHydrationModes
} from '../../test-support/motion-hydration.js';

it.each(motionHydrationModes)(
	'retains enhancement linkage and hydration ownership (%s)',
	async (mode) => {
		const { root, shell, partitioned, dispose } = await createMotionHydrationFixture(mode);
		onTestFinished(dispose);
		for (const target of ['server', 'client'] as const) {
			const entry = path.join(root, `${target}.tsx`);
			const result = (await build({
				root,
				configFile: false,
				logLevel: 'silent',
				plugins: [
					exact({
						applicationRoot: root,
						target,
						reactCompatibility: false,
						serverComponents: partitioned
					})
				],
				build: {
					write: false,
					minify: false,
					ssr: target === 'server' ? entry : false,
					lib: { entry, formats: ['es'] },
					rollupOptions: { output: { inlineDynamicImports: true } }
				},
				ssr: { noExternal: true }
			})) as Rollup.RollupOutput | Rollup.RollupOutput[];
			const outputs = (Array.isArray(result) ? result : [result]).flatMap(
				(output) => output.output
			);
			const chunk = outputs.find((output) => output.type === 'chunk' && output.isEntry);
			if (!chunk || chunk.type !== 'chunk') throw new Error('Missing motion entry bundle');
			expect(
				Object.keys(chunk.modules).some((id) => /motion[\\/]dist[\\/].*motion-element/.test(id))
			).toBe(mode !== 'absent');
			await writeFile(path.join(root, 'out', `${target}.mjs`), chunk.code);
		}
		const runner = fileURLToPath(
			new URL('../../test-support/verify-motion-hydration.mjs', import.meta.url)
		);
		const checked = await promisify(execFile)(process.execPath, [
			runner,
			root,
			...(shell ? ['shell'] : [])
		]);
		expect(checked.stderr).toBe('');
	},
	30_000
);
