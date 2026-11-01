import type { ExactSourceInspection } from '@exactjs/compiler';
import type { ExactLanguageInlayHintV1 } from '@exactjs/language-extension-api';
import { TextDocuments, type Connection } from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
	FakeLanguageService,
	deferred,
	lifetimeFixture
} from './test-support/workspace-manager.js';
import { projectInferenceEvidence, registerInlayPresentation } from './inlay-presentation.js';

describe('provider inference presentation', () => {
	it('does not request a client refresh while initialization selects its level', () => {
		let changeLevel: ((value: { level?: unknown }) => void) | undefined;
		const refresh = vi.fn(async () => undefined);
		const connection = {
			onNotification: vi.fn((_method, handler) => {
				changeLevel = handler;
			}),
			onRequest: vi.fn(),
			languages: { inlayHint: { on: vi.fn(), refresh } }
		} as unknown as Connection;
		const controller = registerInlayPresentation(
			connection,
			{} as TextDocuments<TextDocument>,
			() => undefined,
			() => false
		);
		controller.setLevel('all');
		expect(refresh).not.toHaveBeenCalled();
		changeLevel?.({ level: 'off' });
		expect(refresh).toHaveBeenCalledOnce();
	});

	it('fences provider presentation while the document analysis generation is active', async () => {
		let inlays: ((params: unknown) => Promise<unknown>) | undefined;
		let decorations: ((params: unknown) => Promise<unknown>) | undefined;
		const connection = {
			onNotification: vi.fn(),
			onRequest: vi.fn((method, handler) => {
				if (method === 'exact/inferenceDecorations') decorations = handler;
			}),
			languages: {
				inlayHint: {
					on: vi.fn((handler) => {
						inlays = handler;
					}),
					refresh: vi.fn(async () => undefined)
				}
			}
		} as unknown as Connection;
		registerInlayPresentation(
			connection,
			{} as TextDocuments<TextDocument>,
			() => undefined,
			() => true
		);
		const params = { textDocument: { uri: 'file:///view.tsx' } };
		expect(await inlays?.({ ...params, range: { start: {}, end: {} } })).toEqual([]);
		expect(await decorations?.(params)).toBeUndefined();
	});

	it('deduplicates evidence and preserves its provider explanation', () => {
		const hint: ExactLanguageInlayHintV1 = {
			position: 20,
			label: 'unit',
			evidence: [
				{
					range: { start: 10, end: 16 },
					kind: 'unit',
					explanation: 'pound source unit inferred from authored fallback'
				}
			]
		};
		expect(
			projectInferenceEvidence([
				{ provider: '@exactjs/intl', value: hint },
				{ provider: '@exactjs/intl', value: hint }
			])
		).toEqual([
			{
				range: { start: 10, end: 16 },
				kind: 'unit',
				hover:
					'Inferred unit\n\npound source unit inferred from authored fallback\n\nSource: @exactjs/intl',
				provider: '@exactjs/intl'
			}
		]);
	});
});

