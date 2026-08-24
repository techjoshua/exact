import {
	compilerSessionForWebpackLoader,
	transformExactWebpackSourceAsync,
	type ExactWebpackPluginOptions
} from './plugin.js';
import { exactWebpackLoaderBridge, type ExactWebpackLoaderBridgeCarrier } from './loader-bridge.js';
import { transpileExactWebpackResult } from './loader-transpilation.js';

type ExactWebpackLoaderOptions = ExactWebpackPluginOptions & { __exactSessionId?: string };

type LoaderContext = {
	resourcePath?: string;
	query?: unknown;
	_compiler?: ExactWebpackLoaderBridgeCarrier;
	getOptions?(): ExactWebpackLoaderOptions;
	async?(): LoaderContext['callback'];
	callback(error: Error | null, code?: string, map?: unknown): void;
};

/** Runs the asynchronous transform through Webpack's one-shot loader callback contract. */
export default function exactWebpackLoader(this: LoaderContext, source: string): void {
	const callback = this.async?.() ?? this.callback.bind(this);
	const options = this.getOptions?.() ?? {};
	const bridge = exactWebpackLoaderBridge(this._compiler);
	void transformExactWebpackSourceAsync(
		source,
		this.resourcePath ?? 'input.tsx',
		options,
		bridge?.session ?? compilerSessionForWebpackLoader(options.__exactSessionId),
		bridge
			? (result) => bridge.record(this.resourcePath ?? 'input.tsx', source, result)
			: undefined,
		bridge?.intl,
		bridge?.intlReady(),
		bridge?.validate,
		bridge?.packageEnhancements()
	)
		.then(
			async (result) => {
				if (!result) return callback(null, source, null);
				const executable = await transpileExactWebpackResult(
					result,
					this.resourcePath ?? 'input.tsx',
					options.sourceMap !== false
				);
				callback(null, executable.code, executable.map);
			},
			(error) => callback(error instanceof Error ? error : new Error(String(error)))
		)
		.catch((error: unknown) => callback(error instanceof Error ? error : new Error(String(error))));
}
