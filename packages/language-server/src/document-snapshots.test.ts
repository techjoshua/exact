import { TextDocument } from 'vscode-languageserver-textdocument';
import { describe, expect, it } from 'vitest';
import { captureDocumentSnapshot, isCurrentDocumentSnapshot } from './document-snapshots.js';

describe('language-server document snapshots', () => {
	it('keeps request text immutable and rejects a result after the next edit', () => {
		const document = {
			uri: 'file:///workspace/Page.tsx',
			version: 7,
			source: 'return props.title;',
			getText() {
				return this.source;
			}
		};
		const snapshot = captureDocumentSnapshot(document);

		document.version = 8;
		document.source = 'return title;';

		expect(snapshot).toMatchObject({
			uri: 'file:///workspace/Page.tsx',
			version: 7,
			source: 'return props.title;'
		});
		expect(isCurrentDocumentSnapshot(snapshot, document)).toBe(false);
	});

	it('rejects a snapshot from an earlier open lifetime even when URI, version and text match', () => {
		const uri = 'file:///workspace/Page.tsx';
		const old = TextDocument.create(uri, 'typescriptreact', 1, 'const value = 1;');
		const snapshot = captureDocumentSnapshot(old);
		const reopened = TextDocument.create(uri, 'typescriptreact', 1, 'const value = 1;');
		expect(isCurrentDocumentSnapshot(snapshot, old)).toBe(true);
		expect(isCurrentDocumentSnapshot(snapshot, undefined)).toBe(false);
		expect(isCurrentDocumentSnapshot(snapshot, reopened)).toBe(false);
		expect(isCurrentDocumentSnapshot(captureDocumentSnapshot(reopened), reopened)).toBe(true);
	});

	it('retains immutable coordinates while an open TextDocument updates in place', () => {
		const document = TextDocument.create('file:///workspace/Page.tsx', 'typescriptreact', 1, 'old');
		const snapshot = captureDocumentSnapshot(document);
		const updated = TextDocument.update(document, [{ text: 'new' }], 2);
		expect(updated).toBe(document);
		expect(snapshot.source).toBe('old');
		expect(snapshot.version).toBe(1);
		expect(isCurrentDocumentSnapshot(snapshot, updated)).toBe(false);
		expect(isCurrentDocumentSnapshot(captureDocumentSnapshot(updated), updated)).toBe(true);
	});
});
