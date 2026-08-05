import type {
	ExactLanguageService,
	ExactLanguageServiceOptions,
	ExactSourceInspection
} from '@exactjs/compiler';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ExactLanguageWorkspaceManager } from './workspace-manager.js';

describe('ExactLanguageWorkspaceManager', () => {
	it('owns configured and bounded inferred projects independently', async () => {
		const created: Array<{
			options: ExactLanguageServiceOptions;
			service: FakeLanguageService;
		}> = [];
		const root = path.resolve('workspace');
		const manager = new ExactLanguageWorkspaceManager([root], true, {
			createLanguageService(options) {
				const service = new FakeLanguageService(options);
				created.push({ options, service });
				return service;
			}
		});
		const configured = pathToFileURL(path.join(root, 'Page.tsx')).toString();
		const inferred = pathToFileURL(path.resolve('outside/Loose.tsx')).toString();

		await manager.synchronizeDocument(configured, 1, 'export const page = 1;');
		await manager.synchronizeDocument(inferred, 1, 'export const loose = 1;');

		expect(created.map((entry) => entry.options.projectKind)).toEqual(['configured', 'inferred']);
		await manager.removeRoot(root);
		expect(created[0]?.service.dispose).toHaveBeenCalledOnce();
		expect(created[1]?.service.dispose).not.toHaveBeenCalled();
		await manager.dispose();
		expect(created[1]?.service.dispose).toHaveBeenCalledOnce();
	});

	it('does not create compiler services for an untrusted workspace', async () => {
		const factory = vi.fn();
		const manager = new ExactLanguageWorkspaceManager([process.cwd()], false, {
			createLanguageService: factory
		});
		await expect(
			manager.synchronizeDocument(
				pathToFileURL(path.resolve('Page.tsx')).toString(),
				1,
				'export const page = 1;'
			)
		).resolves.toBeUndefined();
		expect(factory).not.toHaveBeenCalled();
		await manager.dispose();
	});
});

class FakeLanguageService implements ExactLanguageService {
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
			diagnostics: []
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
			changedFiles: 1,
			affectedFiles: 1,
			lastSynchronizationMs: 0
		};
	}
}
