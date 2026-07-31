import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolves the language server from either a packaged or workspace-hoisted dependency layout. */
export function resolveExactLanguageServerModule(extensionEntry: string): string {
	const workspaceModule = siblingWorkspaceLanguageServer(extensionEntry);
	if (workspaceModule) return workspaceModule;
	const require = createRequire(extensionEntry);
	return path.resolve(require.resolve('@exactjs/language-server/server'));
}

function siblingWorkspaceLanguageServer(extensionEntry: string): string | undefined {
	const entryPath = extensionEntry.startsWith('file:')
		? fileURLToPath(extensionEntry)
		: path.resolve(extensionEntry);
	const packagesRoot = path.resolve(path.dirname(entryPath), '..', '..');
	const packageRoot = path.join(packagesRoot, 'language-server');
	const manifestPath = path.join(packageRoot, 'package.json');
	const serverModule = path.join(packageRoot, 'dist', 'server.js');
	if (!existsSync(manifestPath) || !existsSync(serverModule)) return undefined;
	try {
		const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { name?: unknown };
		return manifest.name === '@exactjs/language-server' ? serverModule : undefined;
	} catch {
		return undefined;
	}
}
