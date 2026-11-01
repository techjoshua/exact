import {
	TextDocuments,
	type Connection,
	type WorkspaceFoldersChangeEvent
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { expect, onTestFinished, vi } from 'vitest';
import { ExactDocumentAnalysisState } from '../document-analysis-state.js';
import { registerExactWorkspaceFolderChanges } from '../workspace-folders.js';
import { createDocumentSynchronizationPublisher } from '../workspace/document-publication.js';
import type { ExactLanguageWorkspaceManager } from '../workspace-manager.js';

/** Exercises actual TextDocuments notifications and the negotiated production folder registration. */
export function folderLifecycle(
	manager: ExactLanguageWorkspaceManager,
	observeError?: (error: unknown) => void
) {
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
	const analyses = new ExactDocumentAnalysisState();
	onTestFinished(() => {
		listener.dispose();
		analyses.dispose();
		expect(handlers.size).toBe(0);
	});
	let folderChange!: (event: WorkspaceFoldersChangeEvent) => Promise<void>;
	const published: Array<{ uri: string; version: number; text: string }> = [],
		errors: unknown[] = [];
	const connection = {
		workspace: {
			onDidChangeWorkspaceFolders(callback: typeof folderChange) {
				folderChange = callback;
				return { dispose() {} };
			}
		},
		sendDiagnostics: vi.fn(async () => undefined),
		sendNotification: vi.fn(async () => undefined),
		sendRequest: vi.fn(async () => undefined),
		languages: {
			semanticTokens: { refresh: vi.fn() },
			inlayHint: { refresh: vi.fn(async () => undefined) }
		}
	} as unknown as Connection;
	const publish = createDocumentSynchronizationPublisher(
		connection,
		documents,
		analyses,
		() => false,
		(uri) => documents.get(uri)?.getText() ?? '',
		(error) => errors.push(error)
	);
	registerExactWorkspaceFolderChanges(
		connection,
		documents,
		analyses,
		() => manager,
		(snapshot, controller, result) => {
			const before = vi.mocked(connection.sendDiagnostics).mock.calls.length;
			publish(snapshot, controller, result);
			if (vi.mocked(connection.sendDiagnostics).mock.calls.length !== before)
				published.push({
					uri: snapshot.uri,
					version: snapshot.version,
					text: result.inspection.languageProjection.document.text ?? ''
				});
		},
		(error) => {
			errors.push(error);
			observeError?.(error);
		}
	);

	return {
		documents,
		analyses,
		diagnostics: vi.mocked(connection.sendDiagnostics).mock.calls,
		published,
		errors,
		change: (event: WorkspaceFoldersChangeEvent) => folderChange(event),
		open(uri: string, version: number, text: string) {
			handlers.get('onDidOpenTextDocument')!({
				textDocument: { uri, version, text, languageId: 'typescriptreact' }
			});
		},
		edit(uri: string, version: number, text: string) {
			handlers.get('onDidChangeTextDocument')!({
				textDocument: { uri, version },
				contentChanges: [{ text }]
			});
		}
	};
}
