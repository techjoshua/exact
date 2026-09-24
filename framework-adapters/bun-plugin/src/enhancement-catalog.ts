import { isMissingExactOptionalEnhancement as isMissingOptionalEnhancement } from '@exactjs/compiler/adapter-support';
import {
	exactAvailableEnhancementFacadeSource,
	exactUnavailableEnhancementFacadeSource,
	parseExactEnhancementFacadeRequest
} from '@exactjs/compiler/adapter-support';
import path from 'node:path';
import type {
	ExactBunComponentAuthorization,
	ExactBunResolver
} from './component-authorization.js';

/** Build-local Bun facade modules for optional renderer enhancements. */
export class ExactBunEnhancementFacadeCatalog {
	readonly #sources = new Map<string, string>();

	/** Discards facade source retained by the preceding build generation. */
	clear(): void {
		this.#sources.clear();
	}

	/** Resolves an optional provider without turning package absence into a build failure. */
	async resolve(
		source: string,
		importer: string | undefined,
		options: Readonly<{
			authorization?: ExactBunComponentAuthorization;
			resolve?: ExactBunResolver;
			aliases?: Readonly<Record<string, string>>;
			activationModule?: string;
		}>
	): Promise<Readonly<{ path: string; namespace: string }> | undefined> {
		const request = parseExactEnhancementFacadeRequest(source);
		if (!request) return undefined;
		let facadeSource = exactUnavailableEnhancementFacadeSource(options.activationModule);
		try {
			const authorized = await options.authorization?.authorize(
				request.moduleSpecifier,
				importer ?? '',
				options.resolve,
				options.aliases
			);
			if (authorized?.namespace !== 'exact-omitted-enhancement') {
				const resolved =
					authorized ??
					(await options.resolve?.(request.moduleSpecifier, {
						kind: 'import-statement',
						resolveDir: importer ? path.dirname(importer) : process.cwd()
					}));
				if (resolved?.path)
					facadeSource = exactAvailableEnhancementFacadeSource(
						{
							...request,
							moduleSpecifier: resolved.path
						},
						options.activationModule
					);
			}
		} catch (error) {
			if (!isMissingOptionalEnhancement(error, request.moduleSpecifier)) throw error;
		}
		const id = Buffer.from(`${source}\0${importer ?? ''}`).toString('base64url');
		this.#sources.set(id, facadeSource);
		return { path: id, namespace: 'exact-enhancement-facade' };
	}

	/** Loads a facade produced for the active build generation. */
	load(id: string): string {
		return this.#sources.get(id) ?? exactUnavailableEnhancementFacadeSource();
	}
}
