import type { ExactLanguageServiceOptions } from '@exactjs/compiler';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, onTestFinished, vi } from 'vitest';
import { ExactLanguageWorkspaceManager } from '../workspace-manager.js';
import { MigrationService } from './workspace-migration.js';
import { testLanguageHost } from './workspace-manager.js';

/** Owns two current inputs and official DI factories for transaction-local fault controls. */
export function folderFailureFixture(initialRoot = true) {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-folder-failure-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const a = path.join(root, 'a'),
		b = path.join(root, 'b');
	mkdirSync(a);
	mkdirSync(b);
	const inputs = [a, b].map((dir, index) => ({
		uri: pathToFileURL(path.join(dir, 'Page.tsx')).href,
		version: 1,
		source: `current ${index ? 'b' : 'a'}`
	}));
	const faults: {
		beforeCreate?: (options: ExactLanguageServiceOptions) => void;
		afterCreate?: (service: MigrationService) => void;
	} = {};
	const services: MigrationService[] = [],
		hosts: ReturnType<typeof testLanguageHost>[] = [];
	const manager = new ExactLanguageWorkspaceManager(initialRoot ? [root] : [], true, {
		createLanguageService(options) {
			faults.beforeCreate?.(options);
			const service = new MigrationService(options);
			services.push(service);
			faults.afterCreate?.(service);
			return service;
		},
		async createLanguageExtensionHost() {
			const host = testLanguageHost();
			host.dispose = vi.fn(async () => undefined);
			hosts.push(host);
			return host;
		}
	});
	onTestFinished(async () => {
		try {
			await manager.dispose();
			for (const service of services) expect(service.dispose).toHaveBeenCalledOnce();
			for (const host of hosts) expect(host.dispose).toHaveBeenCalledOnce();
		} finally {
			// Before-source runs expose lost DI resources. Retire them only after asserting the leak.
			await Promise.allSettled(
				services
					.filter((service) => !service.dispose.mock.calls.length)
					.map((service) => service.dispose())
			);
			await Promise.allSettled(
				hosts
					.filter((host) => !vi.mocked(host.dispose).mock.calls.length)
					.map((host) => host.dispose())
			);
		}
	});
	return {
		root,
		a,
		b,
		inputs,
		faults,
		services,
		hosts,
		manager,
		async open() {
			for (const input of inputs)
				await manager.synchronizeDocument(input.uri, input.version, input.source);
		},
		change: { added: [a, b], removed: [] },
		folders: [a, b].map((dir) => ({ uri: pathToFileURL(dir).href, name: path.basename(dir) }))
	};
}
