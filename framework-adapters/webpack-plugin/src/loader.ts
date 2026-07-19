import {
	compilerSessionForWebpackLoader,
	transformExactWebpackSourceAsync,
	type ExactWebpackPluginOptions
} from './index.js';

type ExactWebpackLoaderOptions = ExactWebpackPluginOptions & { __exactSessionId?: string };

type LoaderContext = {
	resourcePath?: string;
	query?: unknown;
	getOptions?(): ExactWebpackLoaderOptions;
	callback(error: Error | null, code?: string, map?: unknown): void;
};

export default async function exactWebpackLoader(
	this: LoaderContext,
	source: string
): Promise<void> {
	try {
		const options = this.getOptions?.() ?? {};
		const result = await transformExactWebpackSourceAsync(
			source,
			this.resourcePath ?? 'input.tsx',
			options,
			compilerSessionForWebpackLoader(options.__exactSessionId)
		);
		this.callback(null, result?.code ?? source, result?.map ?? null);
	} catch (error) {
		this.callback(error instanceof Error ? error : new Error(String(error)));
	}
}
