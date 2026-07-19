import { createReactCompatibilityBuildEngine } from './build.js';
import type { ReactCompatibilityDiagnostic } from './build.js';
import type { ReactCompatibilityOptions } from './plugin.js';

export interface ExactReactNodeLoaderOptions extends ReactCompatibilityOptions {
	readonly cwd?: string;
	readonly onDiagnostic?: (diagnostic: ReactCompatibilityDiagnostic) => void;
}

export interface ExactReactNodeLoader {
	readonly target: 18 | 19;
	readonly adapters: readonly string[];
	transform(source: string, url: string): { code: string; map: unknown } | null;
	load(
		url: string,
		context: Readonly<{ format?: string | null }>,
		nextLoad: (
			url: string,
			context: Readonly<{ format?: string | null }>
		) => Promise<{
			format?: string | null;
			source?: string | ArrayBuffer | ArrayBufferView | null;
			[key: string]: unknown;
		}>
	): Promise<{
		format?: string | null;
		source?: string | ArrayBuffer | ArrayBufferView | null;
		[key: string]: unknown;
	}>;
}

type NodeLoadContext = Readonly<{ format?: string | null }>;
type NodeLoadResult = {
	format?: string | null;
	source?: string | ArrayBuffer | ArrayBufferView | null;
	[key: string]: unknown;
};
type NextLoad = (url: string, context: NodeLoadContext) => Promise<NodeLoadResult>;

/** Creates reusable Node loader hooks backed by the same registry as Vite. */
export function createExactReactNodeLoader(
	options: ExactReactNodeLoaderOptions = {}
): ExactReactNodeLoader {
	const engine = createReactCompatibilityBuildEngine(options);
	const transform = (source: string, url: string): { code: string; map: unknown } | null => {
		if (!isJavaScriptUrl(url)) return null;
		const result = engine.transformModule({
			id: url,
			source,
			format: 'module',
			target: 'server',
			sourceMap: true
		});
		for (const diagnostic of result.diagnostics) options.onDiagnostic?.(diagnostic);
		return result.changed ? { code: result.code, map: result.map } : null;
	};
	return Object.freeze({
		target: engine.resolved.target,
		adapters: engine.report().activeAdapters,
		transform,
		async load(url: string, context: NodeLoadContext, nextLoad: NextLoad) {
			const loaded = await nextLoad(url, context);
			if (
				loaded.source === null ||
				loaded.source === undefined ||
				(loaded.format && loaded.format !== 'module' && loaded.format !== 'commonjs')
			)
				return loaded;
			const source = sourceText(loaded.source);
			const transformed = transform(source, url);
			return transformed ? { ...loaded, source: transformed.code } : loaded;
		}
	});
}

let defaultLoader: ExactReactNodeLoader | undefined;

/** Node ESM loader hook for `node --loader @exact/react-compat/node-loader`. */
export async function load(
	url: string,
	context: Readonly<{ format?: string | null }>,
	nextLoad: (
		url: string,
		context: Readonly<{ format?: string | null }>
	) => Promise<{
		format?: string | null;
		source?: string | ArrayBuffer | ArrayBufferView | null;
		[key: string]: unknown;
	}>
): Promise<{
	format?: string | null;
	source?: string | ArrayBuffer | ArrayBufferView | null;
	[key: string]: unknown;
}> {
	defaultLoader ??= createExactReactNodeLoader();
	return defaultLoader.load(url, context, nextLoad);
}

function isJavaScriptUrl(url: string): boolean {
	const clean = url.split('?', 1)[0]!;
	return /\.[cm]?jsx?$/i.test(clean) || clean.startsWith('data:text/javascript');
}

function sourceText(source: string | ArrayBuffer | ArrayBufferView): string {
	if (typeof source === 'string') return source;
	if (source instanceof ArrayBuffer) return new TextDecoder().decode(source);
	return new TextDecoder().decode(
		new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
	);
}
