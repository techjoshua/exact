import path from 'node:path';
import webpack from 'webpack';
import { expect, it, onTestFinished } from 'vitest';
import {
	createWatchedTypeFixture,
	readWatchedTypeBundle
} from '../../test-support/watched-type-fixture.js';

it('rebuilds unchanged consumers after a sibling declaration changes', async () => {
	const fixture = await createWatchedTypeFixture();
	onTestFinished(fixture.dispose);
	const { ExactWebpackPlugin } = await import('../dist/index.js');
	const output = path.join(fixture.root, 'out');
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
	let complete!: (error: Error | null | undefined, stats?: webpack.Stats) => void;
	const next = () =>
		new Promise<webpack.Stats>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error('Declaration edit did not rebuild its consumer')),
				10000
			);
			complete = (error, stats) => {
				clearTimeout(timer);
				if (error) reject(error);
				else if (stats) resolve(stats);
				else reject(new Error('Missing watch stats'));
			};
		});
	const initial = next();
	const watching = compiler.watch({ aggregateTimeout: 20 }, (error, stats) =>
		complete(error, stats)
	);
	try {
		let stats = await initial;
		for (const [index, array] of [false, true, false].entries()) {
			if (index > 0) {
				const built = next();
				await fixture.update(array);
				stats = await built;
			}
			expect(stats.hasErrors(), stats.toString({ all: false, errors: true })).toBe(false);
			expect(await readWatchedTypeBundle(path.join(output, 'server.cjs'), array)).toBe(
				array ? '<p>onetwo</p>' : '<p>initial</p>'
			);
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
}, 30000);
