import type { TextDocument } from 'vscode-languageserver-textdocument';

/** Request-local open-document identity and immutable coordinates, never serialized over LSP. */
export type ExactDocumentSnapshot = Readonly<{
	document: Pick<TextDocument, 'uri' | 'version' | 'getText'>;
	uri: string;
	version: number;
	source: string;
}>;

/** Captures the source coordinates that every result from one request must retain. */
export function captureDocumentSnapshot(
	document: Pick<TextDocument, 'uri' | 'version' | 'getText'>
): ExactDocumentSnapshot {
	return Object.freeze({
		document,
		uri: document.uri,
		version: document.version,
		source: document.getText()
	});
}

/** Reports whether a request snapshot still identifies the currently open document lifetime and version. */
export function isCurrentDocumentSnapshot(
	snapshot: ExactDocumentSnapshot,
	document: Pick<TextDocument, 'uri' | 'version'> | undefined
): boolean {
	return (
		document === snapshot.document &&
		document.uri === snapshot.uri &&
		document.version === snapshot.version
	);
}
