import type { ExactConfig } from '@exactjs/config';
import { loadExactConfig, type ExactLoadedConfig } from '@exactjs/config/node';
import type { ExactPluginHostMode, ExactRuntimePluginExtension } from '@exactjs/plugin-api';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
	resolveExactPluginConfigurations,
	type ExactConfigTransformReport,
	type ExactResolvedPluginConfiguration
} from './configuration.js';
import { discoverExactPlugins, type ExactPluginDiscoveryResult } from './discovery.js';
import { createExactPackageGraph, findUp, type ExactPackageGraph } from './graph.js';
import { importPublicPackageEntry } from './modules.js';
import { validateExactRuntimeExtensions } from './runtime.js';

/** Configures prepare exact plugin registry. */
export interface PrepareExactPluginRegistryOptions {
	readonly applicationRoot?: string;
	readonly configPath?: string;
	readonly config?: ExactConfig;
	/** Neutral config load shared by build policy consumers before plugin preparation. */
	readonly loadedConfig?: ExactLoadedConfig;
	readonly environment?: string;
	readonly hostMode?: ExactPluginHostMode;
	/** Optional positive preparation deadline in milliseconds. Omission leaves expiration to signal. */
	readonly timeoutMs?: number;
	readonly signal?: AbortSignal;
	readonly graph?: ExactPackageGraph;
	readonly syncTypes?: boolean;
}

/** Defines the exact prepared plugin registry interface contract. */
export interface ExactPreparedPluginRegistry {
	readonly applicationRoot: string;
	readonly config?: ExactConfig;
	readonly configPath?: string;
	readonly environment: string;
	readonly hostMode: ExactPluginHostMode;
	readonly discovery: ExactPluginDiscoveryResult;
	readonly build: ReadonlyMap<string, unknown>;
	readonly server: ReadonlyMap<string, unknown>;
	readonly render: ReadonlyMap<string, unknown>;
	readonly client: ReadonlyMap<string, unknown>;
	readonly testing: ReadonlyMap<string, unknown>;
	readonly runtime: ReadonlyMap<ExactPluginHostMode, readonly ExactRuntimePluginExtension[]>;
	readonly reports: readonly ExactConfigTransformReport[];
	readonly warnings: readonly string[];
	readonly watchFiles: readonly string[];
}

const registryCache = new Map<string, Promise<ExactPreparedPluginRegistry>>();
const maximumCachedRegistries = 64;

/**
 * Loads application config and prepares mode-specific plugin projections and runtime extensions.
 * Callers own cancellation through signal, or an explicit positive timeoutMs. No deadline is implicit.
 * Build adapters normally call this entry and invalidate cached preparations when watched inputs change.
 */
export async function prepareExactPluginRegistry(
	options: PrepareExactPluginRegistryOptions = {}
): Promise<ExactPreparedPluginRegistry> {
	options = capturePreparationOptions(options);
	assertPreparationActive(options.signal);
	const applicationRoot = resolveApplicationRoot(options);
	const loaded =
		options.loadedConfig ??
		(options.config
			? {
					config: options.config,
					...(options.configPath ? { configPath: path.resolve(options.configPath) } : {}),
					watchFiles: options.configPath ? [path.resolve(options.configPath)] : []
				}
			: await loadExactConfig({ applicationRoot, configPath: options.configPath }));
	// Configuration loading yields before this owner installs its abort listener.
	assertPreparationActive(options.signal);
	const configPath = loaded.configPath;
	const environment = options.environment ?? process.env.NODE_ENV ?? 'development';
	const hostMode = options.hostMode ?? 'build';
	const key = JSON.stringify([
		applicationRoot,
		configPath,
		environment,
		hostMode,
		options.syncTypes !== false,
		preparationTimeout(options.timeoutMs)
	]);
	if (!options.graph && !options.config && !options.loadedConfig && !options.signal) {
		const cached = registryCache.get(key);
		if (cached) {
			registryCache.delete(key);
			registryCache.set(key, cached);
			return cached;
		}
	}
	const promise = prepareUncached({
		...options,
		applicationRoot,
		configPath,
		config: loaded.config,
		configWatchFiles: loaded.watchFiles,
		environment,
		hostMode
	});
	if (!options.graph && !options.config && !options.loadedConfig && !options.signal)
		registryCache.set(key, promise);
	while (registryCache.size > maximumCachedRegistries)
		registryCache.delete(registryCache.keys().next().value!);
	try {
		return await promise;
	} catch (error) {
		if (registryCache.get(key) === promise) registryCache.delete(key);
		throw error;
	}
}

