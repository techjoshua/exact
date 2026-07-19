import { performance } from 'node:perf_hooks';
import type { ExactConfig } from '@exact/config';
import type {
	ExactCompilerPluginConfig,
	ExactPluginConfigContext,
	ExactPluginConfigController,
	ExactPluginConfigTransform,
	ExactPluginHostMode
} from '@exact/plugin-api';
import { satisfies, validRange } from 'semver';
import { packageName, packageVersion, type ExactPackageNode } from './graph.js';
import type {
	ExactConfigurationContributor,
	ExactPluginDiscoveryResult,
	ExactSelectedPlugin
} from './discovery.js';
import { importPublicPackageEntry } from './modules.js';

export interface ExactConfigTransformReport {
	readonly plugin: string;
	readonly contributor: string;
	readonly version: string;
	readonly export: string;
	readonly index: number;
	readonly durationMs: number;
	readonly outcome: 'mutated' | 'replaced';
}

export interface ExactResolvedPluginConfiguration {
	readonly plugin: ExactSelectedPlugin;
	readonly compiler?: ExactCompilerPluginConfig;
	readonly server?: unknown;
	readonly render?: unknown;
	readonly client?: unknown;
	readonly testing?: unknown;
}

export interface ExactConfigurationResolution {
	readonly plugins: ReadonlyMap<string, ExactResolvedPluginConfiguration>;
	readonly reports: readonly ExactConfigTransformReport[];
}

export interface ExactConfigurationOptions {
	readonly applicationConfig?: ExactConfig;
	readonly applicationRoot: string;
	readonly environment: string;
	readonly hostMode: ExactPluginHostMode;
	readonly signal: AbortSignal;
}

export async function resolveExactPluginConfigurations(
	discovery: ExactPluginDiscoveryResult,
	options: ExactConfigurationOptions
): Promise<ExactConfigurationResolution> {
	const plugins = new Map<string, ExactResolvedPluginConfiguration>();
	const reports: ExactConfigTransformReport[] = [];
	for (const selected of [...discovery.plugins.values()].sort((left, right) =>
		left.packageName.localeCompare(right.packageName)
	)) {
		const entry = selected.declaration.entries.config;
		const controller = entry
			? controllerFromModule(
					await importPublicPackageEntry(selected.node, entry),
					selected.packageName
				)
			: noConfigController();
		const contributors = discovery.contributors.filter(
			(value) => value.plugin === selected.packageName
		);
		const resolved = await resolveOnePlugin(
			discovery,
			selected,
			controller,
			contributors,
			options,
			reports
		);
		plugins.set(selected.packageName, resolved);
	}
	return Object.freeze({ plugins, reports: Object.freeze(reports) });
}

function noConfigController<T>(): ExactPluginConfigController<T> {
	return {
		defaults: () => ({}) as T,
		validate: () => undefined
	};
}

