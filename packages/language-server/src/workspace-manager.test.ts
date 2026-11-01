import type { ExactLanguageServiceOptions } from '@exactjs/compiler';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { ExactLanguageWorkspaceManager } from './workspace-manager.js';
import {
	FakeLanguageService,
	lifetimeFixture,
	testLanguageHost
} from './test-support/workspace-manager.js';
describe('ExactLanguageWorkspaceManager', () => {
	it('owns a document by its nearest nested eXact project inside a monorepo workspace', async () => {
		const created: Array<{
			options: ExactLanguageServiceOptions;
			service: FakeLanguageService;
		}> = [];
		const workspaceRoot = mkdtempSync(path.join(tmpdir(), 'exact-language-monorepo-'));
		const projectRoot = path.join(workspaceRoot, 'apps', 'localized');
		const filename = path.join(projectRoot, 'src', 'Page.tsx');
		mkdirSync(path.dirname(filename), { recursive: true });
		writeFileSync(
			path.join(projectRoot, 'exact.config.ts'),
			`export * as local from './enhancement.js' with { type: 'exact-enhancement', scope: 'package' };
export default {};\n`
		);
		const manager = new ExactLanguageWorkspaceManager([workspaceRoot], true, {
			createLanguageService(options) {
				const service = new FakeLanguageService(options);
				created.push({ options, service });
				return service;
			}
		});

		await manager.synchronizeDocument(
			pathToFileURL(filename).href,
			1,
			'export function Page() { return () => <main local:enabled />; }'
		);

		expect(created[0]?.options.root).toBe(projectRoot);
		expect(created[0]?.options.packageEnhancements).toEqual([
			expect.objectContaining({ localName: 'local', moduleSpecifier: './enhancement.js' })
		]);
		await manager.removeRoot(workspaceRoot);
		expect(created[0]?.service.dispose).toHaveBeenCalledOnce();
		await manager.dispose();
	});

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

	it('retains host-level provider failures for editor status', async () => {
		const root = path.resolve('workspace-provider-failure');
		const uri = pathToFileURL(path.join(root, 'Page.tsx')).href;
		const manager = new ExactLanguageWorkspaceManager([root], true, {
			createLanguageService: (options) => new FakeLanguageService(options),
			createLanguageExtensionHost: async () => testLanguageHost('provider discovery failed')
		});

		await manager.synchronizeDocument(uri, 1, 'export const page = 1;');

		expect(manager.providerFailure(uri)).toBe('provider discovery failed');
		await manager.dispose();
	});

	it.each(['synchronize', 'inspect', 'host', 'providers', 'diagnostics'] as const)(
		'refuses the retired workspace after awaiting %s and permits the next owner',
		async (stage) => {
			const fixture = lifetimeFixture(stage);
			const pending = fixture.manager.synchronizeDocument(fixture.uri, 1, 'export const old = 1;');
			await fixture.entered.promise;
			// The manager registered its continuation first, so it now awaits the held host.
			if (stage === 'host') await vi.mocked(fixture.services[0]!.inspect).mock.results[0]!.value;
			const retirement = fixture.manager.removeRoot(fixture.root);
			fixture.release.resolve();
			await retirement;
			await expect(pending).resolves.toBeUndefined();
			if (stage === 'synchronize') expect(fixture.services[0]!.inspect).not.toHaveBeenCalled();
			if (stage === 'synchronize' || stage === 'inspect' || stage === 'host')
				expect(fixture.hosts[0]!.synchronizeProviders).not.toHaveBeenCalled();
			if (stage !== 'diagnostics') expect(fixture.hosts[0]!.diagnostics).not.toHaveBeenCalled();
			expect(fixture.services[0]!.dispose).toHaveBeenCalledOnce();
			expect(fixture.hosts[0]!.dispose).toHaveBeenCalledOnce();
			fixture.manager.addRoot(fixture.root);
			const next = await fixture.manager.synchronizeDocument(
				fixture.uri,
				1,
				'export const next = 2;'
			);
			expect(next?.inspection.project?.kind).toBe('configured');
			expect(next?.inspection.languageProjection.document.version).toBe(1);
			expect(fixture.services).toHaveLength(2);
		}
	);

	it.each([false, true])(
		'retires provider completion on manager disposal, rejected=%s',
		async (rejected) => {
			const fixture = lifetimeFixture('diagnostics');
			const pending = fixture.manager.synchronizeDocument(fixture.uri, 1, 'old');
			await fixture.entered.promise;
			await fixture.manager.dispose();
			if (rejected) fixture.release.reject(new Error('retired provider'));
			else fixture.release.resolve();
			await expect(pending).resolves.toBeUndefined();
			expect(fixture.services[0]!.dispose).toHaveBeenCalledOnce();
			expect(fixture.hosts[0]!.dispose).toHaveBeenCalledOnce();
			const next = lifetimeFixture();
			await expect(next.manager.synchronizeDocument(next.uri, 1, 'next')).resolves.toBeDefined();
			expect(next.manager.providerFailure(next.uri)).toBeUndefined();
		}
	);

	it('distinguishes replacement workspace records with the same root and document version', async () => {
		const fixture = lifetimeFixture('diagnostics');
		const old = fixture.manager.synchronizeDocument(fixture.uri, 1, 'old');
		await fixture.entered.promise;
		await fixture.manager.removeRoot(fixture.root);
		fixture.manager.addRoot(fixture.root);
		const next = await fixture.manager.synchronizeDocument(fixture.uri, 1, 'next');
		fixture.release.resolve();
		await expect(old).resolves.toBeUndefined();
		expect(next?.inspection.languageProjection.document.version).toBe(1);
		expect(fixture.services).toHaveLength(2);
		expect(fixture.manager.providerFailure(fixture.uri)).toBeUndefined();
	});

	it('rejects an old document version without retiring its still-current workspace', async () => {
		const fixture = lifetimeFixture('diagnostics');
		const old = fixture.manager.synchronizeDocument(fixture.uri, 1, 'old');
		await fixture.entered.promise;
		const next = fixture.manager.synchronizeDocument(fixture.uri, 2, 'next');
		fixture.release.resolve();
		await expect(old).resolves.toBeUndefined();
		expect((await next)?.inspection.languageProjection.document.version).toBe(2);
		expect(fixture.services).toHaveLength(1);
		expect(fixture.services[0]!.dispose).not.toHaveBeenCalled();
	});

	it.each([false, true])(
		'preserves live native errors and discards retired ones: retired=%s',
		async (retired) => {
			const fixture = lifetimeFixture('inspect');
			const pending = fixture.manager.synchronizeDocument(fixture.uri, 1, 'old');
			await fixture.entered.promise;
			if (retired) await fixture.manager.removeRoot(fixture.root);
			const primary = new Error('native request failed');
			fixture.release.reject(primary);
			if (retired) await expect(pending).resolves.toBeUndefined();
			else await expect(pending).rejects.toBe(primary);
		}
	);

	it('preserves exact cancellation rejection even after workspace retirement', async () => {
		const fixture = lifetimeFixture('diagnostics');
		const controller = new AbortController();
		const pending = fixture.manager.synchronizeDocument(fixture.uri, 1, 'old', controller.signal);
		await fixture.entered.promise;
		await fixture.manager.removeRoot(fixture.root);
		controller.abort();
		const primary = new Error('cancelled');
		fixture.release.reject(primary);
		await expect(pending).rejects.toBe(primary);
	});
});
