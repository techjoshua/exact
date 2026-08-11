import {
	exactAvailableEnhancementFacadeSource,
	exactEnhancementFacadeImports,
	exactUnavailableEnhancementFacadeSource,
	parseExactEnhancementFacadeRequest,
	prependExactEnhancementRegistrations
} from '@exactjs/compiler/adapter-support';
import type { ExactRendererEnhancementIR } from '@exactjs/compiler';
import { isExactViteOmittedEnhancement } from './component-authorization.js';

const resolvedFacadePrefix = '\0exact:optional-enhancement:';

/** Build-local optional enhancement facades resolved in the authored importer's scope. */
export class ExactViteEnhancementFacadeCatalog {
	readonly #sources = new Map<string, string>();
	#generation = 0;

	/** Resolves a compiler request without making an absent optional package a build error. */
	async resolve(
		source: string,
		importer: string | undefined,
		resolveProvider: (source: string, importer: string | undefined) => Promise<string | null>,
		authorize: (resolved: string, source: string, importer: string | undefined) => Promise<string>
	): Promise<string | undefined> {
		const request = parseExactEnhancementFacadeRequest(source);
		if (!request) return undefined;
		const resolved = await resolveProvider(request.moduleSpecifier, importer);
		let facadeSource = exactUnavailableEnhancementFacadeSource();
		if (resolved) {
			const authorized = await authorize(resolved, request.moduleSpecifier, importer);
			if (!isExactViteOmittedEnhancement(authorized))
				facadeSource = exactAvailableEnhancementFacadeSource({
					...request,
					moduleSpecifier: authorized
				});
		}
		const id = `${resolvedFacadePrefix}${this.#generation}:${encodeURIComponent(source)}:${encodeURIComponent(importer ?? '')}`;
		this.#sources.set(id, facadeSource);
		return id;
	}

	/** Loads one facade created by this build generation. */
	load(id: string): string | undefined {
		return this.#sources.get(id);
	}

	/** Fences stale facade modules after source/configuration changes. */
	advanceGeneration(): void {
		this.#generation += 1;
		this.#sources.clear();
	}
}

/** Runtime facades that supply the shared application-bundle enhancement catalog. */
export const exactEnhancementFacades = exactEnhancementFacadeImports;

/** Adds one generated catalog fragment for capabilities referenced by a compiled module. */
export function prependViteEnhancementRegistrations(
	code: string,
	enhancements: readonly ExactRendererEnhancementIR[] | undefined
): string {
	return prependExactEnhancementRegistrations(code, enhancements);
}
