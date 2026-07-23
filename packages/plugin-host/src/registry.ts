import type { ExactConfig } from '@exactjs/config';
import type {
	ExactPluginHostMode,
	ExactPreparedCompilerPlugin,
	ExactPreparedCompilerRegistry,
	ExactRuntimePluginExtension
} from '@exactjs/plugin-api';
import { createHash } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import {
	resolveExactPluginConfigurations,
	type ExactConfigTransformReport,
	type ExactResolvedPluginConfiguration
} from './configuration.js';
import { discoverExactPlugins, type ExactPluginDiscoveryResult } from './discovery.js';
import { createExactPackageGraph, findUp, packageName, type ExactPackageGraph } from './graph.js';
import { importPublicPackageEntry } from './modules.js';
import { validateExactRuntimeExtensions } from './runtime.js';

/** Configures prepare exact plugin registry. */
export interface PrepareExactPluginRegistryOptions {
	readonly applicationRoot?: string;
	readonly configPath?: string;
	readonly config?: ExactConfig;
	readonly environment?: string;
	readonly hostMode?: ExactPluginHostMode;
	readonly timeoutMs?: number;
	readonly signal?: AbortSignal;
	readonly graph?: ExactPackageGraph;
	readonly syncTypes?: boolean;
}

/** Defines the exact prepared plugin registry interface contract. */
export interface ExactPreparedPluginRegistry {
	readonly applicationRoot: string;
	readonly configPath?: string;
	readonly environment: string;
	readonly hostMode: ExactPluginHostMode;
	readonly discovery: ExactPluginDiscoveryResult;
	readonly compiler: ExactPreparedCompilerRegistry;
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

/** Performs the prepare exact plugin registry domain operation. */
export async function prepareExactPluginRegistry(
	options: PrepareExactPluginRegistryOptions = {}
): Promise<ExactPreparedPluginRegistry> {
	const applicationRoot = resolveApplicationRoot(options);
	const configPath = options.configPath
		? path.resolve(options.configPath)
		: findExactConfig(applicationRoot);
	const environment = options.environment ?? process.env.NODE_ENV ?? 'development';
	const hostMode = options.hostMode ?? 'compiler';
	const key = JSON.stringify([applicationRoot, configPath, environment, hostMode]);
	if (!options.graph && !options.config && !options.signal) {
		const cached = registryCache.get(key);
		if (cached) return cached;
	}
	const promise = prepareUncached({
		...options,
		applicationRoot,
		configPath,
		environment,
		hostMode
	});
	if (!options.graph && !options.config && !options.signal) registryCache.set(key, promise);
	try {
		return await promise;
	} catch (error) {
		registryCache.delete(key);
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
	for (const key of registryCache.keys())
		if (key.includes(JSON.stringify(root).slice(1, -1))) registryCache.delete(key);
}

/** Performs the sync exact plugin types domain operation. */
export async function syncExactPluginTypes(
	options: PrepareExactPluginRegistryOptions = {}
): Promise<string> {
	const registry = await prepareExactPluginRegistry({ ...options, syncTypes: false });
	return writePluginTypes(registry.applicationRoot, registry.discovery);
}

async function prepareUncached(
	options: PrepareExactPluginRegistryOptions & {
		applicationRoot: string;
		configPath?: string;
		environment: string;
		hostMode: ExactPluginHostMode;
	}
): Promise<ExactPreparedPluginRegistry> {
	const timeoutMs = positiveTimeout(options.timeoutMs);
	const controller = new AbortController();
	const onAbort = () => controller.abort(options.signal?.reason);
	options.signal?.addEventListener('abort', onAbort, { once: true });
	const timer = setTimeout(
		() => controller.abort(new Error(`Plugin registry preparation exceeded ${timeoutMs}ms`)),
		timeoutMs
	);
	try {
		const config = options.config ?? (await loadExactConfig(options.configPath));
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
		if (controller.signal.aborted) {
			throw controller.signal.reason instanceof Error
				? controller.signal.reason
				: new Error('Plugin registry preparation aborted');
		}
		const compiler = createCompilerRegistry(resolution.plugins, discovery);
		const runtime = await loadRuntimeExtensions(resolution.plugins);
		if (options.hostMode === 'server') {
			await validateExactRuntimeExtensions(runtime.get('server') ?? []);
		}
		const registry: ExactPreparedPluginRegistry = Object.freeze({
			applicationRoot: options.applicationRoot,
			configPath: options.configPath,
			environment: options.environment,
			hostMode: options.hostMode,
			discovery,
			compiler,
			server: projectionMap(resolution.plugins, 'server'),
			render: projectionMap(resolution.plugins, 'render'),
			client: projectionMap(resolution.plugins, 'client'),
			testing: projectionMap(resolution.plugins, 'testing'),
			runtime,
			reports: resolution.reports,
			warnings: discovery.warnings,
			watchFiles: discoverWatchFiles(options.applicationRoot, options.configPath, graph, discovery)
		});
		if (options.syncTypes !== false) await writePluginTypes(options.applicationRoot, discovery);
		return registry;
	} finally {
		clearTimeout(timer);
		options.signal?.removeEventListener('abort', onAbort);
	}
}

function createCompilerRegistry(
	resolved: ReadonlyMap<string, ExactResolvedPluginConfiguration>,
	discovery: ExactPluginDiscoveryResult
): ExactPreparedCompilerRegistry {
	const plugins: Record<string, ExactPreparedCompilerPlugin> = {};
	const fingerprintInput: unknown[] = [];
	for (const [name, value] of [...resolved].sort(([left], [right]) => left.localeCompare(right))) {
		if (!value.compiler) continue;
		const contributors = discovery.contributors
			.filter((contributor) => contributor.plugin === name)
			.map(
				(contributor) =>
					`${packageName(contributor.node)}:${contributor.declaration.subpath}#${contributor.declaration.export}`
			)
			.sort();
		plugins[name] = Object.freeze({
			packageName: name,
			version: value.plugin.version,
			protocolVersion: value.plugin.declaration.protocolVersion,
			required: value.plugin.requirements.some((requirement) => requirement.required),
			cacheKey: value.compiler.cacheKey,
			extension: value.compiler.extension
		});
		fingerprintInput.push({
			name,
			version: value.plugin.version,
			protocolVersion: value.plugin.declaration.protocolVersion,
			compilerEntry: value.plugin.declaration.entries.compiler,
			cacheKey: value.compiler.cacheKey,
			contributors
		});
	}
	const fingerprint = createHash('sha256').update(stableJson(fingerprintInput)).digest('hex');
	return Object.freeze({ fingerprint, plugins: Object.freeze(plugins) });
}

async function loadRuntimeExtensions(
	resolved: ReadonlyMap<string, ExactResolvedPluginConfiguration>
): Promise<ReadonlyMap<ExactPluginHostMode, readonly ExactRuntimePluginExtension[]>> {
	const modes: ExactPluginHostMode[] = ['server', 'render', 'client', 'testing'];
	const result = new Map<ExactPluginHostMode, readonly ExactRuntimePluginExtension[]>();
	for (const mode of modes) {
		const extensions: ExactRuntimePluginExtension[] = [];
		for (const value of [...resolved.values()].sort((left, right) =>
			left.plugin.packageName.localeCompare(right.plugin.packageName)
		)) {
			const subpath = value.plugin.declaration.entries[mode];
			const projection = value[mode];
			if (!subpath || projection === undefined) continue;
			const module = await importPublicPackageEntry(value.plugin.node, subpath);
			const factory = module.default ?? module.createExtension;
			const extension = typeof factory === 'function' ? await factory(projection) : factory;
			if (!extension || typeof extension !== 'object') {
				throw new Error(
					`${value.plugin.packageName} ${mode} entry must export an extension or extension factory`
				);
			}
			extensions.push(extension as ExactRuntimePluginExtension);
		}
		result.set(mode, Object.freeze(extensions));
	}
	return result;
}

function projectionMap(
	resolved: ReadonlyMap<string, ExactResolvedPluginConfiguration>,
	key: 'server' | 'render' | 'client' | 'testing'
): ReadonlyMap<string, unknown> {
	return new Map(
		[...resolved].flatMap(([name, value]) => (value[key] === undefined ? [] : [[name, value[key]]]))
	);
}

async function loadExactConfig(configPath: string | undefined): Promise<ExactConfig | undefined> {
	if (!configPath) return undefined;
	let imported: Record<string, unknown>;
	if (/\.[cm]?ts$/i.test(configPath)) {
		const source = await readFile(configPath, 'utf8');
		const output = ts.transpileModule(source, {
			compilerOptions: {
				target: ts.ScriptTarget.ES2022,
				module: ts.ModuleKind.ESNext,
				moduleResolution: ts.ModuleResolutionKind.Bundler,
				verbatimModuleSyntax: true
			},
			fileName: configPath,
			reportDiagnostics: true
		});
		const errors =
			output.diagnostics?.filter(
				(diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
			) ?? [];
		if (errors.length) {
			throw new Error(
				`Unable to transpile ${configPath}: ${errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n')}`
			);
		}
		const temporary = path.join(
			path.dirname(configPath),
			`.exact-config-${process.pid}-${Date.now()}.mjs`
		);
		try {
			await writeFile(temporary, output.outputText, { flag: 'wx' });
			imported = await nativeImport(`${pathToFileURL(temporary).href}?t=${Date.now()}`);
		} finally {
			await rm(temporary, { force: true });
		}
	} else {
		imported = await nativeImport(
			`${pathToFileURL(configPath).href}?t=${statSync(configPath).mtimeMs}`
		);
	}
	const config = imported.default;
	if (!config || typeof config !== 'object' || Array.isArray(config)) {
		throw new Error(`${configPath} must default-export an eXact configuration object`);
	}
	return config as ExactConfig;
}

async function nativeImport(specifier: string): Promise<Record<string, unknown>> {
	return import(
		/* @vite-ignore */
		/* webpackIgnore: true */
		specifier
	) as Promise<Record<string, unknown>>;
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
	configPath: string | undefined,
	graph: ExactPackageGraph,
	discovery: ExactPluginDiscoveryResult
): readonly string[] {
	const files = new Set<string>();
	if (configPath) files.add(configPath);
	files.add(path.join(applicationRoot, 'package.json'));
	try {
		files.add(findUp(applicationRoot, 'package-lock.json'));
	} catch {}
	for (const participant of discovery.participants.values())
		files.add(path.join(participant.node.location, 'package.json'));
	for (const plugin of discovery.plugins.values())
		files.add(path.join(plugin.node.location, 'package.json'));
	return Object.freeze([...files].sort());
}

function resolveApplicationRoot(options: PrepareExactPluginRegistryOptions): string {
	if (options.applicationRoot) return path.resolve(options.applicationRoot);
	if (options.configPath) return path.dirname(path.resolve(options.configPath));
	const config = findExactConfig(process.cwd());
	if (config) return path.dirname(config);
	return path.dirname(findUp(process.cwd(), 'package.json'));
}

function findExactConfig(cwd: string): string | undefined {
	let directory = path.resolve(cwd);
	const names = [
		'exact.config.ts',
		'exact.config.mts',
		'exact.config.js',
		'exact.config.mjs',
		'exact.config.cjs'
	];
	while (true) {
		for (const name of names) {
			const candidate = path.join(directory, name);
			if (existsSync(candidate)) return candidate;
		}
		const parent = path.dirname(directory);
		if (parent === directory) return undefined;
		directory = parent;
	}
}

function stableJson(value: unknown): string {
	return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(sortJson);
	if (!value || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value as Record<string, unknown>)
			.sort(([left], [right]) => left.localeCompare(right))
			.map(([key, child]) => [key, sortJson(child)])
	);
}

function positiveTimeout(value: number | undefined): number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 30_000;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(signal.reason);
	return new Promise<T>((resolve, reject) => {
		const abort = () =>
			reject(
				signal.reason instanceof Error
					? signal.reason
					: new Error('Plugin registry preparation aborted')
			);
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
