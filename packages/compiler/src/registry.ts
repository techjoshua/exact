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
	const clientBootstrapExportName = options.clientBootstrapExportName;
	const continuationsName = '__exactContinuations';
	const islandEntries = uniqueRegistryEntries(graph.clientIslands);
	const islandsModule = createClientDescriptorCompositionModule(
		islandEntries,
		graph.operations,
		islandsExportName,
		continuationsName,
		options.preserveAuthoredModuleExtensions ?? false
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
	const registrationModule = `export const ${registrationExportName} = {\n${registrationEntries.join(',\n')}\n};\n`;
	const ownsClientCapabilities = islandEntries.length !== 0 || graph.operations.length !== 0;
	const bootstrapModule =
		clientBootstrapExportName && ownsClientCapabilities
			? [
					'import { createExactClient as __exactCreateClient, readExactHydrationConfig as __exactReadConfig } from "@exactjs/hydrate/framework/client-bootstrap";',
					'import type { ExactClient as __ExactClient, HydrateOptions as __ExactHydrateOptions } from "@exactjs/hydrate/framework/client-bootstrap";',
					'',
					`export function ${clientBootstrapExportName}(root: Element, options: __ExactHydrateOptions = {}): __ExactClient {`,
					`  return __exactCreateClient(root, { ...__exactReadConfig(root), ...${registrationExportName}, ...options });`,
					'}',
					''
				].join('\n')
			: '';
	return `${islandsModule}\n${registrationModule}${bootstrapModule}`;
}

function createClientDescriptorCompositionModule(
	entries: readonly ClientIslandRegistryEntry[],
	operations: ExactArtifactGraph['operations'],
	exportName: string,
	continuationsName: string,
	preserveModuleExtensions: boolean
): string {
	const islands = entries.map((entry) => {
		const activation =
			entry.activation?.mode === 'interaction' ? `, ${JSON.stringify(entry.activation)}` : '';
		const module = preserveModuleExtensions ? entry.module : runtimeModuleSpecifier(entry.module);
		return `  ${JSON.stringify(entry.name)}: __exactLazyIsland(() => import(${JSON.stringify(module)}).then((module) => module[${JSON.stringify(entry.exportName)}])${activation})`;
	});
	const continuationValues = operations.map((continuation) =>
		clientHydrationContinuation(continuation)
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
		...(islands.length
			? [
					'import { lazyClientIsland as __exactLazyIsland } from "@exactjs/hydrate/framework/client-bootstrap";'
				]
			: []),
		'',
		`export const ${exportName} = {`,
		...islands.map((value, index) => `${value}${index + 1 < islands.length ? ',' : ''}`),
		'};',
		...(continuationValues.length
			? [`const ${continuationsName} = ${JSON.stringify(continuations, null, 2)} as const;`]
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

function clientHydrationContinuation(
	continuation: Record<string, unknown>
): Record<string, unknown> {
	return {
		...continuation,
		serverContexts: [],
		serverContextWrites: []
	};
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
