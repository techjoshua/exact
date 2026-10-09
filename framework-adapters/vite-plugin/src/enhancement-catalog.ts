import { isCompiledTestResolution } from './test-host/module-selection.js';
import type { ExactPluginOptions } from './plugin-contracts.js';
import type { ExactViteComponentAuthorization } from './component-authorization.js';
import { isMissingExactOptionalEnhancement as isMissingOptionalEnhancement } from '@exactjs/compiler/adapter-support';
import { createHash } from 'node:crypto';
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
		// Authorization remains importer-scoped, but importer identity must not fragment Vite's
		// module graph once two requests have selected the same executable facade.
		const id = `${resolvedFacadePrefix}${createHash('sha256').update(facadeSource).digest('base64url')}`;
		const existing = this.#sources.get(id);
		if (existing !== undefined && existing !== facadeSource)
			throw new Error(`Conflicting eXact enhancement facade content for ${id}`);
		this.#sources.set(id, facadeSource);
		return id;
	}

	/** Loads one facade created by this build generation. */
	load(id: string): string | undefined {
		return this.#sources.get(id);
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

/** Resolves one target's enhancement capabilities and retains ownership of its generated facade. */
export async function resolveExactViteTargetEnhancement(options: {
	catalog: ExactViteEnhancementFacadeCatalog;
	source: string;
	importer: string | undefined;
	target: 'client' | 'server';
	compiler: ExactPluginOptions;
	authorization: ExactViteComponentAuthorization;
	authorizeOptions: Parameters<ExactViteComponentAuthorization['authorize']>[3];
	resolve(source: string, importer?: string): Promise<ExactViteResolution>;
	retain(id: string, target: 'client' | 'server'): void;
}): Promise<ExactViteEnhancementResolution> {
	const server = options.target === 'server';
	const result = await resolveExactViteEnhancementRequest({
		catalog: options.catalog,
		source: options.source,
		importer: options.importer,
		resolve: options.resolve,
		authorize: (resolved, source, importer) =>
			!server || isCompiledTestResolution(resolved, options.compiler)
				? Promise.resolve(resolved)
				: options.authorization.authorize(resolved, source, importer, options.authorizeOptions),
		requires: (source, importer) => server && options.authorization.requires(source, importer),
		activationModule: server ? undefined : '@exactjs/dom/framework/enhancements',
		useRuntimeFacades: server
	});
	if (result.resolution)
		options.retain(
			typeof result.resolution === 'string' ? result.resolution : result.resolution.id,
			options.target
		);
	return result;
}
