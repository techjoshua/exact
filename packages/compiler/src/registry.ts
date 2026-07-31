import path from 'node:path';
import { clientRegistryModulePath } from './paths.js';
import type {
	ClientIslandRegistryEntry,
	ClientIslandRegistryOptions,
	ExactArtifactGraph,
	ExactArtifactGraphInput,
	ExactContinuationIR,
	ExactHydrationRegistrationModuleOptions,
	ExactRegistryModuleOptions,
	ExactSymbolIR,
	ServerPartRegistryEntry,
	ServerPartRegistryOptions
} from './types.js';

/** Creates registry entries for client island components from compiled artifacts. */
export function createClientIslandRegistryEntries(
	results: readonly ExactArtifactGraphInput[],
	options: ClientIslandRegistryOptions = {}
): ClientIslandRegistryEntry[] {
	const entries: ClientIslandRegistryEntry[] = [];

	for (const result of results) {
		const modulePath = clientRegistryModulePath(
			result.clientFile,
			options.rootDir ?? path.dirname(result.manifestFile)
		);
		const continuationComponents = new Set(
			result.manifest.continuations.map((continuation) => continuation.componentId)
		);
		for (const symbol of result.manifest.symbols) {
			if (!clientRegistrySymbol(symbol, continuationComponents)) continue;
			entries.push({
				id: symbol.id,
				name: symbol.generatedName,
				exportName: symbol.exportName,
				module: modulePath,
				componentId: symbol.componentId
			});
		}
	}

	return entries.sort((left, right) => left.id.localeCompare(right.id));
}

/** Creates a JavaScript module exporting a client island registry object. */
export function createClientIslandRegistryModule(
	entries: readonly ClientIslandRegistryEntry[],
	options: ExactRegistryModuleOptions = {}
): string {
	return createNamedRegistryModule(entries, options.exportName ?? 'exactClientIslands');
}

/** Creates registry entries for generated server component parts from compiled artifacts. */
export function createServerPartRegistryEntries(
	results: readonly ExactArtifactGraphInput[],
	options: ServerPartRegistryOptions = {}
): ServerPartRegistryEntry[] {
	const entries: ServerPartRegistryEntry[] = [];

	for (const result of results) {
		const modulePath = clientRegistryModulePath(
			result.serverFile,
			options.rootDir ?? path.dirname(result.manifestFile)
		);
		for (const symbol of result.manifest.symbols) {
			if (symbol.role !== 'server-part' || symbol.target !== 'server' || !symbol.exportName)
				continue;
			entries.push({
				id: symbol.id,
				name: symbol.generatedName,
				exportName: symbol.exportName,
				module: modulePath,
				componentId: symbol.componentId
			});
		}
	}

	return entries.sort((left, right) => left.id.localeCompare(right.id));
}

/** Creates a JavaScript module exporting a server part registry object. */
export function createServerPartRegistryModule(
	entries: readonly ServerPartRegistryEntry[],
	options: ExactRegistryModuleOptions = {}
): string {
	return createNamedRegistryModule(entries, options.exportName ?? 'exactServerParts');
}

/** Creates a hydration registration module for client islands, contracts, and action boundaries. */
export function createExactHydrationRegistrationModule(
	graph: ExactArtifactGraph,
	options: ExactHydrationRegistrationModuleOptions = {}
): string {
	const islandsExportName = options.islandsExportName ?? 'exactClientIslands';
	const registrationExportName = options.registrationExportName ?? 'exactHydrationRegistration';
	const continuationsName = '__exactContinuations';
	const islandsModule = createClientDescriptorCompositionModule(
		graph,
		islandsExportName,
		continuationsName
	);
	const registration = omitUndefinedProperties({
		endpoint: options.endpoint,
		endpoints: options.endpoints
	});
	const registrationEntries = [
		`  islands: ${islandsExportName}`,
		`  continuations: ${continuationsName}`,
		...Object.entries(registration).map(
			([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`
		)
	];
	return `${islandsModule}\nexport const ${registrationExportName} = {\n${registrationEntries.join(',\n')}\n};\n`;
}

function createClientDescriptorCompositionModule(
	graph: ExactArtifactGraph,
	exportName: string,
	continuationsName: string
): string {
	const entries = uniqueRegistryEntries(graph.clientIslands);
	const islands = entries.map((entry) => {
		return `  ${JSON.stringify(entry.name)}: __exactLazyIsland(() => import(${JSON.stringify(runtimeModuleSpecifier(entry.module))}).then((module) => module[${JSON.stringify(entry.exportName)}]))`;
	});
	const continuationValues = continuationDescriptorValues(
		graph.artifacts.flatMap((artifact) => artifact.manifest.continuations),
		true
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
		`const ${continuationsName} = __exactDefineRegistration({`,
		`  continuations: ${JSON.stringify(continuations, null, 2)}`,
		'}).continuations;',
		''
	].join('\n');
}

function continuationDescriptorValues(
	continuations: readonly ExactContinuationIR[],
	client: boolean
): readonly Record<string, unknown>[] {
	return continuations.map((continuation) => ({
		kind: continuation.kind,
		id: continuation.id,
		componentId: continuation.componentId,
		readiness: continuation.readiness,
		dependencies: continuation.activation.dependencies.map(({ source }) => ({ source })),
		stateReads: continuation.activation.stateReads.map(statePathDescriptor),
		stateWrites: continuation.effects.stateWrites.map(statePathDescriptor),
		publicContexts: continuation.activation.publicContexts.map((context) => context.token),
		serverContexts: client
			? []
			: continuation.activation.serverContexts.map((context) => context.token),
		contextWrites: continuation.effects.contextWrites.map((context) => context.token),
		serverContextWrites: client
			? []
			: continuation.effects.serverContextWrites.map((context) => context.token),
		boundaries: continuation.effects.boundaries,
		...(continuation.invocation
			? {
					invocation: {
						arguments: continuation.invocation.arguments.map(({ source }) => ({ source })),
						concurrency: continuation.invocation.concurrency
					}
				}
			: {})
	}));
}

function statePathDescriptor(
	effect: ExactContinuationIR['activation']['stateReads'][number]
): Record<string, unknown> {
	return {
		path: effect.path,
		kind: effect.kind,
		confidence: effect.confidence
	};
}

function clientRegistrySymbol(
	symbol: ExactSymbolIR,
	continuationComponents: ReadonlySet<string>
): symbol is ExactSymbolIR & { exportName: string } {
	if (!symbol.exportName) return false;
	return (
		(symbol.target === 'client' &&
			(symbol.role === 'client-island' ||
				(symbol.role === 'root' &&
					symbol.kind === 'component' &&
					symbol.placement === 'client'))) ||
		(symbol.target === 'both' &&
			symbol.role === 'root' &&
			symbol.kind === 'component' &&
			!!symbol.componentId &&
			continuationComponents.has(symbol.componentId))
	);
}

function createNamedRegistryModule(
	entries: readonly (ClientIslandRegistryEntry | ServerPartRegistryEntry)[],
	exportName: string
): string {
	const sorted = uniqueRegistryEntries(entries);
	const imports: string[] = [];
	const properties: string[] = [];
	sorted.forEach((entry, index) => {
		const local = `__exactRegistry${index}`;
		imports.push(
			`import { ${entry.exportName} as ${local} } from ${JSON.stringify(entry.module)};`
		);
		properties.push(`  ${JSON.stringify(entry.name)}: ${local}`);
	});
	return `${imports.join('\n')}\n\nexport const ${exportName} = {\n${properties.join(',\n')}\n};\n`;
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
