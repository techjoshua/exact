import type { TextDocument } from 'vscode-languageserver-textdocument';

/** Immutable text and version captured at the start of one language-server request. */
export type ExactDocumentSnapshot = Readonly<{
	uri: string;
	version: number;
	source: string;
}>;

/** Captures the source coordinates that every result from one request must retain. */
export function captureDocumentSnapshot(
	document: Pick<TextDocument, 'uri' | 'version' | 'getText'>
): ExactDocumentSnapshot {
	return Object.freeze({
		uri: document.uri,
		version: document.version,
		source: document.getText()
	});
}

/** Reports whether a request snapshot still identifies the currently open document version. */
export function isCurrentDocumentSnapshot(
	snapshot: ExactDocumentSnapshot,
	document: Pick<TextDocument, 'uri' | 'version'> | undefined
): boolean {
	return document?.uri === snapshot.uri && document.version === snapshot.version;
}
