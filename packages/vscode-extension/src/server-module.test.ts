import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveExactLanguageServerModule } from './server-module.js';

describe('VS Code language-server module resolution', () => {
	it('prefers the freshly built sibling workspace over an installed dependency copy', () => {
		expect(resolveExactLanguageServerModule(import.meta.url)).toBe(
			path.resolve(import.meta.dirname, '../../language-server/dist/server.js')
		);
	});

	it('resolves a workspace-hoisted package without an extension-local node_modules link', () => {
		const extensionEntry = pathToFileURL(
			path.resolve('.tmp/exact-vscode-resolution/extension.js')
		).href;
		const resolved = resolveExactLanguageServerModule(extensionEntry);

		expect(existsSync(resolved)).toBe(true);
		expect(resolved.replaceAll('\\', '/')).toMatch(
			/(?:node_modules\/@exactjs|packages)\/language-server\/dist\/server\.js$/
		);
	});
});
