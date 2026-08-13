import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Connection, TextDocuments } from 'vscode-languageserver/node.js';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { ExactDocumentSnapshot } from './document-snapshots.js';

/** Creates source lookup and error reporting bound to one language-server connection. */
export function createServerSourceAccess(
	documents: TextDocuments<TextDocument>,
	connection: Connection
): Readonly<{
	sourceForUri(uri: string, fallback?: ExactDocumentSnapshot): string;
	logRequestError(error: unknown): void;
}> {
	return Object.freeze({
		sourceForUri(uri, fallback) {
			if (fallback?.uri === uri) return fallback.source;
			const open = documents.get(uri);
			if (open) return open.getText();
			return uri.startsWith('file:') ? readFileSync(fileURLToPath(uri), 'utf8') : '';
		},
		logRequestError(error) {
			connection.console.error(
				error instanceof Error ? (error.stack ?? error.message) : String(error)
			);
		}
	});
}
