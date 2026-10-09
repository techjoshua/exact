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
	addDependency?(filename: string): void;
	addMissingDependency?(filename: string): void;
	query?: unknown;
	_compiler?: ExactWebpackLoaderBridgeCarrier;
	getOptions?(): ExactWebpackLoaderOptions;
	async?(): LoaderContext['callback'];
	emitWarning?(warning: Error): void;
	callback(error: Error | null, code?: string, map?: unknown): void;
};

/** Runs the asynchronous transform through Webpack's one-shot loader callback contract. */
export default function exactWebpackLoader(this: LoaderContext, source: string): void {
	const callback = this.async?.() ?? this.callback.bind(this);
	const options = this.getOptions?.() ?? {};
	const bridge = exactWebpackLoaderBridge(this._compiler);
	const session = bridge?.session ?? compilerSessionForWebpackLoader(options.__exactSessionId);
	void Promise.resolve(bridge?.configurationWatchFiles?.(this.resourcePath))
		.then((files) => {
			for (const file of files ?? []) {
				if (file.missing) this.addMissingDependency?.(file.filename);
				else this.addDependency?.(file.filename);
			}
			return transformExactWebpackSourceAsync(
				source,
				this.resourcePath ?? 'input.tsx',
				options,
				session,
				bridge
					? (result) => bridge.record(this.resourcePath ?? 'input.tsx', source, result)
					: undefined,
				bridge?.intl,
				bridge?.intlReady(),
				bridge?.validate,
				bridge?.packageEnhancements(),
				bridge?.warn ?? ((message) => this.emitWarning?.(new Error(message))),
				bridge?.resolveEnhancement
			);
		})
		.then(
			async (result) => {
				for (const filename of session?.watchFiles(this.resourcePath) ?? [])
					this.addDependency?.(filename);
				const executable = await transpileExactWebpackResult(
					result ?? { code: source, map: null },
					this.resourcePath ?? 'input.tsx',
					options.sourceMap !== false
				);
				callback(null, executable.code, executable.map);
			},
			(error) => callback(error instanceof Error ? error : new Error(String(error)))
		)
		.catch((error: unknown) => callback(error instanceof Error ? error : new Error(String(error))));
}