async function resolveOnePlugin<T>(
	discovery: ExactPluginDiscoveryResult,
	selected: ExactSelectedPlugin,
	controller: ExactPluginConfigController<T>,
	contributors: readonly ExactConfigurationContributor[],
	options: ExactConfigurationOptions,
	reports: ExactConfigTransformReport[]
): Promise<ExactResolvedPluginConfiguration> {
	let executionIndex = 0;
	const pluginParticipant = discovery.participants.get(selected.node.id);
	const baseContext = (): ExactPluginConfigContext =>
		Object.freeze({
			plugin: Object.freeze({ packageName: selected.packageName, version: selected.version }),
			contributor: Object.freeze({ packageName: selected.packageName, version: selected.version }),
			applicationRoot: options.applicationRoot,
			environment: options.environment,
			hostMode: options.hostMode,
			signal: options.signal,
			executionIndex,
			provenance: Object.freeze({
				activationPaths:
					pluginParticipant?.activationPaths ?? selected.requirements.map((value) => value.path),
				orderingAfter: Object.freeze([])
			})
		});
	let current = (await controller.defaults(baseContext())) as T;
	if (current === undefined)
		throw new Error(`Plugin ${selected.packageName} defaults returned undefined`);
	const ordered = orderContributors(discovery, contributors);
	for (const contributor of ordered) {
		throwIfAborted(options.signal);
		const transform = await loadTransform<T>(contributor);
		const contributorParticipant = discovery.participants.get(contributor.node.id)!;
		const context: ExactPluginConfigContext = Object.freeze({
			...baseContext(),
			contributor: Object.freeze({
				packageName: packageName(contributor.node),
				version: packageVersion(contributor.node)
			}),
			executionIndex,
			provenance: Object.freeze({
				activationPaths: contributorParticipant.activationPaths,
				orderingAfter: Object.freeze(
					contributingDescendants(discovery, contributor.node.id, contributors)
						.map((node) => packageName(node))
						.sort()
				)
			})
		});
		const start = performance.now();
		let result: T | undefined;
		try {
			result = await transform(current, context);
		} catch (error) {
			throw new Error(
				`Plugin configuration failed for ${selected.packageName} at ${packageName(contributor.node)} ${contributor.declaration.subpath}#${contributor.declaration.export}`,
				{ cause: error }
			);
		}
		if (result !== undefined) {
			current = result as T;
			controller.structuralValidate?.(current, context);
		}
		reports.push(
			Object.freeze({
				plugin: selected.packageName,
				contributor: packageName(contributor.node),
				version: packageVersion(contributor.node),
				export: `${contributor.declaration.subpath}#${contributor.declaration.export}`,
				index: executionIndex++,
				durationMs: performance.now() - start,
				outcome: result === undefined ? 'mutated' : 'replaced'
			})
		);
	}
	const configKey = selected.declaration.configKey;
	const rootTransform =
		options.applicationConfig?.plugins?.[configKey as keyof NonNullable<ExactConfig['plugins']>];
	if (rootTransform === false) {
		throw new Error(
			`Root configuration disables active plugin ${selected.packageName}; ignore its package instead`
		);
	}
	if (typeof rootTransform === 'function') {
		const context: ExactPluginConfigContext = Object.freeze({
			...baseContext(),
			contributor: Object.freeze({
				packageName: packageName(discovery.root),
				version: applicationVersion(discovery.root)
			}),
			executionIndex,
			provenance: Object.freeze({
				activationPaths: Object.freeze([[packageName(discovery.root)]]),
				orderingAfter: Object.freeze(ordered.map((value) => packageName(value.node)))
			})
		});
		const start = performance.now();
		let result: T | undefined;
		try {
			result = await (rootTransform as unknown as ExactPluginConfigTransform<T>)(current, context);
		} catch (error) {
			throw new Error(`Root configuration failed for plugin ${selected.packageName}`, {
				cause: error
			});
		}
		if (result !== undefined) {
			current = result as T;
			controller.structuralValidate?.(current, context);
		}
		reports.push(
			Object.freeze({
				plugin: selected.packageName,
				contributor: packageName(discovery.root),
				version: applicationVersion(discovery.root),
				export: 'exact.config.ts',
				index: executionIndex++,
				durationMs: performance.now() - start,
				outcome: result === undefined ? 'mutated' : 'replaced'
			})
		);
	}
	const finalContext = baseContext();
	const validation = await controller.validate(current, finalContext);
	if (validation !== undefined)
		throw new Error(`Plugin ${selected.packageName} validate() must return undefined`);
	const [compiler, server, render, client, testing] = await Promise.all([
		controller.compilerConfig?.(current, finalContext),
		options.hostMode === 'server' ? controller.serverConfig?.(current, finalContext) : undefined,
		options.hostMode === 'server' || options.hostMode === 'render'
			? controller.renderConfig?.(current, finalContext)
			: undefined,
		options.hostMode === 'client' ? controller.clientConfig?.(current, finalContext) : undefined,
		options.hostMode === 'testing' ? controller.testingConfig?.(current, finalContext) : undefined
	]);
	if (compiler) assertJsonSafe(compiler.cacheKey, `${selected.packageName} compiler cache key`);
	return Object.freeze({
		plugin: selected,
		compiler,
		server,
		render,
		client,
		testing
	});
}