it.each(['live', 'edit', 'reopen', 'close'] as const)(
	'fences the registered standard inlay provider await: %s',
	async (transition) => {
		const documents = new TextDocuments(TextDocument);
		const handlers = new Map<string, (params: unknown) => void>();
		const listener = documents.listen(
			new Proxy(
				{},
				{
					get: (_target, key) => (handler: (params: unknown) => void) => {
						handlers.set(String(key), handler);
						return { dispose: () => handlers.delete(String(key)) };
					}
				}
			) as Parameters<typeof documents.listen>[0]
		);
		onTestFinished(() => {
			listener.dispose();
			expect(handlers.size).toBe(0);
		});
		const uri = 'file:///inlay-lifetime/Page.tsx';
		const open = () =>
			handlers.get('onDidOpenTextDocument')!({
				textDocument: { uri, languageId: 'typescriptreact', version: 1, text: 'old text' }
			});
		const close = () => handlers.get('onDidCloseTextDocument')!({ textDocument: { uri } });
		open();
		const document = documents.get(uri)!;
		const service = new FakeLanguageService({ root: '/inlay-lifetime', noEmit: true });
		await service.synchronize([
			{ kind: 'upsert', filename: '/inlay-lifetime/Page.tsx', source: 'old text', version: 1 }
		]);
		onTestFinished(() => service.dispose());
		const inspection = await service.inspect();
		const entered = deferred(),
			release = deferred();
		onTestFinished(() => release.resolve());
		let standard!: (params: unknown) => Promise<Array<{ label: string; position: unknown }>>;
		let evidence!: (params: unknown) => Promise<unknown>;
		const workspace = {
			inspect: vi.fn(async () => inspection),
			inlayHints: vi.fn(async () => {
				entered.resolve();
				await release.promise;
				return [{ provider: 'test', value: { position: 3, label: 'old hint' } }];
			})
		};
		const paired = async (): Promise<{
			inspection: ExactSourceInspection;
			contributions: readonly { provider: string; value: ExactLanguageInlayHintV1 }[];
		}> => ({ inspection, contributions: await workspace.inlayHints() });
		const currentWorkspace = {
			inspect: workspace.inspect,
			inlayHints: () => workspace.inlayHints(),
			inspectWithInlayHints: paired
		};
		const connection = {
			onNotification: vi.fn(),
			onRequest: vi.fn((_method, handler) => {
				evidence = handler;
			}),
			languages: {
				inlayHint: {
					on: vi.fn((handler) => {
						standard = handler;
					}),
					refresh: vi.fn()
				}
			}
		};
		registerInlayPresentation(
			connection as unknown as Connection,
			documents,
			() => currentWorkspace as never,
			() => false
		);
		const params = {
			textDocument: { uri },
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } }
		};
		const pending = standard(params),
			companion = evidence(params);
		await entered.promise;
		if (transition === 'edit')
			handlers.get('onDidChangeTextDocument')!({
				textDocument: { uri, version: 2 },
				contentChanges: [{ text: 'n\new text' }]
			});
		if (transition === 'reopen') {
			close();
			open();
			expect(documents.get(uri)).not.toBe(document);
		}
		if (transition === 'close') close();
		release.resolve();
		if (transition === 'live') {
			expect((await pending)[0]?.position).toEqual({ line: 0, character: 3 });
			expect(await companion).toMatchObject({ version: 1 });
		} else {
			expect(await pending).toEqual([]);
			expect(await companion).toBeUndefined();
		}
		if (transition === 'close') open();
		workspace.inlayHints = vi.fn(async () => [
			{ provider: 'test', value: { position: 0, label: 'current hint' } }
		]);
		expect((await standard(params))[0]).toMatchObject({
			label: 'current hint',
			position: { line: 0, character: 0 }
		});
		expect(connection.languages.inlayHint.refresh).not.toHaveBeenCalled();
	}
);

it.each(['provider', 'empty', 'failure'] as const)(
	'registered paired inlays retain live core with %s',
	async (mode) => {
		const f = await registeredInlayOwner();
		f.hosts[0]!.inlayHints = vi.fn(async () => {
			if (mode === 'failure') throw 'provider offline';
			return mode === 'empty'
				? []
				: [{ provider: 'test', value: { position: 3, label: 'provider' } }];
		});
		const result = await f.request();
		expect(result).toHaveLength(mode === 'provider' ? 2 : 1);
		expect(result[0]).toMatchObject({ label: [{ value: '⚙' }] });
		expect(f.services[0]!.inspect).toHaveBeenCalledOnce();
		const projection = vi.mocked(f.hosts[0]!.inlayHints).mock.calls[0]![0];
		expect(projection.generation).toBe(f.inspection.languageProjection.generation);
		expect(projection.document).toEqual(f.inspection.languageProjection.document);
		expect(f.manager.providerFailure(f.uri)).toBe(
			mode === 'failure' ? 'provider offline' : undefined
		);
	}
);