/** Performs the invalidate exact plugin registry domain operation. */
export function invalidateExactPluginRegistry(applicationRoot?: string): void {
	if (!applicationRoot) {
		registryCache.clear();
		return;
	}
	const root = path.resolve(applicationRoot);
	// The application root is the first member of each private JSON cache key.
	const prefix = `[${JSON.stringify(root)},`;
	for (const key of registryCache.keys()) if (key.startsWith(prefix)) registryCache.delete(key);
}

/** Performs the sync exact plugin types domain operation. */
export async function syncExactPluginTypes(
	options: PrepareExactPluginRegistryOptions = {}
): Promise<string> {
	const registry = await prepareExactPluginRegistry({
		...capturePreparationOptions(options),
		syncTypes: false
	});
	return writePluginTypes(registry.applicationRoot, registry.discovery);
}

async function prepareUncached(
	options: PrepareExactPluginRegistryOptions & {
		applicationRoot: string;
		configPath?: string;
		configWatchFiles: readonly string[];
		environment: string;
		hostMode: ExactPluginHostMode;
	}
): Promise<ExactPreparedPluginRegistry> {
	const timeoutMs = preparationTimeout(options.timeoutMs);
	const controller = new AbortController();
	const onAbort = () => controller.abort(options.signal?.reason);
	options.signal?.addEventListener('abort', onAbort, { once: true });
	const timer =
		timeoutMs === undefined
			? undefined
			: setTimeout(
					() => controller.abort(new Error(`Plugin registry preparation exceeded ${timeoutMs}ms`)),
					timeoutMs
				);
	try {
		const config = options.config;
		const graph = options.graph ?? createExactPackageGraph(options.applicationRoot);
		const discovery = discoverExactPlugins(graph, config?.pluginDiscovery);
		const resolution = await abortable(
			resolveExactPluginConfigurations(discovery, {
				applicationConfig: config,
				applicationRoot: options.applicationRoot,
				environment: options.environment,
				hostMode: options.hostMode,
				signal: controller.signal
			}),
			controller.signal
		);
		assertPreparationActive(controller.signal);
		const runtime = await abortable(
			loadRuntimeExtensions(resolution.plugins, controller.signal),
			controller.signal
		);
		assertPreparationActive(controller.signal);
		if (options.hostMode === 'server') {
			for (const extension of runtime.get('server') ?? []) {
				assertPreparationActive(controller.signal);
				await abortable(validateExactRuntimeExtensions([extension]), controller.signal);
			}
			assertPreparationActive(controller.signal);
		}
		const registry: ExactPreparedPluginRegistry = {
			applicationRoot: options.applicationRoot,
			...(config ? { config } : {}),
			configPath: options.configPath,
			environment: options.environment,
			hostMode: options.hostMode,
			discovery,
			build: projectionMap(resolution.plugins, 'build'),
			server: projectionMap(resolution.plugins, 'server'),
			render: projectionMap(resolution.plugins, 'render'),
			client: projectionMap(resolution.plugins, 'client'),
			testing: projectionMap(resolution.plugins, 'testing'),
			runtime,
			reports: resolution.reports,
			warnings: discovery.warnings,
			watchFiles: discoverWatchFiles(
				options.applicationRoot,
				options.configWatchFiles,
				graph,
				discovery
			)
		};
		assertPreparationActive(controller.signal);
		if (options.syncTypes !== false) await writePluginTypes(options.applicationRoot, discovery);
		assertPreparationActive(controller.signal);
		return registry;
	} finally {
		if (timer !== undefined) clearTimeout(timer);
		options.signal?.removeEventListener('abort', onAbort);
	}
}

async function loadRuntimeExtensions(
	resolved: ReadonlyMap<string, ExactResolvedPluginConfiguration>,
	signal: AbortSignal
): Promise<ReadonlyMap<ExactPluginHostMode, readonly ExactRuntimePluginExtension[]>> {
	const modes = ['server', 'render', 'client', 'testing'] as const;
	const result = new Map<ExactPluginHostMode, readonly ExactRuntimePluginExtension[]>();
	for (const mode of modes) {
		const extensions: ExactRuntimePluginExtension[] = [];
		for (const value of [...resolved.values()].sort((left, right) =>
			left.plugin.packageName.localeCompare(right.plugin.packageName)
		)) {
			assertPreparationActive(signal);
			const subpath = value.plugin.declaration.entries[mode];
			const projection = value[mode];
			if (!subpath || projection === undefined) continue;
			const module = await importPublicPackageEntry(value.plugin.node, subpath);
			assertPreparationActive(signal);
			const factory = module.default ?? module.createExtension;
			const extension = typeof factory === 'function' ? await factory(projection) : factory;
			assertPreparationActive(signal);
			if (!extension || typeof extension !== 'object') {
				throw new Error(
					`${value.plugin.packageName} ${mode} entry must export an extension or extension factory`
				);
			}
			extensions.push(extension as ExactRuntimePluginExtension);
		}
		result.set(mode, extensions);
	}
	return result;
}

