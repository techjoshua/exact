import { createRequire } from 'node:module';
import path from 'node:path';
import webpack from 'webpack';
import { expect, it, onTestFinished } from 'vitest';
import {
	createCompilerClosedSsrFixture,
	verifyCompilerClosedSsr,
	compilerClosedSsrResult
} from '../../test-support/compiler-closed-ssr.js';

// Use Webpack's own minimizer, retaining names so the shared structural guard remains meaningful.
const TerserPlugin = createRequire(import.meta.resolve('webpack'))(
	'minimizer-webpack-plugin'
) as new (options: {
	terserOptions: { mangle: boolean; keep_fnames: boolean };
}) => import('webpack').WebpackPluginInstance;

it('keeps compiled scheduled SSR free of client reactive machinery', async () => {
	const { ExactWebpackPlugin } = await import('../dist/index.js');
	const fixture = await createCompilerClosedSsrFixture();
	onTestFinished(fixture.dispose);
	const compiler = webpack({
		mode: 'production',
		optimization: {
			minimizer: [new TerserPlugin({ terserOptions: { mangle: false, keep_fnames: true } })]
		},
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
		expect(await verifyCompilerClosedSsr(path.join(fixture.root, 'bundle/server.cjs'))).toEqual(
			compilerClosedSsrResult
		);
	} finally {
		await new Promise<void>((resolve, reject) =>
			compiler.close((error) => (error ? reject(error) : resolve()))
		);
	}
}, 30000);
