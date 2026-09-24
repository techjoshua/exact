import { spawnSync } from 'node:child_process';
import path from 'node:path';
import webpack from 'webpack';
import { expect, it, onTestFinished } from 'vitest';
import { createInstalledThemeFixture } from '../../test-support/installed-theme.js';

it.each(['authored', 'paired'] as const)(
	'renders installed enhancements with Webpack (%s)',
	async (mode) => {
		const { ExactWebpackPlugin } = await import('../dist/index.js');
		for (const availability of ['enabled', 'excluded', 'absent'] as const) {
			if (availability === 'absent' && mode === 'authored') continue;
			const fixture = await createInstalledThemeFixture(mode, availability);
			onTestFinished(fixture.dispose);
			const compiler = webpack({
				mode: 'development',
				target: 'node',
				context: fixture.root,
				entry: './run.ts',
				output: { path: path.join(fixture.root, 'dist'), filename: 'server.cjs' },
				resolve: {
					extensions: ['.tsx', '.ts', '.js'],
					extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
				},
				resolveLoader: { modules: [path.join(fixture.workspace, 'node_modules')] },
				plugins: [
					new ExactWebpackPlugin({
						target: 'server',
						applicationRoot: fixture.root,
						serverComponents: true,
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
								: reject(new Error('Missing compilation result'))
					)
				);
				expect(stats.hasErrors(), stats.toString({ all: false, errors: true })).toBe(false);
				const result = spawnSync(process.execPath, [path.join(fixture.root, 'dist/server.cjs')], {
					encoding: 'utf8',
					timeout: 10_000
				});
				expect(result.status, result.stderr).toBe(0);
				expect(JSON.parse(result.stdout)).toEqual({
					scope: availability === 'enabled',
					field: availability === 'enabled',
					input: true
				});
			} finally {
				await new Promise<void>((resolve, reject) =>
					compiler.close((error) => (error ? reject(error) : resolve()))
				);
			}
		}
	},
	30_000
);
