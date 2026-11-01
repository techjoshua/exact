import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ExactDocumentAnalysisState } from '../document-analysis-state.js';
import { isCurrentDocumentSnapshot, type ExactDocumentSnapshot } from '../document-snapshots.js';
import { lspDiagnostic, lspProviderDiagnostic } from '../server-projections.js';
import type { ExactDocumentSynchronization } from '../workspace-manager.js';

/**
 * Shares the server's normal diagnostic/readiness publication with folder reseeding. Manager data,
 * actual document lifetime, and the controller must all remain current before synchronous delivery.
 */
export function createDocumentSynchronizationPublisher(
	connection: Connection,
	documents: TextDocuments<TextDocument>,
	analyses: ExactDocumentAnalysisState,
	shuttingDown: () => boolean,
	sourceForUri: (uri: string, fallback?: ExactDocumentSnapshot) => string,
	logPresentationError: (error: unknown) => void
) {
	return (
		snapshot: ExactDocumentSnapshot,
		controller: AbortController,
		result: ExactDocumentSynchronization
	): void => {
		if (
			shuttingDown() ||
			controller.signal.aborted ||
			!analyses.isCurrent(snapshot.uri, controller) ||
			!isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))
		)
			return;
		// Readiness precedes refresh, so follow-up requests see the completed provider generation.
		if (!analyses.publish(snapshot.uri, snapshot.version, controller)) return;
		void connection.sendDiagnostics({
			uri: snapshot.uri,
			version: snapshot.version,
			diagnostics: [
				...result.inspection.diagnostics.map((diagnostic) => lspDiagnostic(snapshot, diagnostic)),
				...result.providerDiagnostics.map((diagnostic) =>
					lspProviderDiagnostic(snapshot, diagnostic, sourceForUri)
				)
			]
		});
		void connection.sendNotification('exact/providerStatusChanged', { uri: snapshot.uri });
		connection.languages.semanticTokens.refresh();
		void connection.languages.inlayHint.refresh().catch(logPresentationError);
		void connection.sendRequest('workspace/codeLens/refresh').catch(() => undefined);
	};
}
