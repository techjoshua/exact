import { spawnSync } from 'node:child_process';
import path from 'node:path';
import webpack from 'webpack';
import { expect, it } from 'vitest';
import { createTaskProgressFixture } from '../../test-support/task-progress.js';

it('delivers Webpack progress over HTTP before a gated server task finishes', async () => {
	const { ExactWebpackPlugin } = await import('../dist/index.js');
	const fixture = await createTaskProgressFixture();
	const compiler = webpack({
		mode: 'development',
		target: 'node',
		context: fixture.root,
		entry: './run.ts',
		output: { path: path.join(fixture.root, 'bundle'), filename: 'server.cjs' },
		experiments: { topLevelAwait: true },
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
				error ? reject(error) : stats ? resolve(stats) : reject(new Error('Missing stats'))
			)
		);
		expect(stats.hasErrors(), stats.toString({ all: false, errors: true })).toBe(false);
		const result = spawnSync(process.execPath, [path.join(fixture.root, 'bundle/server.cjs')], {
			encoding: 'utf8',
			timeout: 10000
		});
		expect(result.status, result.stderr).toBe(0);
		expect(JSON.parse(result.stdout)).toEqual({ progress: true, completed: true });
	} finally {
		await new Promise<void>((resolve, reject) =>
			compiler.close((error) => (error ? reject(error) : resolve()))
		);
		await fixture.dispose();
	}
}, 30000);