it.each(['remove', 'recreate', 'dispose', 'retired failure'] as const)(
	'registered paired inlays refuse all old data after %s',
	async (mode) => {
		const f = await registeredInlayOwner();
		const entered = deferred(),
			release = deferred();
		onTestFinished(() => release.resolve());
		f.hosts[0]!.inlayHints = vi.fn(async () => {
			entered.resolve();
			await release.promise;
			return [{ provider: 'test', value: { position: 3, label: 'old provider' } }];
		});
		const pending = f.request();
		await entered.promise;
		if (mode === 'dispose') await f.manager.dispose();
		else await f.manager.removeRoot(f.root);
		if (mode === 'recreate') {
			f.manager.addRoot(f.root);
			expect(await f.manager.synchronizeDocument(f.uri, 1, 'old text')).toBeDefined();
		}
		if (mode === 'retired failure') release.reject('old failure');
		else release.resolve();
		expect(await pending).toEqual([]);
		expect(f.services[0]!.dispose).toHaveBeenCalledOnce();
		expect(f.hosts[0]!.dispose).toHaveBeenCalledOnce();
		if (mode !== 'dispose') {
			if (mode !== 'recreate') {
				f.manager.addRoot(f.root);
				await f.manager.synchronizeDocument(f.uri, 1, 'old text');
			}
			f.hosts[1]!.inlayHints = vi.fn(async () => [
				{ provider: 'test', value: { position: 0, label: 'following' } }
			]);
			expect((await f.request())[0]).toMatchObject({ label: 'following' });
			expect(f.manager.providerFailure(f.uri)).toBeUndefined();
		} else {
			const following = await registeredInlayOwner();
			following.hosts[0]!.inlayHints = vi.fn(async () => []);
			expect(await following.request()).toHaveLength(1);
		}
	}
);

/** Uses the registered presentation entry and a real open-document lifetime with official manager DI. */
async function registeredInlayOwner() {
	const f = lifetimeFixture();
	await f.manager.synchronizeDocument(f.uri, 1, 'old text');
	const base = await f.services[0]!.inspect();
	const inspection: ExactSourceInspection = {
		...base,
		languageProjection: {
			...base.languageProjection,
			document: { ...base.languageProjection.document, text: 'old text' }
		},
		components: [
			{
				id: 'component',
				kind: 'component',
				name: 'Page',
				range: { start: 0, end: 8 },
				selectionRange: { start: 0, end: 3 },
				reasons: [],
				children: [
					{
						id: 'assignment',
						kind: 'state-assignment',
						name: 'count',
						range: { start: 0, end: 8 },
						selectionRange: { start: 0, end: 3 },
						reasons: [],
						children: [],
						classification: {
							kind: 'state-assignment',
							execution: 'once-per-instance',
							effect: {
								kind: 'state-write',
								path: 'this.state.count',
								range: { start: 0, end: 8 },
								confidence: 'exact'
							},
							dependencies: []
						}
					}
				]
			}
		]
	};
	f.services[0]!.inspect = vi.fn(async () => inspection);
	const documents = new TextDocuments(TextDocument);
	const handlers = new Map<string, (params: unknown) => void>();
	const listener = documents.listen(
		new Proxy(
			{},
			{
				get: (_target, key) => (handler: (params: unknown) => void) => {
					handlers.set(String(key), handler);
					return { dispose: () => handlers.delete(String(key)) };
				}
			}
		) as Parameters<typeof documents.listen>[0]
	);
	onTestFinished(() => {
		listener.dispose();
		expect(handlers.size).toBe(0);
	});
	handlers.get('onDidOpenTextDocument')!({
		textDocument: { uri: f.uri, languageId: 'typescriptreact', version: 1, text: 'old text' }
	});
	let standard!: (params: unknown) => Promise<unknown[]>;
	const connection = {
		onNotification: vi.fn(),
		onRequest: vi.fn(),
		languages: {
			inlayHint: {
				on: vi.fn((handler) => {
					standard = handler;
				}),
				refresh: vi.fn()
			}
		}
	};
	registerInlayPresentation(
		connection as unknown as Connection,
		documents,
		() => f.manager,
		() => false
	);
	return {
		...f,
		inspection,
		request: () =>
			standard({
				textDocument: { uri: f.uri },
				range: { start: { line: 0, character: 0 }, end: { line: 0, character: 8 } }
			})
	};
}
