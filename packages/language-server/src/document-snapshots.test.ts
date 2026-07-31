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

		expect(snapshot).toEqual({
			uri: 'file:///workspace/Page.tsx',
			version: 7,
			source: 'return props.title;'
		});
		expect(isCurrentDocumentSnapshot(snapshot, document)).toBe(false);
	});
});
