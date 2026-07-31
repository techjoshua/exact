import type { InitializeParams } from 'vscode-languageserver/node.js';

/** Reports whether the initialized LSP client can publish workspace-folder changes. */
export function supportsExactWorkspaceFolderChanges(params: InitializeParams): boolean {
	return params.capabilities.workspace?.workspaceFolders === true;
}
