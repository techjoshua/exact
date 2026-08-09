import {
	createExactLanguageService,
	type ExactLanguageService,
	type ExactLanguageServiceOptions,
	type ExactLanguageServiceUpdate,
	type ExactRefactorPlan,
	type ExactRefactorRequest,
	type ExactSourceInspection
} from '@exactjs/compiler';
import {
	findExactConfig,
	loadExactConfig,
	loadExactPackageEnhancements
} from '@exactjs/config/node';
import type { ExactPackageEnhancementImport } from '@exactjs/config';
import type {
	ExactLanguageCodeActionV1,
	ExactLanguageCompletionV1,
	ExactLanguageHoverV1,
	ExactLanguageInlayHintV1,
	ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';
import {
	createExactLanguageExtensionHost,
	type ExactHostedLanguageDiagnostic,
	type ExactLanguageExtensionHost,
	type ExactLanguageProviderStatus
} from '@exactjs/language-extension-host';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { relevantLanguageProviderPackages } from './provider-relevance.js';

type WorkspaceState = {
	root: string;
	workspaceRoot?: string;
	service: ExactLanguageService;
	documents: Map<string, number>;
	languageHost: Promise<ExactLanguageExtensionHost>;
	packageEnhancements: readonly ExactPackageEnhancementImport[];
	providerFailure?: string;
};

/** Result of synchronizing one LSP document into its owning compiler project. */
export type ExactDocumentSynchronization = Readonly<{
	update: ExactLanguageServiceUpdate;
	inspection: ExactSourceInspection;
	providerDiagnostics: readonly ExactHostedLanguageDiagnostic[];
}>;

/** Optional service factory used by protocol hosts and focused ownership tests. */
export type ExactLanguageWorkspaceManagerHost = Readonly<{
	createLanguageService?(options: ExactLanguageServiceOptions): ExactLanguageService;
	createLanguageExtensionHost?(root: string): Promise<ExactLanguageExtensionHost>;
}>;

/**
 * Resolves files to deterministic workspace services and owns their disposal.
 *
 * Untrusted managers never instantiate the compiler because doing so may load
 * a workspace-selected binary or configuration.
 */
export class ExactLanguageWorkspaceManager {
	private readonly roots: string[];
	private readonly trusted: boolean;
	private readonly createLanguageService: (
		options: ExactLanguageServiceOptions
	) => ExactLanguageService;
	private readonly workspaces = new Map<string, WorkspaceState>();
	private readonly createLanguageExtensionHost: (
		root: string
	) => Promise<ExactLanguageExtensionHost>;
	private disposed = false;

	constructor(
		roots: readonly string[],
		trusted: boolean,
		host: ExactLanguageWorkspaceManagerHost = {}
	) {
		this.roots = [...new Set(roots.map((root) => path.resolve(root)))].sort(
			(left, right) => right.length - left.length
		);
		this.trusted = trusted;
		this.createLanguageService = host.createLanguageService ?? createExactLanguageService;
		this.createLanguageExtensionHost =
			host.createLanguageExtensionHost ??
			(async (root) => {
				const loaded = await loadExactConfig({ applicationRoot: root });
				return createExactLanguageExtensionHost({
					workspaceRoot: root,
					config: loaded.config?.languageExtensions
				});
			});
	}

	/** Reports whether semantic compiler execution is enabled for the workspace. */
	isTrusted(): boolean {
		return this.trusted;
	}

	/** Adds a newly opened multi-root workspace folder for future ownership resolution. */
	addRoot(root: string): void {
		const normalized = path.resolve(root);
		if (!this.roots.includes(normalized)) this.roots.push(normalized);
		this.roots.sort((left, right) => right.length - left.length);
	}

	/** Synchronizes the newest document text and returns its compiler inspection. */
	async synchronizeDocument(
		uri: string,
		version: number,
		source: string,
		signal?: AbortSignal
	): Promise<ExactDocumentSynchronization | undefined> {
		this.assertActive();
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return undefined;
		const filename = fileURLToPath(uri);
		const current = workspace.documents.get(filename);
		if (current !== undefined && current >= version) return undefined;
		workspace.documents.set(filename, version);
		const update = await workspace.service.synchronize(
			[{ kind: 'upsert', filename, version, source }],
			signal
		);
		if (workspace.documents.get(filename) !== version) return undefined;
		const inspection = await workspace.service.inspect(filename, undefined, signal);
		if (workspace.documents.get(filename) !== version) return undefined;
		const projection = projectionForDocument(inspection.languageProjection, version);
		let providerDiagnostics: readonly ExactHostedLanguageDiagnostic[] = [];
		try {
			const languageHost = await workspace.languageHost;
			await languageHost.synchronizeProviders(
				relevantLanguageProviderPackages(projection, workspace.packageEnhancements),
				signal
			);
			providerDiagnostics = (await languageHost.diagnostics(projection, signal)).diagnostics;
			workspace.providerFailure = undefined;
		} catch (error) {
			if (signal?.aborted) throw error;
			workspace.providerFailure = errorMessage(error);
		}
		if (workspace.documents.get(filename) !== version) return undefined;
		return Object.freeze({
			update,
			inspection: Object.freeze({ ...inspection, languageProjection: projection }),
			providerDiagnostics
		});
	}

	/** Releases an unsaved overlay and restores the disk-backed project snapshot. */
	async closeDocument(uri: string, signal?: AbortSignal): Promise<void> {
		this.assertActive();
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return;
		const filename = fileURLToPath(uri);
		workspace.documents.delete(filename);
		await workspace.service.synchronize([{ kind: 'close', filename }], signal);
	}

	/** Returns the current compiler inspection for an open or disk-backed file. */
	async inspect(uri: string, signal?: AbortSignal): Promise<ExactSourceInspection | undefined> {
		this.assertActive();
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return undefined;
		return workspace.service.inspect(fileURLToPath(uri), undefined, signal);
	}

	/** Queries enabled package providers for completions at one UTF-16 source offset. */
	async complete(
		uri: string,
		position: number,
		trigger?: string,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageCompletionV1 }>[]> {
		return this.languageRequest(uri, (host, projection) =>
			host.complete(projection, position, trigger, signal)
		);
	}

	/** Queries enabled package providers for semantic hover information. */
	async hover(
		uri: string,
		position: number,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageHoverV1 }>[]> {
		return this.languageRequest(uri, (host, projection) =>
			host.hover(projection, position, signal)
		);
	}

	/** Queries enabled package providers for visible-range inlay hints. */
	async inlayHints(
		uri: string,
		range: Readonly<{ start: number; end: number }>,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageInlayHintV1 }>[]> {
		return this.languageRequest(uri, (host, projection) =>
			host.inlayHints(projection, range, signal)
		);
	}

	/** Queries enabled package providers for validated data-only source actions. */
	async languageCodeActions(
		uri: string,
		range: Readonly<{ start: number; end: number }>,
		diagnostics: readonly string[],
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageCodeActionV1 }>[]> {
		return this.languageRequest(uri, (host, projection) =>
			host.codeActions(projection, range, diagnostics, signal)
		);
	}

	/** Returns package-provider provenance and health for the owning workspace. */
	async providerStatus(uri: string): Promise<readonly ExactLanguageProviderStatus[]> {
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return [];
		try {
			return (await workspace.languageHost).status();
		} catch (error) {
			workspace.providerFailure = errorMessage(error);
			return [];
		}
	}

	/** Returns a host-level provider failure that could not be attributed to one provider. */
	providerFailure(uri: string): string | undefined {
		return this.workspaceForUri(uri)?.providerFailure;
	}

	/** Returns a compiler-verified refactor plan for the current document generation. */
	async refactor(
		uri: string,
		request: Omit<ExactRefactorRequest, 'filename'>,
		signal?: AbortSignal
	): Promise<ExactRefactorPlan | undefined> {
		this.assertActive();
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return undefined;
		return workspace.service.refactor({ ...request, filename: fileURLToPath(uri) }, signal);
	}

	/** Removes and disposes a workspace root after a multi-root folder change. */
	async removeRoot(root: string): Promise<void> {
		const normalized = path.resolve(root);
		const rootIndex = this.roots.indexOf(normalized);
		if (rootIndex >= 0) this.roots.splice(rootIndex, 1);
		const removed = [...this.workspaces.entries()].filter(
			([, workspace]) => workspace.workspaceRoot === normalized
		);
		for (const [projectRoot] of removed) this.workspaces.delete(projectRoot);
		await Promise.all(
			removed.flatMap(([, workspace]) => [
				workspace.service.dispose(),
				workspace.languageHost.then((host) => host.dispose())
			])
		);
	}

	/** Disposes every native language session owned by the server. */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const services = [...this.workspaces.values()].map((workspace) => workspace.service);
		const languageHosts = [...this.workspaces.values()].map((workspace) => workspace.languageHost);
		this.workspaces.clear();
		await Promise.all([
			...services.map((service) => service.dispose()),
			...languageHosts.map(async (host) => (await host).dispose())
		]);
	}

	private workspaceForUri(uri: string): WorkspaceState | undefined {
		if (!this.trusted || !uri.startsWith('file:')) return undefined;
		const filename = path.resolve(fileURLToPath(uri));
		const configuredRoot = this.roots.find(
			(candidate) => filename === candidate || filename.startsWith(`${candidate}${path.sep}`)
		);
		const configPath = findExactConfig(path.dirname(filename), configuredRoot);
		const root = configPath ? path.dirname(configPath) : (configuredRoot ?? path.dirname(filename));
		let workspace = this.workspaces.get(root);
		if (!workspace) {
			const packageEnhancements = loadExactPackageEnhancements({
				applicationRoot: root
			}).packageEnhancements;
			workspace = {
				root,
				...(configuredRoot ? { workspaceRoot: configuredRoot } : {}),
				service: this.createLanguageService({
					root,
					noEmit: true,
					projectKind: configuredRoot ? 'configured' : 'inferred',
					packageEnhancements
				}),
				documents: new Map(),
				languageHost: this.createLanguageExtensionHost(root),
				packageEnhancements
			};
			this.workspaces.set(root, workspace);
		}
		return workspace;
	}

	private async languageRequest<T>(
		uri: string,
		request: (host: ExactLanguageExtensionHost, projection: ExactLanguageProjectionV1) => Promise<T>
	): Promise<T | readonly []> {
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return [];
		const filename = fileURLToPath(uri);
		const inspection = await workspace.service.inspect(filename);
		const projection = projectionForDocument(
			inspection.languageProjection,
			workspace.documents.get(filename) ?? inspection.languageProjection.document.version
		);
		try {
			const host = await workspace.languageHost;
			await host.synchronizeProviders(
				relevantLanguageProviderPackages(projection, workspace.packageEnhancements)
			);
			const result = await request(host, projection);
			workspace.providerFailure = undefined;
			return result;
		} catch (error) {
			workspace.providerFailure = errorMessage(error);
			return [];
		}
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('The eXact language workspace manager has been disposed');
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function projectionForDocument(
	projection: ExactLanguageProjectionV1,
	version: number
): ExactLanguageProjectionV1 {
	return Object.freeze({
		...projection,
		document: Object.freeze({ ...projection.document, version })
	});
}