function projectionMap(
	resolved: ReadonlyMap<string, ExactResolvedPluginConfiguration>,
	key: 'build' | 'server' | 'render' | 'client' | 'testing'
): ReadonlyMap<string, unknown> {
	return new Map(
		[...resolved].flatMap(([name, value]) => (value[key] === undefined ? [] : [[name, value[key]]]))
	);
}

async function writePluginTypes(
	applicationRoot: string,
	discovery: ExactPluginDiscoveryResult
): Promise<string> {
	const directory = path.join(applicationRoot, '.exact');
	const target = path.join(directory, 'plugins.d.ts');
	const references = [...discovery.plugins.values()]
		.filter((plugin) => plugin.declaration.entries.configTypes)
		.sort((left, right) => left.packageName.localeCompare(right.packageName))
		.map((plugin) => {
			const subpath = plugin.declaration.entries.configTypes!;
			const specifier =
				subpath === '.' ? plugin.packageName : `${plugin.packageName}${subpath.slice(1)}`;
			return `/// <reference types="${specifier}" />`;
		});
	const contents = ['// Generated by @exactjs/plugin-host. Do not edit.', ...references, ''].join(
		'\n'
	);
	if (!references.length) {
		if (existsSync(target)) {
			const existing = await readFile(target, 'utf8');
			if (existing.startsWith('// Generated by @exactjs/plugin-host.'))
				await rm(target, { force: true });
		}
		return target;
	}
	if (existsSync(target) && (await readFile(target, 'utf8')) === contents) return target;
	await mkdir(directory, { recursive: true });
	const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
	await writeFile(temporary, contents);
	await rename(temporary, target);
	return target;
}

function discoverWatchFiles(
	applicationRoot: string,
	configWatchFiles: readonly string[],
	graph: ExactPackageGraph,
	discovery: ExactPluginDiscoveryResult
): readonly string[] {
	const files = new Set<string>();
	for (const configWatchFile of configWatchFiles) files.add(configWatchFile);
	files.add(path.join(applicationRoot, 'package.json'));
	try {
		files.add(findUp(applicationRoot, 'package-lock.json'));
	} catch {}
	for (const participant of discovery.participants.values())
		files.add(path.join(participant.node.location, 'package.json'));
	for (const plugin of discovery.plugins.values())
		files.add(path.join(plugin.node.location, 'package.json'));
	return [...files].sort();
}

function resolveApplicationRoot(options: PrepareExactPluginRegistryOptions): string {
	if (options.applicationRoot) return path.resolve(options.applicationRoot);
	if (options.configPath) return path.dirname(path.resolve(options.configPath));
	return path.dirname(findUp(process.cwd(), 'package.json'));
}

/** Captures declared options before config loading can yield or caller aliases can change. */
function capturePreparationOptions(
	options: PrepareExactPluginRegistryOptions
): PrepareExactPluginRegistryOptions {
	const {
		applicationRoot,
		configPath,
		config,
		loadedConfig,
		environment,
		hostMode,
		timeoutMs,
		signal,
		graph,
		syncTypes
	} = options;
	return {
		applicationRoot,
		configPath,
		config,
		loadedConfig,
		environment,
		hostMode,
		timeoutMs,
		signal,
		graph,
		syncTypes
	} satisfies Record<keyof PrepareExactPluginRegistryOptions, unknown>;
}

function preparationTimeout(value: number | undefined): number | undefined {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise<T>((resolve, reject) => {
		const abort = () => reject(signal.reason);
		signal.addEventListener('abort', abort, { once: true });
		promise.then(
			(value) => {
				signal.removeEventListener('abort', abort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', abort);
				reject(error);
			}
		);
	});
}

/** Fences preparation at asynchronous boundaries before starting further plugin work. */
function assertPreparationActive(signal: AbortSignal | undefined): void {
	if (signal?.aborted) throw signal.reason;
}
