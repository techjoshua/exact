import type {
	ExactLanguageService,
	ExactLanguageServiceOptions,
	ExactSourceInspection
} from '@exactjs/compiler';
import type { ExactLanguageExtensionHost } from '@exactjs/language-extension-host';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, onTestFinished, vi } from 'vitest';
import { ExactLanguageWorkspaceManager } from '../workspace-manager.js';
/** Creates a data-only provider host for official manager injection. */
export function testLanguageHost(message?: string): ExactLanguageExtensionHost {
	return {
		async synchronizeProviders() {
			if (message) throw new Error(message);
		},
		async diagnostics() {
			return { diagnostics: [], statuses: [] };
		},
		async complete() {
			return [];
		},
		async hover() {
			return [];
		},
		async inlayHints() {
			return [];
		},
		async codeActions() {
			return [];
		},
		status() {
			return [];
		},
		async dispose() {}
	};
}

/** Models the existing source service interface without native execution. */
export class FakeLanguageService implements ExactLanguageService {
	readonly dispose = vi.fn(async () => undefined);
	private generation = 0;
	private filename = '';

	constructor(private readonly options: ExactLanguageServiceOptions) {}

	async synchronize(changes: Parameters<ExactLanguageService['synchronize']>[0]) {
		this.generation++;
		this.filename = changes[0]?.filename ?? this.filename;
		return {
			generation: this.generation,
			changedFiles: [this.filename],
			affectedFiles: [this.filename],
			diagnostics: []
		};
	}

	async inspect(): Promise<ExactSourceInspection> {
		return {
			generation: this.generation,
			filename: this.filename,
			project: { kind: this.options.projectKind ?? 'configured', root: this.options.root },
			compiler: { typescriptVersion: '7.0.0', backendVersion: '1.26.0' },
			partitionPlan: { version: 1, buildKey: 'fixture', roots: [], nodes: [], edges: [] },
			components: [],
			diagnostics: [],
			languageProjection: {
				protocol: 1,
				generation: this.generation,
				project: { kind: this.options.projectKind ?? 'configured', root: this.options.root },
				document: {
					uri: pathToFileURL(this.filename).href,
					path: this.filename,
					version: this.generation,
					textHash: 'fixture',
					text: ''
				},
				imports: [],
				components: [],
				enhancements: [],
				jsx: [],
				expressions: [],
				types: []
			}
		};
	}

	async refactor() {
		return undefined;
	}

	stats() {
		return {
			generation: this.generation,
			overlays: 1,
			analyzedFiles: 1,
			snapshotEntries: 1,
			snapshotSourceBytes: 1,
			analysisEntries: 1,
			analysisEstimatedBytes: 1,
			importGraphEntries: 1,
			importGraphEdges: 0,
			analysisEvictions: 0,
			cacheOverBudget: false,
			changedFiles: 1,
			affectedFiles: 1,
			lastSynchronizationMs: 0
		};
	}
}

type HeldStage = 'synchronize' | 'inspect' | 'host' | 'providers' | 'diagnostics';

/** Holds an existing asynchronous owner boundary until the test explicitly settles it. */
export function deferred() {
	let resolve!: () => void;
	let reject!: (error: unknown) => void;
	const promise = new Promise<void>((done, fail) => {
		resolve = done;
		reject = fail;
	});
	return { promise, resolve, reject };
}

/** Holds one existing public host boundary while its owning workspace is retired. */
export function lifetimeFixture(stage?: HeldStage) {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-language-lifetime-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const uri = pathToFileURL(path.join(root, 'Page.tsx')).href;
	const entered = deferred();
	const release = deferred();
	const services: FakeLanguageService[] = [];
	const hosts: ExactLanguageExtensionHost[] = [];
	const hold = async (at: HeldStage, first: boolean) => {
		if (first && at === stage) {
			if (at !== 'host') entered.resolve();
			await release.promise;
		}
	};
	const manager = new ExactLanguageWorkspaceManager([root], true, {
		createLanguageService(options) {
			const service = new FakeLanguageService(options);
			const first = services.length === 0;
			const synchronize = service.synchronize.bind(service);
			const inspect = service.inspect.bind(service);
			service.synchronize = async (changes) => {
				const value = await synchronize(changes);
				await hold('synchronize', first);
				return value;
			};
			service.inspect = vi.fn(async () => {
				const value = await inspect();
				await hold('inspect', first);
				if (first && stage === 'host') entered.resolve();
				return value;
			});
			services.push(service);
			return service;
		},
		async createLanguageExtensionHost() {
			const first = hosts.length === 0;
			const host = testLanguageHost();
			host.dispose = vi.fn(async () => undefined);
			host.synchronizeProviders = vi.fn(async () => {
				await hold('providers', first);
			});
			host.diagnostics = vi.fn(async () => {
				await hold('diagnostics', first);
				return { diagnostics: [], statuses: [] };
			});
			hosts.push(host);
			await hold('host', first);
			return host;
		}
	});
	onTestFinished(async () => {
		release.resolve();
		await manager.dispose();
		for (const service of services) expect(service.dispose).toHaveBeenCalledOnce();
		for (const host of hosts) expect(host.dispose).toHaveBeenCalledOnce();
	});
	return { root, uri, manager, entered, release, services, hosts };
}
