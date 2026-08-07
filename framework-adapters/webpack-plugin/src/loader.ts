import {
	compilerSessionForWebpackLoader,
	transformExactWebpackSourceAsync,
	type ExactWebpackPluginOptions
} from './plugin.js';
import { exactWebpackLoaderBridge, type ExactWebpackLoaderBridgeCarrier } from './loader-bridge.js';

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
		bridge ? (result) => bridge.record(this.resourcePath ?? 'input.tsx', source, result) : undefined
	).then(
		(result) => callback(null, result?.code ?? source, result?.map ?? null),
		(error) => callback(error instanceof Error ? error : new Error(String(error)))
	);
}
