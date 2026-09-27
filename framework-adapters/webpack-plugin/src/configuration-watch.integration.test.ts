import path from 'node:path';
import webpack from 'webpack';
import { expect, it, onTestFinished } from 'vitest';
import {
	createConfigurationWatchFixture,
	readConfigurationBundle
} from '../../test-support/configuration-watch.js';

it('rebuilds unchanged consumers when package enhancement configuration changes', async () => {
	const { ExactWebpackPlugin } = await import('../dist/index.js');
	const fixture = await createConfigurationWatchFixture();
	onTestFinished(fixture.dispose);
	const output = path.join(fixture.root, 'bundle');
	const compiler = webpack({
		mode: 'development',
		target: 'node',
		context: fixture.root,
		entry: './run.ts',
		output: { path: output, filename: 'server.cjs' },
		experiments: { topLevelAwait: true },
		resolve: {
			extensions: ['.tsx', '.ts', '.js'],
			extensionAlias: { '.js': ['.js', '.ts', '.tsx'] }
		},
		plugins: [
			new ExactWebpackPlugin({
				target: 'server',
				applicationRoot: fixture.root,
				serverComponents: true,
				reactCompatibility: false
			})
		]
	});
	let latest: webpack.Stats | undefined;
	let complete!: (stats: webpack.Stats) => void;
	let fail!: (error: unknown) => void;
	const next = () =>
		new Promise<webpack.Stats>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error('Configuration edit did not rebuild its consumer')),
				10000
			);
			complete = (stats) => {
				clearTimeout(timer);
				resolve(stats);
			};
			fail = (error) => {
				clearTimeout(timer);
				reject(error);
			};
		});
	const initial = next();
	const watching = compiler.watch({ aggregateTimeout: 20 }, (error, stats) => {
		latest = stats;
		if (error) fail(error);
		else if (stats) complete(stats);
		else fail(new Error('Missing stats'));
	});
	try {
		let stats = await initial;
		for (const [index, enabled] of [true, false, true, null, true].entries()) {
			if (index > 0) {
				const built = next();
				await fixture.configure(enabled);
				stats = await built;
			}
			expect(stats.hasErrors(), stats.toString({ all: false, errors: true })).toBe(false);
			await expect
				.poll(() => readConfigurationBundle(path.join(output, 'server.cjs')), { timeout: 10000 })
				.toBe(enabled === true);
			expect(latest?.hasErrors(), latest?.toString({ all: false, errors: true })).toBe(false);
		}
	} finally {
		if (watching)
			await new Promise<void>((resolve, reject) =>
				watching.close((error) => (error ? reject(error) : resolve()))
			);
		await new Promise<void>((resolve, reject) =>
			compiler.close((error) => (error ? reject(error) : resolve()))
		);
	}
}, 40000);
