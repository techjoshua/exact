import type { ExactConfig } from '@exactjs/config';
import type {
	ExactPluginConfigContext,
	ExactPluginConfigController,
	ExactPluginConfigTransform,
	ExactPluginHostMode
} from '@exactjs/plugin-api';
import { performance } from 'node:perf_hooks';
import { validRange } from 'semver';
import type {
	ExactConfigurationContributor,
	ExactPluginDiscoveryResult,
	ExactSelectedPlugin
} from './discovery.js';
import { packageName, packageVersion, type ExactPackageNode } from './graph.js';
import { importPublicPackageEntry } from './modules.js';
import { planConfigurationContributors } from './configuration-ordering.js';

/** Defines the exact config transform report interface contract. */
export interface ExactConfigTransformReport {
	readonly plugin: string;
	readonly contributor: string;
	readonly version: string;
	readonly export: string;
	readonly index: number;
	readonly durationMs: number;
	readonly outcome: 'mutated' | 'replaced';
}

/** Configures exact resolved plugin. */
export interface ExactResolvedPluginConfiguration {
	readonly plugin: ExactSelectedPlugin;
	readonly build?: unknown;
	readonly server?: unknown;
	readonly render?: unknown;
	readonly client?: unknown;
	readonly testing?: unknown;
	readonly language?: unknown;
}

/** Defines the exact configuration resolution interface contract. */
export interface ExactConfigurationResolution {
	readonly plugins: ReadonlyMap<string, ExactResolvedPluginConfiguration>;
	readonly reports: readonly ExactConfigTransformReport[];
}

/** Configures exact configuration. */
export interface ExactConfigurationOptions {
	readonly applicationConfig?: ExactConfig;
	readonly applicationRoot: string;
	readonly environment: string;
	readonly hostMode: ExactPluginHostMode;
	readonly signal: AbortSignal;
}

