import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import webpack from 'webpack';
import { expect, it, onTestFinished } from 'vitest';
import {
	createMotionHydrationFixture,
	motionHydrationModes
} from '../../test-support/motion-hydration.js';

it.each(motionHydrationModes)(
	'preserves SSR and hydration with Webpack (%s)',
	async (mode) => {
		const { ExactWebpackPlugin } = await import('../dist/index.js');
		const fixture = await createMotionHydrationFixture(mode);
		onTestFinished(fixture.dispose);
		for (const target of ['server', 'client'] as const) {
			const compiler = webpack({
				mode: 'production',
				target: target === 'server' ? 'node' : 'web',
				context: fixture.root,
				entry: `./${target}.tsx`,
				output: {
					path: path.join(fixture.root, 'out'),
					filename: `${target}.mjs`,
					library: { type: 'module' }
				},
				experiments: { outputModule: true },
				optimization: { minimize: false },
				resolve: {
					extensions: ['.tsx', '.ts', '.js'],
					extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
				},
				plugins: [
					new ExactWebpackPlugin({
						target,
						applicationRoot: fixture.root,
						serverComponents: fixture.partitioned,
						reactCompatibility: false
					})
				]
			});
			try {
				const stats = await new Promise<import('webpack').Stats>((resolve, reject) =>
					compiler.run((error, stats) =>
						error
							? reject(error)
							: stats
								? resolve(stats)
								: reject(new Error('Missing Webpack stats'))
					)
				);
				expect(stats.hasErrors(), stats.toString({ all: false, errors: true })).toBe(false);
			} finally {
				await new Promise<void>((resolve, reject) =>
					compiler.close((error) => (error ? reject(error) : resolve()))
				);
			}
		}
		const runner = fileURLToPath(
			new URL('../../test-support/verify-motion-hydration.mjs', import.meta.url)
		);
		const result = await promisify(execFile)(
			process.execPath,
			[runner, fixture.root, ...(fixture.shell ? ['shell'] : [])],
			{ timeout: 15000 }
		);
		expect(result.stderr).toBe('');
	},
	60000
);
