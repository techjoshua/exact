import type { ExactLanguageService, ExactLanguageServiceOptions } from '@exactjs/compiler';
import type { ExactLanguageExtensionHost } from '@exactjs/language-extension-host';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, onTestFinished, vi } from 'vitest';
import { ExactLanguageWorkspaceManager } from '../workspace-manager.js';
import { FakeLanguageService, testLanguageHost } from './workspace-manager.js';

/** Official DI service that applies inputs only after an optional deterministic barrier. */
export class MigrationService extends FakeLanguageService {
	readonly inputs = new Map<string, { version: number; source: string }>();
	readonly deliveries: string[] = [];
	before?: (changes: Parameters<ExactLanguageService['synchronize']>[0]) => Promise<void>;
	constructor(readonly creation: ExactLanguageServiceOptions) {
		super(creation);
	}
	override async synchronize(changes: Parameters<ExactLanguageService['synchronize']>[0]) {
		await this.before?.(changes);
		for (const change of changes) {
			if (change.kind === 'upsert') {
				this.inputs.set(change.filename, { version: change.version, source: change.source });
				this.deliveries.push(`upsert:${change.version}:${change.source}`);
			} else {
				this.inputs.delete(change.filename);
				this.deliveries.push('close');
			}
		}
		return super.synchronize(changes);
	}
	override async inspect(filename?: string) {
		const base = await super.inspect();
		const input = filename ? this.inputs.get(filename) : undefined;
		return {
			...base,
			...(filename ? { filename } : {}),
			languageProjection: {
				...base.languageProjection,
				document: {
					...base.languageProjection.document,
					...(filename ? { path: filename, uri: pathToFileURL(filename).href } : {}),
					...(input ? { version: input.version, text: input.source } : {})
				}
			}
		};
	}
}

/** Owns temporary project topology and every injected compiler/provider resource. */
export function migrationFixture(initialRoot = true) {
	const root = mkdtempSync(path.join(tmpdir(), 'exact-folder-migration-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const inner = path.join(root, 'inner');
	mkdirSync(inner);
	const filename = path.join(inner, 'Page.tsx');
	const uri = pathToFileURL(filename).href;
	const services: MigrationService[] = [],
		hosts: ExactLanguageExtensionHost[] = [];
	let prepare: ((service: MigrationService) => void) | undefined;
	const manager = new ExactLanguageWorkspaceManager(initialRoot ? [root] : [], true, {
		createLanguageService(options) {
			const service = new MigrationService(options);
			prepare?.(service);
			services.push(service);
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
		await manager.dispose();
		for (const service of services) expect(service.dispose).toHaveBeenCalledOnce();
		for (const host of hosts) expect(host.dispose).toHaveBeenCalledOnce();
	});
	return {
		root,
		inner,
		filename,
		uri,
		manager,
		services,
		hosts,
		prepareNext(callback?: (service: MigrationService) => void) {
			prepare = callback;
		},
		input(version: number, source: string) {
			return { uri, version, source };
		}
	};
}