/** Runs defaults, dependency-ordered contributors and application transforms before projecting plugin configuration. */
export async function resolveExactPluginConfigurations(
	discovery: ExactPluginDiscoveryResult,
	options: ExactConfigurationOptions
): Promise<ExactConfigurationResolution> {
	const plugins = new Map<string, ExactResolvedPluginConfiguration>();
	const reports: ExactConfigTransformReport[] = [];
	for (const selected of [...discovery.plugins.values()].sort((left, right) =>
		left.packageName.localeCompare(right.packageName)
	)) {
		throwIfAborted(options.signal);
		const entry = selected.declaration.entries.config;
		const controller = entry
			? controllerFromModule(
					await importPublicPackageEntry(selected.node, entry),
					selected.packageName
				)
			: noConfigController();
		throwIfAborted(options.signal);
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
		throwIfAborted(options.signal);
		plugins.set(selected.packageName, resolved);
	}
	return { plugins, reports };
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
	const pluginPaths =
		pluginParticipant?.activationPaths ?? selected.requirements.map((value) => value.path);
	const contextFor = (
		contributor: ExactPluginConfigContext['contributor'] = {
			packageName: selected.packageName,
			version: selected.version
		},
		activationPaths = pluginPaths,
		orderingAfter?: readonly string[]
	): ExactPluginConfigContext => ({
		plugin: { packageName: selected.packageName, version: selected.version },
		contributor,
		applicationRoot: options.applicationRoot,
		environment: options.environment,
		hostMode: options.hostMode,
		signal: options.signal,
		executionIndex,
		provenance: {
			activationPaths: activationPaths.map((path) => [...path]),
			orderingAfter: orderingAfter ? [...orderingAfter] : []
		}
	});
	throwIfAborted(options.signal);
	let current = (await controller.defaults(contextFor())) as T;
	throwIfAborted(options.signal);
	if (current === undefined)
		throw new Error(`Plugin ${selected.packageName} defaults returned undefined`);
	const plan = planConfigurationContributors(discovery, contributors);
	/** Applies a transform while retaining private report identity and cancellation ownership. */
	const applyTransform = async (
		transform: ExactPluginConfigTransform<T>,
		context: ExactPluginConfigContext,
		identity: Pick<ExactConfigTransformReport, 'contributor' | 'version' | 'export'>,
		failure: string
	): Promise<void> => {
		const start = performance.now();
		let result: T | undefined;
		try {
			result = await transform(current, context);
		} catch (error) {
			throwIfAborted(options.signal);
			throw new Error(failure, { cause: error });
		}
		throwIfAborted(options.signal);
		if (result !== undefined) {
			current = result;
			controller.structuralValidate?.(current, context);
		}
		reports.push({
			plugin: selected.packageName,
			...identity,
			index: executionIndex++,
			durationMs: performance.now() - start,
			outcome: result === undefined ? 'mutated' : 'replaced'
		});
	};
	for (const contributor of plan.ordered) {
		throwIfAborted(options.signal);
		const transform = await loadTransform<T>(contributor);
		throwIfAborted(options.signal);
		const name = packageName(contributor.node);
		const version = packageVersion(contributor.node);
		const exported = `${contributor.declaration.subpath}#${contributor.declaration.export}`;
		await applyTransform(
			transform,
			contextFor(
				{ packageName: name, version },
				discovery.participants.get(contributor.node.id)!.activationPaths,
				plan.orderingAfter.get(contributor.node.id)
			),
			{ contributor: name, version, export: exported },
			`Plugin configuration failed for ${selected.packageName} at ${name} ${exported}`
		);
	}
	throwIfAborted(options.signal);
	const configKey = selected.declaration.configKey;
	const rootTransform =
		options.applicationConfig?.plugins?.[configKey as keyof NonNullable<ExactConfig['plugins']>];
	if (rootTransform === false) {
		throw new Error(
			`Root configuration disables active plugin ${selected.packageName}. Ignore its package instead`
		);
	}
	if (typeof rootTransform === 'function') {
		const name = packageName(discovery.root);
		const version = applicationVersion(discovery.root);
		await applyTransform(
			rootTransform as unknown as ExactPluginConfigTransform<T>,
			contextFor(
				{ packageName: name, version },
				[[name]],
				plan.ordered.map((value) => packageName(value.node))
			),
			{ contributor: name, version, export: 'exact.config.ts' },
			`Root configuration failed for plugin ${selected.packageName}`
		);
	}
	throwIfAborted(options.signal);
	const finalContext = contextFor();
	const validation = await controller.validate(current, finalContext);
	throwIfAborted(options.signal);
	if (validation !== undefined)
		throw new Error(`Plugin ${selected.packageName} validate() must return undefined`);
	const [build, server, render, client, testing, language] = await Promise.all([
		options.hostMode === 'build' ? controller.buildConfig?.(current, finalContext) : undefined,
		options.hostMode === 'server' ? controller.serverConfig?.(current, finalContext) : undefined,
		options.hostMode === 'server' || options.hostMode === 'render'
			? controller.renderConfig?.(current, finalContext)
			: undefined,
		options.hostMode === 'client' ? controller.clientConfig?.(current, finalContext) : undefined,
		options.hostMode === 'testing' ? controller.testingConfig?.(current, finalContext) : undefined,
		controller.languageConfig?.(current, finalContext)
	]);
	throwIfAborted(options.signal);
	if (build !== undefined) assertJsonSafe(build, `${selected.packageName} build configuration`);
	if (language !== undefined)
		assertJsonSafe(language, `${selected.packageName} language configuration`);
	return {
		plugin: selected,
		build,
		server,
		render,
		client,
		testing,
		language
	};
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
		// JSON duplicates sibling references. Only a reference to an active ancestor is a cycle.
		seen.delete(item);
	};
	visit(value);
}

function throwIfAborted(signal: AbortSignal): void {
	if (signal.aborted) throw signal.reason;
}

function applicationVersion(node: ExactPackageNode): string {
	return typeof node.manifest.version === 'string' && node.manifest.version
		? node.manifest.version
		: '0.0.0';
}
