import { describe, expect, it } from 'vitest';
import { supportsExactWorkspaceFolderChanges } from './workspace-folders.js';

describe('language-server workspace-folder negotiation', () => {
	it('registers change events only for a client that advertised them', () => {
		expect(
			supportsExactWorkspaceFolderChanges({
				processId: null,
				rootUri: null,
				capabilities: {}
			})
		).toBe(false);
		expect(
			supportsExactWorkspaceFolderChanges({
				processId: null,
				rootUri: null,
				capabilities: { workspace: { workspaceFolders: true } }
			})
		).toBe(true);
	});
});

import { pathToFileURL } from 'node:url';
import { migrationFixture } from './test-support/workspace-migration.js';
import { folderLifecycle } from './test-support/workspace-folder-lifecycle.js';
import { deferred } from './test-support/workspace-manager.js';
import { onTestFinished } from 'vitest';

it('registered folder lifecycle captures current open text and restarts only affected analysis', async () => {
	const f = migrationFixture(),
		lsp = folderLifecycle(f.manager);
	lsp.open(f.uri, 1, 'before');
	await f.manager.synchronizeDocument(f.uri, 1, 'before');
	const folder = { uri: pathToFileURL(f.inner).href, name: 'inner' };
	await lsp.change({ added: [folder], removed: [] });
	lsp.edit(f.uri, 2, 'after');
	await f.manager.synchronizeDocument(f.uri, 2, 'after');
	await lsp.change({ added: [], removed: [folder] });
	expect(lsp.published.at(-1)).toEqual({ uri: f.uri, version: 2, text: 'after' });
	expect(lsp.analyses.presentationBlocked(f.uri, 2)).toBe(false);
	expect(lsp.errors).toEqual([]);
	lsp.edit(f.uri, 3, 'latest');
	expect(
		(await f.manager.synchronizeDocument(f.uri, 3, 'latest'))?.inspection.languageProjection
			.document.text
	).toBe('latest');
});

it('registered migration retires affected controllers before a held seed settles', async () => {
	const f = migrationFixture(),
		lsp = folderLifecycle(f.manager);
	lsp.open(f.uri, 1, 'held');
	await f.manager.synchronizeDocument(f.uri, 1, 'held');
	const independent = lsp.analyses.start('file:///independent.tsx', 1)!;
	const previous = lsp.analyses.start(f.uri, 1)!;
	const entered = deferred(),
		release = deferred();
	onTestFinished(() => release.resolve());
	f.prepareNext((service) => {
		service.before = async () => {
			service.before = undefined;
			entered.resolve();
			await release.promise;
		};
	});
	const pending = lsp.change({
		added: [{ uri: pathToFileURL(f.inner).href, name: 'inner' }],
		removed: []
	});
	expect(previous.signal.aborted).toBe(true);
	expect(independent.signal.aborted).toBe(false);
	await entered.promise;
	expect(lsp.published).toEqual([]);
	expect(lsp.analyses.presentationBlocked(f.uri, 1)).toBe(true);
	release.resolve();
	await pending;
	expect(lsp.published).toEqual([{ uri: f.uri, version: 1, text: 'held' }]);
	expect(lsp.errors).toEqual([]);
});

it('registered migration reports exact core failure and preserves unavailable readiness until explicit retry', async () => {
	const f = migrationFixture(),
		lsp = folderLifecycle(f.manager);
	lsp.open(f.uri, 1, 'unsaved');
	await f.manager.synchronizeDocument(f.uri, 1, 'unsaved');
	f.prepareNext((service) => {
		service.before = async () => {
			throw 0;
		};
	});
	const change = { added: [{ uri: pathToFileURL(f.inner).href, name: 'inner' }], removed: [] };
	await lsp.change(change);
	expect(lsp.errors).toEqual([0]);
	expect(lsp.published).toEqual([]);
	expect(lsp.analyses.presentationBlocked(f.uri, 1)).toBe(true);
	const count = f.services.length;
	expect(await f.manager.inspect(f.uri)).toBeUndefined();
	expect(f.services).toHaveLength(count);
	f.prepareNext();
	await lsp.change({ added: [], removed: [] });
	expect(lsp.published).toEqual([{ uri: f.uri, version: 1, text: 'unsaved' }]);
	expect(lsp.errors).toEqual([0]);
});

import { createExactLanguageService } from '@exactjs/compiler';
import { ExactLanguageWorkspaceManager } from './workspace-manager.js';
import { testLanguageHost } from './test-support/workspace-manager.js';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

it('publishes native advisory code, warning severity and authored range through the registered folder owner', async () => {
	const root = mkdtempSync(path.resolve('.tmp/native-advisory-lsp-'));
	onTestFinished(() => rmSync(root, { recursive: true, force: true }));
	const inner = path.join(root, 'inner');
	mkdirSync(inner);
	const uri = pathToFileURL(path.join(inner, 'Page.tsx')).href;
	const source = `// 😀
import {TaskContext,type Component} from '@exactjs/core';
export function Page(this:Component<{}>){
 async function run(task:TaskContext=TaskContext.server().detached()){return 1;}
 return()=> <p>ready</p>;
}`;
	const manager = new ExactLanguageWorkspaceManager([root], true, {
		createLanguageService: (options) => createExactLanguageService(options),
		createLanguageExtensionHost: async () => testLanguageHost()
	});
	onTestFinished(() => manager.dispose());
	const lsp = folderLifecycle(manager);
	lsp.open(uri, 1, source);
	await manager.synchronizeDocument(uri, 1, source);
	const folder = { uri: pathToFileURL(inner).href, name: 'inner' };
	await lsp.change({ added: [folder], removed: [] });
	const diagnostics = lsp.diagnostics.at(-1)?.[0].diagnostics;
	expect(diagnostics?.filter((d) => d.code === 'EXACT2004')).toMatchObject([
		{ severity: 2, range: { start: { line: 3, character: 1 } } }
	]);
	expect(lsp.errors).toEqual([]);
	const acknowledged = source.replace(
		' async function',
		' /** @exact ignore=EXACT2004 */\n async function'
	);
	lsp.edit(uri, 2, acknowledged);
	await manager.synchronizeDocument(uri, 2, acknowledged);
	await lsp.change({ added: [], removed: [folder] });
	expect(lsp.diagnostics.at(-1)?.[0].diagnostics.some((d) => d.code === 'EXACT2004')).toBe(false);
	expect(lsp.analyses.presentationBlocked(uri, 2)).toBe(false);
	expect(lsp.errors).toEqual([]);
});
