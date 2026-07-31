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
