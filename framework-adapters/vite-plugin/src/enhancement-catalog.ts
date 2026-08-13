import {
	exactAvailableEnhancementFacadeSource,
	exactEnhancementFacadeImports,
	exactUnavailableEnhancementFacadeSource,
	parseExactEnhancementFacadeRequest,
	prependExactEnhancementRegistrations
} from '@exactjs/compiler/adapter-support';
import type { ExactRendererEnhancementIR } from '@exactjs/compiler';
import {
	isExactViteOmittedEnhancement,
	type ExactViteResolution
} from './component-authorization.js';

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
		authorize: (resolved: string, source: string, importer: string | undefined) => Promise<string>,
		activationModule?: string
	): Promise<string | undefined> {
		const request = parseExactEnhancementFacadeRequest(source);
		if (!request) return undefined;
		let resolved: string | null;
		try {
			resolved = await resolveProvider(request.moduleSpecifier, importer);
		} catch (error) {
			if (!isMissingOptionalEnhancement(error, request.moduleSpecifier)) throw error;
			resolved = null;
		}
		let facadeSource = exactUnavailableEnhancementFacadeSource(activationModule);
		if (resolved) {
			const authorized = await authorize(resolved, request.moduleSpecifier, importer);
			if (!isExactViteOmittedEnhancement(authorized))
				facadeSource = exactAvailableEnhancementFacadeSource(
					{
						...request,
						moduleSpecifier: authorized
					},
					activationModule
				);
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

/** Result that distinguishes an enhancement request from an unrelated module request. */
export type ExactViteEnhancementResolution = Readonly<{
	matched: boolean;
	resolution?: ExactViteResolution | Readonly<{ id: string; moduleSideEffects: boolean }>;
}>;

/** Resolves optional and renderer enhancement facades through one authorization boundary. */
export async function resolveExactViteEnhancementRequest(
	options: Readonly<{
		catalog: ExactViteEnhancementFacadeCatalog;
		source: string;
		importer: string | undefined;
		resolve(source: string, importer: string | undefined): Promise<ExactViteResolution>;
		authorize(
			resolved: ExactViteResolution,
			source: string,
			importer: string | undefined
		): Promise<ExactViteResolution>;
		requires(source: string, importer: string | undefined): boolean;
		activationModule?: string;
		useRuntimeFacades?: boolean;
	}>
): Promise<ExactViteEnhancementResolution> {
	const facade = await options.catalog.resolve(
		options.source,
		options.importer,
		async (source, importer) => resolutionId(await options.resolve(source, importer)),
		async (resolved, source, importer) =>
			resolutionId(await options.authorize(resolved, source, importer)) ?? resolved,
		options.activationModule
	);
	if (facade) return { matched: true, resolution: { id: facade, moduleSideEffects: true } };
	if (!(options.source in exactEnhancementFacades) || !options.useRuntimeFacades)
		return { matched: false };
	const request = exactEnhancementFacades[options.source as keyof typeof exactEnhancementFacades];
	let resolution: ExactViteResolution =
		(await options.resolve(request, options.importer)) ?? request;
	if (options.requires(options.source, options.importer))
		resolution = await options.authorize(resolution, options.source, options.importer);
	return { matched: true, resolution };
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

/** Returns the bundler module identifier without discarding the surrounding resolution. */
function resolutionId(resolution: ExactViteResolution): string | null {
	return typeof resolution === 'string' ? resolution : (resolution?.id ?? null);
}

/** Identifies a package-resolution failure for the requested optional provider. */
function isMissingOptionalEnhancement(error: unknown, request: string): boolean {
	if (!(error instanceof Error)) return false;
	const code = (error as Error & { code?: string }).code;
	return (
		(code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') &&
		(error.message.includes(request) || error.message.includes('Could not resolve'))
	);
}
