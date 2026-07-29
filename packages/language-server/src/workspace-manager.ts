import {
	createExactLanguageService,
	type ExactLanguageService,
	type ExactLanguageServiceOptions,
	type ExactLanguageServiceUpdate,
	type ExactRefactorPlan,
	type ExactRefactorRequest,
	type ExactSourceInspection
} from '@exactjs/compiler';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type WorkspaceState = {
	root: string;
	service: ExactLanguageService;
	documents: Map<string, number>;
};

/** Result of synchronizing one LSP document into its owning compiler project. */
export type ExactDocumentSynchronization = Readonly<{
	update: ExactLanguageServiceUpdate;
	inspection: ExactSourceInspection;
}>;

/** Optional service factory used by protocol hosts and focused ownership tests. */
export type ExactLanguageWorkspaceManagerHost = Readonly<{
	createLanguageService?(options: ExactLanguageServiceOptions): ExactLanguageService;
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
		return Object.freeze({ update, inspection });
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
		const workspace = this.workspaces.get(normalized);
		if (!workspace) return;
		this.workspaces.delete(normalized);
		await workspace.service.dispose();
	}

	/** Disposes every native language session owned by the server. */
	async dispose(): Promise<void> {
		if (this.disposed) return;
		this.disposed = true;
		const services = [...this.workspaces.values()].map((workspace) => workspace.service);
		this.workspaces.clear();
		await Promise.all(services.map((service) => service.dispose()));
	}

	private workspaceForUri(uri: string): WorkspaceState | undefined {
		if (!this.trusted || !uri.startsWith('file:')) return undefined;
		const filename = path.resolve(fileURLToPath(uri));
		const configuredRoot = this.roots.find(
			(candidate) => filename === candidate || filename.startsWith(`${candidate}${path.sep}`)
		);
		const root = configuredRoot ?? path.dirname(filename);
		let workspace = this.workspaces.get(root);
		if (!workspace) {
			workspace = {
				root,
				service: this.createLanguageService({
					root,
					noEmit: true,
					projectKind: configuredRoot ? 'configured' : 'inferred'
				}),
				documents: new Map()
			};
			this.workspaces.set(root, workspace);
		}
		return workspace;
	}

	private assertActive(): void {
		if (this.disposed) throw new Error('The eXact language workspace manager has been disposed');
	}
}
