import type { InitializeParams } from 'vscode-languageserver/node.js';

/** Reports whether the initialized LSP client can publish workspace-folder changes. */
export function supportsExactWorkspaceFolderChanges(params: InitializeParams): boolean {
	return params.capabilities.workspace?.workspaceFolders === true;
}

import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath } from 'node:url';
import { captureDocumentSnapshot, type ExactDocumentSnapshot } from './document-snapshots.js';
import type { WorkspaceInput } from './workspace/state.js';
import type { ExactDocumentAnalysisState } from './document-analysis-state.js';
import type {
	ExactDocumentSynchronization,
	ExactLanguageWorkspaceManager
} from './workspace-manager.js';

/**
 * Registers the negotiated folder lifecycle against actual open document snapshots. Planning retires
 * affected analysis controllers synchronously, while completion reuses the server's normal publisher.
 * Snapshot/controller identity, not input correspondence, decides whether a result may publish.
 */
export function registerExactWorkspaceFolderChanges(
	connection: Pick<Connection, 'workspace'>,
	documents: TextDocuments<TextDocument>,
	analyses: ExactDocumentAnalysisState,
	workspace: () => ExactLanguageWorkspaceManager | undefined,
	publish: (
		snapshot: ExactDocumentSnapshot,
		controller: AbortController,
		result: ExactDocumentSynchronization
	) => void,
	onError: (error: unknown) => void
): void {
	connection.workspace.onDidChangeWorkspaceFolders(async (event) => {
		const manager = workspace();
		if (!manager) return;
		const inputs = documents.all().map(captureDocumentSnapshot);
		const snapshots = new Map<WorkspaceInput, ExactDocumentSnapshot>(
			inputs.map((input) => [input, input])
		);
		const controllers = new Map<ExactDocumentSnapshot, AbortController>();
		try {
			let failures: readonly unknown[];
			try {
				const batch = manager.reconcileWorkspaceFolders(
					{
						added: event.added
							.filter((folder) => folder.uri.startsWith('file:'))
							.map((folder) => fileURLToPath(folder.uri)),
						removed: event.removed
							.filter((folder) => folder.uri.startsWith('file:'))
							.map((folder) => fileURLToPath(folder.uri))
					},
					inputs
				);
				for (const input of batch.affectedInputs) {
					const snapshot = snapshots.get(input);
					if (!snapshot) continue;
					analyses.close(snapshot.uri);
					const controller = analyses.start(snapshot.uri, snapshot.version);
					if (controller) controllers.set(snapshot, controller);
				}
				const outcome = await batch.completion;
				for (const { input, synchronization } of outcome.results) {
					const snapshot = snapshots.get(input);
					const controller = snapshot && controllers.get(snapshot);
					if (snapshot && controller) publish(snapshot, controller, synchronization);
				}
				failures = outcome.errors;
			} catch (error) {
				failures = [error];
			}
			// Reporting failures is outside the catch so a throwing observer is not called again.
			for (const error of failures) onError(error);
		} finally {
			for (const [snapshot, controller] of controllers) analyses.finish(snapshot.uri, controller);
		}
	});
}
