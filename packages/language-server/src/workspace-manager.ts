import {
	createExactLanguageService,
	NativeCompilerLanguageClient,
	resolveNativeCompilerExecutable,
	type ExactLanguageService,
	type ExactLanguageServiceOptions,
	type ExactLanguageServiceUpdate,
	type ExactRefactorPlan,
	type ExactRefactorRequest,
	type ExactSourceInspection
} from '@exactjs/compiler';
import { loadExactConfig } from '@exactjs/config/node';
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
import type {
	DocumentState,
	WorkspaceState,
	WorkspaceInput,
	WorkspaceEntry
} from './workspace/state.js';
import { createWorkspaceProject, lookupWorkspaceProject } from './workspace/project.js';
import {
	reconcileWorkspaceFolders,
	type WorkspaceFolderOutcome
} from './workspace/folder-reconciliation.js';
import {
	disposeWorkspaces,
	finishWorkspacePreparation,
	prepareWorkspaceInput,
	reserveUnavailableWorkspace
} from './workspace/input-preparation.js';
import {
	finalizeWorkspaceSynchronization,
	inspectWorkspaceDocument
} from './workspace/synchronization.js';
import { fileURLToPath } from 'node:url';
import { providerFailureMessage, requestWorkspaceProviders } from './workspace/provider-request.js';

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
	private readonly workspaces = new Map<string, WorkspaceEntry>();
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
		this.createLanguageService =
			host.createLanguageService ??
			((options) =>
				createExactLanguageService(options, {
					nativeClient: new NativeCompilerLanguageClient({
						executable: resolveNativeCompilerExecutable(options.root)
					})
				}));
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

	/**
	 * Adds a folder for future routing only. This void operation does not transfer open inputs or
	 * retire pending requests. Hosts with unsaved documents should use reconcileWorkspaceFolders.
	 */
	addRoot(root: string): void {
		const normalized = path.resolve(root);
		if (!this.roots.includes(normalized)) this.roots.push(normalized);
		this.roots.sort((left, right) => right.length - left.length);
	}

	/**
	 * Migrates current unsaved inputs when workspace folders change. The normal LSP server supplies
	 * actual open-document snapshots. Direct hosts must supply all their current open inputs too.
	 * Planning/retirement is synchronous. affectedInputs retains the original input references for
	 * caller readiness ownership, not publication authority. completion settles core preparation,
	 * final inspection/provider diagnostics and all retired resources. It resolves { results, errors },
	 * retaining successful current results and exact operational failures, including undefined/zero.
	 * Setup/core/finalization errors precede cleanup errors. Existing disposed entry still throws.
	 * Queries refuse during preparation. Core failure retires its replacement without automatic
	 * retry or disk-input fallback. An unavailable reservation owns the attempted cleanup until explicit
	 * input/reconciliation replaces it. A later reconciliation can reseed from current inputs. Identical net membership
	 * preserves compatible projects. For a root in both arrays, removal wins as with addRoot/removeRoot.
	 */
	reconcileWorkspaceFolders(
		change: Readonly<{ added: readonly string[]; removed: readonly string[] }>,
		inputs: readonly WorkspaceInput[]
	): Readonly<{
		affectedInputs: readonly WorkspaceInput[];
		completion: Promise<WorkspaceFolderOutcome>;
	}> {
		this.assertActive();
		if (!this.trusted)
			return { affectedInputs: [], completion: Promise.resolve({ results: [], errors: [] }) };
		return reconcileWorkspaceFolders(this.roots, this.workspaces, change, inputs, {
			create: (route) =>
				createWorkspaceProject(route, this.createLanguageService, this.createLanguageExtensionHost),
			owns: (workspace) => this.ownsWorkspace(workspace),
			retire: (workspace) => reserveUnavailableWorkspace(this.workspaces, workspace),
			finalize: (workspace, filename, document, update) =>
				finalizeWorkspaceSynchronization(workspace, filename, document.version, update, () =>
					this.ownsDocument(workspace, filename, document)
				)
		});
	}

	/** Synchronizes the newest document text and returns its compiler inspection. */
	async synchronizeDocument(
		uri: string,
		version: number,
		source: string,
		signal?: AbortSignal
	): Promise<ExactDocumentSynchronization | undefined> {
		this.assertActive();
		const workspace = this.workspaceForUri(uri, 'edit');
		if (!workspace) return undefined;
		const filename = fileURLToPath(uri);
		const current = workspace.documents.get(filename);
		if (current !== undefined && current.version >= version) return undefined;
		const document = { version };
		workspace.documents.set(filename, document);
		let preparationFailed = false;
		try {
			const changes = [{ kind: 'upsert' as const, filename, version, source }];
			const update = workspace.preparation
				? await prepareWorkspaceInput(
						workspace,
						() =>
							workspace.documents.get(filename) === document
								? workspace.service.synchronize(changes, signal)
								: Promise.resolve(undefined),
						() => this.ownsWorkspace(workspace),
						() => {
							preparationFailed = this.ownsWorkspace(workspace);
							return reserveUnavailableWorkspace(this.workspaces, workspace);
						}
					)
				: await workspace.service.synchronize(changes, signal);
			await finishWorkspacePreparation(workspace);
			return update
				? await finalizeWorkspaceSynchronization(
						workspace,
						filename,
						document.version,
						update,
						() => this.ownsDocument(workspace, filename, document),
						signal
					)
				: undefined;
		} catch (error) {
			if (preparationFailed || signal?.aborted || this.ownsDocument(workspace, filename, document))
				throw error;
			return undefined;
		}
	}

	/** Releases an unsaved overlay and restores the disk-backed project snapshot. */
	async closeDocument(uri: string, signal?: AbortSignal): Promise<void> {
		this.assertActive();
		const workspace = this.workspaceForUri(uri, 'close');
		if (!workspace) return;
		const filename = fileURLToPath(uri);
		workspace.documents.delete(filename);
		if (workspace.preparation) {
			await prepareWorkspaceInput(
				workspace,
				() => workspace.service.synchronize([{ kind: 'close', filename }], signal),
				() => this.ownsWorkspace(workspace),
				() => reserveUnavailableWorkspace(this.workspaces, workspace)
			);
		} else await workspace.service.synchronize([{ kind: 'close', filename }], signal);
	}

	/** Returns the current compiler inspection for an open or disk-backed file. */
	async inspect(uri: string, signal?: AbortSignal): Promise<ExactSourceInspection | undefined> {
		this.assertActive();
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return undefined;
		const filename = fileURLToPath(uri);
		const document = workspace.documents.get(filename);
		return inspectWorkspaceDocument(
			workspace,
			filename,
			() => this.ownsDocument(workspace, filename, document),
			signal
		);
	}

	/**
	 * Reads core inspection and package inlays for one project/document capture and UTF-16 offset range.
	 * Returns undefined for untrusted/non-file input or retired work. A live empty or failed provider
	 * contribution retains inspection with an empty array and providerFailure(uri) status.
	 * Disposed entry, live native inspection failures and explicit cancellation rejections propagate.
	 * Data is current at the final manager check, without promising later transport delivery ordering.
	 */
	async inspectWithInlayHints(
		uri: string,
		range: Readonly<{ start: number; end: number }>,
		signal?: AbortSignal
	): Promise<
		| Readonly<{
				inspection: ExactSourceInspection;
				contributions: readonly Readonly<{ provider: string; value: ExactLanguageInlayHintV1 }>[];
		  }>
		| undefined
	> {
		this.assertActive();
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return undefined;
		const filename = fileURLToPath(uri);
		const document = workspace.documents.get(filename);
		const inspection = await inspectWorkspaceDocument(
			workspace,
			filename,
			() => this.ownsDocument(workspace, filename, document),
			signal
		);
		if (!inspection || !this.ownsDocument(workspace, filename, document)) return undefined;
		const contributions = await requestWorkspaceProviders(
			workspace,
			projectionForDocument(
				inspection.languageProjection,
				document?.version ?? inspection.languageProjection.document.version
			),
			(host, projection) => host.inlayHints(projection, range, signal),
			() => this.ownsDocument(workspace, filename, document),
			signal
		);
		return this.ownsDocument(workspace, filename, document)
			? { inspection, contributions }
			: undefined;
	}

	/** Queries enabled package providers for completions at one UTF-16 source offset. */
	async complete(
		uri: string,
		position: number,
		trigger?: string,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageCompletionV1 }>[]> {
		return this.languageRequest(
			uri,
			(host, projection) => host.complete(projection, position, trigger, signal),
			signal
		);
	}

	/** Queries enabled package providers for semantic hover information. */
	async hover(
		uri: string,
		position: number,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageHoverV1 }>[]> {
		return this.languageRequest(
			uri,
			(host, projection) => host.hover(projection, position, signal),
			signal
		);
	}

	/** Queries enabled package providers for visible-range inlay hints. */
	async inlayHints(
		uri: string,
		range: Readonly<{ start: number; end: number }>,
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageInlayHintV1 }>[]> {
		return this.languageRequest(
			uri,
			(host, projection) => host.inlayHints(projection, range, signal),
			signal
		);
	}

	/** Queries enabled package providers for validated data-only source actions. */
	async languageCodeActions(
		uri: string,
		range: Readonly<{ start: number; end: number }>,
		diagnostics: readonly string[],
		signal?: AbortSignal
	): Promise<readonly Readonly<{ provider: string; value: ExactLanguageCodeActionV1 }>[]> {
		return this.languageRequest(
			uri,
			(host, projection) => host.codeActions(projection, range, diagnostics, signal),
			signal
		);
	}

	/** Returns package-provider provenance and health for the owning workspace. */
	async providerStatus(uri: string): Promise<readonly ExactLanguageProviderStatus[]> {
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return [];
		try {
			const host = await workspace.languageHost;
			return this.ownsWorkspace(workspace) ? host.status() : [];
		} catch (error) {
			if (this.ownsWorkspace(workspace)) workspace.providerFailure = providerFailureMessage(error);
			return [];
		}
	}

	/** Returns a host-level provider failure that could not be attributed to one provider. */
	providerFailure(uri: string): string | undefined {
		return this.workspaceForUri(uri)?.providerFailure;
	}

	/**
	 * Returns the exact service plan only while its captured project/document remains current.
	 * Successful retired work returns undefined. Every service rejection propagates unchanged,
	 * including retired or cancelled work and ordinary primitive rejection values.
	 */
	async refactor(
		uri: string,
		request: Omit<ExactRefactorRequest, 'filename'>,
		signal?: AbortSignal
	): Promise<ExactRefactorPlan | undefined> {
		this.assertActive();
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return undefined;
		const filename = fileURLToPath(uri);
		const document = workspace.documents.get(filename);
		const plan = await workspace.service.refactor({ ...request, filename }, signal);
		return this.ownsDocument(workspace, filename, document) ? plan : undefined;
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
		await disposeWorkspaces(removed.map(([, workspace]) => workspace));
	}

	/** Disposes every native language session owned by the server. */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const retired = [...this.workspaces.values()];
		this.workspaces.clear();
		await disposeWorkspaces(retired);
	}

	private workspaceForUri(uri: string, input?: 'edit' | 'close'): WorkspaceState | undefined {
		if (this.disposed || !this.trusted || !uri.startsWith('file:')) return undefined;
		return lookupWorkspaceProject(
			this.roots,
			this.workspaces,
			uri,
			input,
			this.createLanguageService,
			this.createLanguageExtensionHost
		);
	}

	private async languageRequest<T>(
		uri: string,
		request: (
			host: ExactLanguageExtensionHost,
			projection: ExactLanguageProjectionV1
		) => Promise<T>,
		signal?: AbortSignal
	): Promise<T | readonly []> {
		const workspace = this.workspaceForUri(uri);
		if (!workspace) return [];
		const filename = fileURLToPath(uri);
		const document = workspace.documents.get(filename);
		const inspection = await inspectWorkspaceDocument(
			workspace,
			filename,
			() => this.ownsDocument(workspace, filename, document),
			signal
		);
		if (!inspection || !this.ownsDocument(workspace, filename, document)) return [];
		return requestWorkspaceProviders(
			workspace,
			projectionForDocument(
				inspection.languageProjection,
				document?.version ?? inspection.languageProjection.document.version
			),
			request,
			() => this.ownsDocument(workspace, filename, document),
			signal
		);
	}

	/** Refuses continuations from removed or replaced project records without changing future routing. */
	private ownsWorkspace(workspace: WorkspaceState): boolean {
		return !this.disposed && this.workspaces.get(workspace.root) === workspace;
	}

	/** Keeps each continuation on its exact project and accepted document synchronization. */
	private ownsDocument(
		workspace: WorkspaceState,
		filename: string,
		document: DocumentState | undefined
	): boolean {
		return (
			this.ownsWorkspace(workspace) &&
			!workspace.preparation &&
			workspace.documents.get(filename) === document
		);
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('The eXact language workspace manager has been disposed');
	}
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
