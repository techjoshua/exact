import type { ExactLanguageExtensionsConfig } from '@exactjs/config';
import {
	exactLanguageProtocolLimits,
	type ExactLanguageAnalyzerCapability,
	type ExactLanguageCodeActionV1,
	type ExactLanguageCompletionV1,
	type ExactLanguageDiagnosticV1,
	type ExactLanguageHoverV1,
	type ExactLanguageInlayHintV1,
	type ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';
import type {
	ExactHostedLanguageDiagnostic,
	ExactLanguageDocumentContribution,
	ExactLanguageExtensionHost,
	ExactLanguageProviderDescriptor,
	ExactLanguageProviderStatus
} from './contracts.js';
import { discoverExactLanguageProviders } from './discovery.js';
import { ProviderConnection } from './provider-connection.js';
import {
	compareHostedDiagnostics,
	assertJsonValue,
	matchesDiagnosticSelector,
	projectFor,
	providerStatusProvenance,
	providerConfiguration,
	roleIgnored,
	throwIfAborted,
	validateDiagnostic,
	validateInteractiveResult
} from './language-result-policy.js';

import {
	evaluateDeclarativeCompletions,
	evaluateDeclarativeDiagnostics,
	evaluateDeclarativeHover
} from './declarative-evaluator.js';

/** Options for one workspace-owned language-extension host. */
export interface CreateExactLanguageExtensionHostOptions {
	readonly workspaceRoot: string;
	readonly locale?: string;
	readonly config?: ExactLanguageExtensionsConfig;
}

/** Creates the shared development-time host used by editor and compilation integrations. */
export function createExactLanguageExtensionHost(
	options: CreateExactLanguageExtensionHostOptions
): ExactLanguageExtensionHost {
	return new NodeExactLanguageExtensionHost(options);
}

class NodeExactLanguageExtensionHost implements ExactLanguageExtensionHost {
	private readonly providers = new Map<string, ProviderConnection>();
	private readonly descriptors = new Map<string, ExactLanguageProviderDescriptor>();
	private disposed = false;

	constructor(private readonly options: CreateExactLanguageExtensionHostOptions) {}

	async synchronizeProviders(packageNames: readonly string[], signal?: AbortSignal): Promise<void> {
		this.assertActive();
		throwIfAborted(signal);
		const descriptors = await discoverExactLanguageProviders(
			this.options.workspaceRoot,
			packageNames,
			this.options.config
		);
		const next = new Set(descriptors.map((descriptor) => descriptor.key));
		for (const [key, provider] of this.providers) {
			if (next.has(key)) continue;
			this.providers.delete(key);
			await provider.dispose();
		}
		for (const key of this.descriptors.keys()) if (!next.has(key)) this.descriptors.delete(key);
		for (const descriptor of descriptors) {
			this.descriptors.set(descriptor.key, descriptor);
			if (!descriptor.entry || this.providers.has(descriptor.key)) continue;
			const configuration = providerConfiguration(this.options.config, descriptor.id);
			assertJsonValue(configuration, `languageExtensions.providers.${descriptor.id}`);
			this.providers.set(
				descriptor.key,
				new ProviderConnection(descriptor, this.options, configuration)
			);
		}
	}

	async diagnostics(
		projection: ExactLanguageProjectionV1,
		signal?: AbortSignal
	): Promise<ExactLanguageDocumentContribution> {
		const settled = await Promise.allSettled(
			this.enabled('diagnostics').map(async (provider) => {
				const values = await provider.request<readonly ExactLanguageDiagnosticV1[]>(
					'diagnostics',
					{ projection: projectFor(provider.descriptor, projection), scope: 'document' },
					exactLanguageProtocolLimits.documentDiagnosticMilliseconds,
					signal
				);
				try {
					if (
						!Array.isArray(values) ||
						values.length > exactLanguageProtocolLimits.documentDiagnostics
					)
						throw new Error('Language provider exceeded the document diagnostic result limit');
					return values.flatMap((diagnostic) =>
						this.applyDiagnosticPolicy(provider.descriptor, projection, diagnostic)
					);
				} catch (error) {
					provider.rejectResult(error);
					throw error;
				}
			})
		);
		const diagnostics = [
			...this.declarativeDiagnostics(projection),
			...settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
		];
		diagnostics.sort(compareHostedDiagnostics);
		return Object.freeze({ diagnostics: Object.freeze(diagnostics), statuses: this.status() });
	}

	complete(
		projection: ExactLanguageProjectionV1,
		position: number,
		trigger?: string,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageCompletionV1 }>[]> {
		return this.collect<ExactLanguageCompletionV1>(
			'completions',
			projection,
			{ position, trigger },
			signal
		).then((values) =>
			Object.freeze([...this.declarativeCompletions(projection, position), ...values])
		);
	}

	hover(
		projection: ExactLanguageProjectionV1,
		position: number,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageHoverV1 }>[]> {
		return this.collect<ExactLanguageHoverV1>('hover', projection, { position }, signal).then(
			(values) => Object.freeze([...this.declarativeHovers(projection, position), ...values])
		);
	}

	inlayHints(
		projection: ExactLanguageProjectionV1,
		range: Readonly<{ start: number; end: number }>,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageInlayHintV1 }>[]> {
		return this.collect('inlayHints', projection, { range }, signal);
	}

	codeActions(
		projection: ExactLanguageProjectionV1,
		range: Readonly<{ start: number; end: number }>,
		diagnostics: readonly string[],
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageCodeActionV1 }>[]> {
		return this.collect('codeActions', projection, { range, diagnostics }, signal);
	}

	status(): readonly ExactLanguageProviderStatus[] {
		return Object.freeze(
			[...this.descriptors.values()]
				.map(
					(descriptor) =>
						this.providers.get(descriptor.key)?.status() ??
						Object.freeze({
							id: descriptor.id,
							version: descriptor.version,
							trust: descriptor.trust,
							capabilities: descriptor.capabilities,
							...providerStatusProvenance(descriptor, this.options.config),
							health: 'ready' as const,
							generation: 0
						})
				)
				.sort((left, right) => left.id.localeCompare(right.id))
		);
	}

	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const providers = [...this.providers.values()];
		this.providers.clear();
		this.descriptors.clear();
		await Promise.all(providers.map((provider) => provider.dispose()));
	}

	private enabled(capability: ExactLanguageAnalyzerCapability): ProviderConnection[] {
		this.assertActive();
		return [...this.providers.values()].filter(
			(provider) =>
				provider.descriptor.capabilities.includes(capability) &&
				!roleIgnored(this.options.config, provider.descriptor, capability)
		);
	}

	private async collect<T>(
		capability: Exclude<ExactLanguageAnalyzerCapability, 'diagnostics'>,
		projection: ExactLanguageProjectionV1,
		params: Record<string, unknown>,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: T }>[]> {
		const settled = await Promise.allSettled(
			this.enabled(capability).map(async (provider) => {
				const value = await provider.request<T | readonly T[]>(
					capability,
					{ projection: projectFor(provider.descriptor, projection), ...params },
					capability === 'inlayHints'
						? exactLanguageProtocolLimits.inlayHintMilliseconds
						: exactLanguageProtocolLimits.interactiveMilliseconds,
					signal,
					false
				);
				try {
					const items = Array.isArray(value) ? value : value ? [value] : [];
					validateInteractiveResult(capability, projection, items);
					return items.map((item) =>
						Object.freeze({ provider: provider.descriptor.id, value: item as T })
					);
				} catch (error) {
					provider.rejectResult(error);
					throw error;
				}
			})
		);
		return Object.freeze(
			settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
		);
	}

	private declarativeDiagnostics(
		projection: ExactLanguageProjectionV1
	): ExactHostedLanguageDiagnostic[] {
		return [...this.descriptors.values()].flatMap((descriptor) => {
			const contribution = descriptor.declarative?.contribution;
			if (!contribution || roleIgnored(this.options.config, descriptor, 'diagnostics')) return [];
			return evaluateDeclarativeDiagnostics(contribution, projection).flatMap((diagnostic) =>
				this.applyDiagnosticPolicy(descriptor, projection, diagnostic)
			);
		});
	}

	private declarativeCompletions(
		projection: ExactLanguageProjectionV1,
		position: number
	): Readonly<{ provider: string; value: ExactLanguageCompletionV1 }>[] {
		return [...this.descriptors.values()].flatMap((descriptor) => {
			const contribution = descriptor.declarative?.contribution;
			if (!contribution || roleIgnored(this.options.config, descriptor, 'completions')) return [];
			return evaluateDeclarativeCompletions(contribution, projection, position).map((value) => ({
				provider: descriptor.id,
				value
			}));
		});
	}

	private declarativeHovers(
		projection: ExactLanguageProjectionV1,
		position: number
	): Readonly<{ provider: string; value: ExactLanguageHoverV1 }>[] {
		return [...this.descriptors.values()].flatMap((descriptor) => {
			const contribution = descriptor.declarative?.contribution;
			if (!contribution || roleIgnored(this.options.config, descriptor, 'hover')) return [];
			const value = evaluateDeclarativeHover(contribution, projection, position);
			return value ? [{ provider: descriptor.id, value }] : [];
		});
	}

	private applyDiagnosticPolicy(
		provider: ExactLanguageProviderDescriptor,
		projection: ExactLanguageProjectionV1,
		diagnostic: ExactLanguageDiagnosticV1
	): ExactHostedLanguageDiagnostic[] {
		validateDiagnostic(projection, diagnostic);
		const path = projection.document.path
			.slice(this.options.workspaceRoot.length)
			.replaceAll('\\', '/')
			.replace(/^\//, '');
		if (
			(this.options.config?.diagnostics?.ignore ?? []).some((selector) =>
				matchesDiagnosticSelector(selector, provider.id, diagnostic.code, path)
			)
		)
			return [];
		let severity = diagnostic.severity;
		for (const selector of this.options.config?.diagnostics?.severity ?? [])
			if (matchesDiagnosticSelector(selector, provider.id, diagnostic.code, path))
				severity = selector.severity;
		return [
			Object.freeze({
				provider: provider.id,
				providerVersion: provider.version,
				generation: projection.generation,
				diagnostic: Object.freeze({ ...diagnostic, severity })
			})
		];
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('The language-extension host has been disposed');
	}
}
