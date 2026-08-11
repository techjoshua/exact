import path from 'node:path';
import type { BunLoadArgs, BunLoadResult, ExactBunPluginOptions } from './plugin.js';

/** Selects the source files observed by the compiler session. */
export function bunLoadFilter(options: ExactBunPluginOptions): RegExp {
	if (options.internationalization) return /\.[cm]?[jt]sx?$/i;
	if (!options.include && !options.exclude && options.compileTestModules !== true) {
		return /^(?!.*[\\/](?:node_modules|dist)[\\/])(?!.*\.(?:test|spec|jest)\.[cm]?[jt]sx?$).*\.[cm]?[jt]sx?$/i;
	}
	return /\.[cm]?[jt]sx?$/;
}

/** Normalizes Bun's singular-or-array condition option. */
export function normalizeConditions(conditions: string | readonly string[] | undefined): string[] {
	if (!conditions) return [];
	return typeof conditions === 'string' ? [conditions] : [...conditions];
}

/** Appends an inline source map to compiler output consumed by Bun. */
export function bunSourceWithMap(code: string, map: unknown): string {
	if (!map) return code;
	const encoded = Buffer.from(typeof map === 'string' ? map : JSON.stringify(map)).toString(
		'base64'
	);
	return `${code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${encoded}`;
}

/** Selects Bun's parser for a source filename. */
export function bunLoader(filename: string): NonNullable<BunLoadResult['loader']> {
	const extension = path.extname(filename.split('?', 1)[0] ?? '').toLowerCase();
	if (extension === '.tsx') return 'tsx';
	if (extension === '.ts' || extension === '.mts' || extension === '.cts') return 'ts';
	if (extension === '.jsx') return 'jsx';
	return 'js';
}

/** Reads a load result without assuming Bun supplied its optional text helper. */
export async function readBunLoadSource(args: BunLoadArgs): Promise<string> {
	if (args.text) return args.text();
	const runtime = globalThis as typeof globalThis & {
		Bun?: { file(path: string): { text(): Promise<string> } };
	};
	if (!runtime.Bun)
		throw new Error('Bun runtime is required to load files through @exactjs/bun-plugin');
	return runtime.Bun.file(args.path.split('?', 1)[0]!).text();
}
