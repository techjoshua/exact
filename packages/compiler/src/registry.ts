import path from 'node:path';
import { clientRegistryModulePath } from './paths.js';
import type {
	ClientIslandRegistryEntry,
	ClientIslandRegistryOptions,
	ExactComponentRegistryEntry,
	ExactArtifactGraph,
	ExactArtifactGraphInput,
	ExactHydrationRegistrationModuleOptions,
	ServerPartRegistryEntry,
	ServerPartRegistryOptions
} from './types.js';

/** Creates registry entries for client island components from compiled artifacts. */
export function clientIslandRegistryEntries(
	results: readonly ExactArtifactGraphInput[],
	options: ClientIslandRegistryOptions = {}
): ClientIslandRegistryEntry[] {
	return componentRegistryEntries(results, 'client', options.rootDir);
}

/** Creates registry entries for generated server component parts from compiled artifacts. */
export function serverPartRegistryEntries(
	results: readonly ExactArtifactGraphInput[],
	options: ServerPartRegistryOptions = {}
): ServerPartRegistryEntry[] {
	return componentRegistryEntries(results, 'server', options.rootDir);
}

function componentRegistryEntries(
	results: readonly ExactArtifactGraphInput[],
	target: 'client' | 'server',
	rootDir: string | undefined
): ExactComponentRegistryEntry[] {
	const entries: ExactComponentRegistryEntry[] = [];
	for (const result of results) {
		const targetFile = target === 'client' ? result.clientFile : result.serverFile;
		const module = clientRegistryModulePath(targetFile, rootDir ?? path.dirname(targetFile));
		const registrations =
			target === 'client' ? result.build.clientRegistrations : result.build.serverRegistrations;
		for (const registration of registrations) entries.push({ ...registration, module });
	}
	return entries.sort((left, right) => left.id.localeCompare(right.id));
}

/** Creates a hydration registration module for client islands, contracts, and action boundaries. */
export function createExactHydrationRegistrationModule(
	graph: ExactArtifactGraph,
	options: ExactHydrationRegistrationModuleOptions = {}
): string {
	const islandsExportName = options.islandsExportName ?? 'exactClientIslands';
	const registrationExportName = options.registrationExportName ?? 'exactHydrationRegistration';
	const continuationsName = '__exactContinuations';
	const islandEntries = uniqueRegistryEntries(graph.clientIslands);
	const islandsModule = createClientDescriptorCompositionModule(
		islandEntries,
		graph.operations,
		islandsExportName,
		continuationsName
	);
	const registration = omitUndefinedProperties({
		endpoint: options.endpoint,
		endpoints: compactEndpointRoutes(options.endpoints)
	});
	const registrationEntries = [
		...(islandEntries.length ? [`  islands: ${islandsExportName}`] : []),
		...(graph.operations.length ? [`  continuations: ${continuationsName}`] : []),
		...Object.entries(registration).map(
			([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`
		)
	];
	return `${islandsModule}\nexport const ${registrationExportName} = {\n${registrationEntries.join(',\n')}\n};\n`;
}

function createClientDescriptorCompositionModule(
	entries: readonly ClientIslandRegistryEntry[],
	operations: ExactArtifactGraph['operations'],
	exportName: string,
	continuationsName: string
): string {
	const islands = entries.map((entry) => {
		return `  ${JSON.stringify(entry.name)}: __exactLazyIsland(() => import(${JSON.stringify(runtimeModuleSpecifier(entry.module))}).then((module) => module[${JSON.stringify(entry.exportName)}]))`;
	});
	const continuationValues = operations.map((continuation) =>
		compactHydrationContinuation({
			...continuation,
			serverContexts: [],
			serverContextWrites: []
		})
	);
	const continuations: Record<string, Record<string, unknown>> = {};
	for (const continuation of continuationValues) {
		const id = continuation.id;
		if (typeof id !== 'string') throw new Error('Generated eXact continuation is missing its id');
		const previous = continuations[id];
		if (previous && JSON.stringify(previous) !== JSON.stringify(continuation))
			throw new Error(`Conflicting eXact continuation ${id}`);
		continuations[id] = continuation;
	}
	return [
		'import { defineExactHydrationRegistration as __exactDefineRegistration, lazyClientIsland as __exactLazyIsland } from "@exactjs/hydrate";',
		'',
		`export const ${exportName} = {`,
		...islands.map((value, index) => `${value}${index + 1 < islands.length ? ',' : ''}`),
		'};',
		...(continuationValues.length
			? [
					`const ${continuationsName} = __exactDefineRegistration({`,
					`  continuations: ${JSON.stringify(continuations, null, 2)}`,
					'}).continuations;'
				]
			: []),
		''
	].join('\n');
}

function compactEndpointRoutes(
	routes: ExactHydrationRegistrationModuleOptions['endpoints']
): ExactHydrationRegistrationModuleOptions['endpoints'] {
	if (!routes) return undefined;
	const invocations = routes.invocations;
	const boundaries = routes.boundaries;
	const output = {
		...(invocations && Object.keys(invocations).length ? { invocations } : {}),
		...(boundaries && Object.keys(boundaries).length ? { boundaries } : {})
	};
	return Object.keys(output).length ? output : undefined;
}

function compactHydrationContinuation(
	continuation: Record<string, unknown>
): Record<string, unknown> {
	const output = omitEmptyMetadataFields(continuation, [
		'dependencies',
		'stateReads',
		'stateWrites',
		'publicContexts',
		'serverContexts',
		'contextWrites',
		'serverContextWrites',
		'boundaries'
	]);
	const invocation = output.invocation;
	if (invocation && typeof invocation === 'object' && !Array.isArray(invocation)) {
		output.invocation = omitEmptyMetadataFields(invocation as Record<string, unknown>, [
			'arguments'
		]);
	}
	return output;
}

function omitEmptyMetadataFields(
	value: Record<string, unknown>,
	fields: readonly string[]
): Record<string, unknown> {
	const output = { ...value };
	for (const field of fields) {
		const item = output[field];
		if (Array.isArray(item) && item.length === 0) delete output[field];
	}
	return output;
}

function uniqueRegistryEntries<T extends ClientIslandRegistryEntry | ServerPartRegistryEntry>(
	entries: readonly T[]
): T[] {
	// Prefer the defining artifact. Root-barrel symbols may omit componentId,
	// but retain the same public runtime/export name as that direct definition.
	const sorted = [...entries].sort(
		(left, right) =>
			left.name.localeCompare(right.name) ||
			Number(Boolean(right.componentId)) - Number(Boolean(left.componentId)) ||
			right.module.length - left.module.length ||
			left.module.localeCompare(right.module)
	);
	const unique: T[] = [];
	const byName = new Map<string, T>();
	for (const entry of sorted) {
		const previous = byName.get(entry.name);
		if (!previous) {
			byName.set(entry.name, entry);
			unique.push(entry);
			continue;
		}
		if (
			entry.exportName !== previous.exportName ||
			(entry.componentId && previous.componentId && entry.componentId !== previous.componentId) ||
			(!entry.componentId && !previous.componentId)
		)
			throw new Error(`Duplicate eXact registry entry ${entry.name}`);
	}
	return unique;
}

function omitUndefinedProperties(value: Record<string, unknown>): Record<string, unknown> {
	const output: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		if (item !== undefined) output[key] = item;
	}
	return output;
}

function runtimeModuleSpecifier(specifier: string): string {
	return specifier
		.replace(/\.tsx?$/i, '.js')
		.replace(/\.mts$/i, '.mjs')
		.replace(/\.cts$/i, '.cjs');
}