function orderContributors(
	discovery: ExactPluginDiscoveryResult,
	contributors: readonly ExactConfigurationContributor[]
): ExactConfigurationContributor[] {
	const byId = new Map(contributors.map((value) => [value.node.id, value]));
	const remaining = new Set(byId.keys());
	const completed = new Set<string>();
	const result: ExactConfigurationContributor[] = [];
	while (remaining.size) {
		const ready = [...remaining]
			.filter((id) =>
				contributingDescendantIds(discovery, id, byId).every((descendant) =>
					completed.has(descendant)
				)
			)
			.sort((left, right) =>
				packageName(byId.get(left)!.node).localeCompare(packageName(byId.get(right)!.node))
			);
		if (!ready.length) {
			throw new Error(
				`Plugin configuration contributor graph contains a cycle: ${[...remaining].map((id) => packageName(byId.get(id)!.node)).join(', ')}`
			);
		}
		for (const id of ready) {
			remaining.delete(id);
			completed.add(id);
			result.push(byId.get(id)!);
		}
	}
	return result;
}

function contributingDescendants(
	discovery: ExactPluginDiscoveryResult,
	id: string,
	contributors: readonly ExactConfigurationContributor[]
): ExactPackageNode[] {
	const byId = new Map(contributors.map((value) => [value.node.id, value.node]));
	return contributingDescendantIds(discovery, id, byId).map((value) => byId.get(value)!);
}

function contributingDescendantIds<T>(
	discovery: ExactPluginDiscoveryResult,
	id: string,
	contributors: ReadonlyMap<string, T>
): string[] {
	const result = new Set<string>();
	const seen = new Set<string>();
	const pending = [...(discovery.participantEdges.get(id) ?? [])];
	while (pending.length) {
		const child = pending.shift()!;
		if (seen.has(child)) continue;
		seen.add(child);
		if (contributors.has(child)) result.add(child);
		pending.push(...(discovery.participantEdges.get(child) ?? []));
	}
	return [...result];
}

async function loadTransform<T>(
	contributor: ExactConfigurationContributor
): Promise<ExactPluginConfigTransform<T>> {
	if (contributor.declaration.version && !validRange(contributor.declaration.version)) {
		throw new Error(
			`${packageName(contributor.node)} declares invalid plugin configuration version range ${contributor.declaration.version}`
		);
	}
	const module = await importPublicPackageEntry(contributor.node, contributor.declaration.subpath);
	const value = module[contributor.declaration.export];
	if (typeof value !== 'function') {
		throw new Error(
			`${packageName(contributor.node)} does not export ${contributor.declaration.export} from ${contributor.declaration.subpath}`
		);
	}
	return value as ExactPluginConfigTransform<T>;
}

function controllerFromModule<T>(
	module: Record<string, unknown>,
	packageNameValue: string
): ExactPluginConfigController<T> {
	const value = module.default ?? module.controller;
	if (!value || typeof value !== 'object') {
		throw new Error(
			`${packageNameValue} config entry must export a default controller or named controller`
		);
	}
	const controller = value as Partial<ExactPluginConfigController<T>>;
	if (typeof controller.defaults !== 'function' || typeof controller.validate !== 'function') {
		throw new Error(
			`${packageNameValue} config controller must implement defaults() and validate()`
		);
	}
	return controller as ExactPluginConfigController<T>;
}

function assertJsonSafe(value: unknown, label: string): void {
	const seen = new Set<object>();
	const visit = (item: unknown): void => {
		if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
		if (typeof item === 'number' && Number.isFinite(item)) return;
		if (typeof item !== 'object' || seen.has(item)) throw new Error(`${label} must be JSON-safe`);
		seen.add(item);
		if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)
			throw new Error(`${label} must be JSON-safe`);
		for (const child of Object.values(item as Record<string, unknown>)) visit(child);
	};
	visit(value);
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted)
		throw signal.reason instanceof Error
			? signal.reason
			: new Error('Plugin registry preparation aborted');
}

function applicationVersion(node: ExactPackageNode): string {
	return typeof node.manifest.version === 'string' && node.manifest.version
		? node.manifest.version
		: '0.0.0';
}
