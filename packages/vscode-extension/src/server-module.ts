import { createRequire } from 'node:module';
import path from 'node:path';

/** Resolves the language server from either a packaged or workspace-hoisted dependency layout. */
export function resolveExactLanguageServerModule(extensionEntry: string): string {
	const require = createRequire(extensionEntry);
	return path.resolve(require.resolve('@exactjs/language-server/server'));
}
