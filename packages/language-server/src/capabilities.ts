import { CodeActionKind, TextDocumentSyncKind } from 'vscode-languageserver/node.js';
import type { ServerCapabilities } from 'vscode-languageserver/node.js';
import { exactSemanticTokenModifiers, exactSemanticTokenTypes } from './lsp-projections.js';

/** Static Language Server Protocol capabilities supported by the eXact server. */
export const exactLanguageServerCapabilities = Object.freeze({
	workspace: { workspaceFolders: { supported: true, changeNotifications: true } },
	textDocumentSync: TextDocumentSyncKind.Incremental,
	hoverProvider: true,
	completionProvider: { triggerCharacters: ['.', ':', "'", '"'] },
	renameProvider: true,
	codeLensProvider: { resolveProvider: false },
	inlayHintProvider: true,
	documentSymbolProvider: true,
	codeActionProvider: { codeActionKinds: [CodeActionKind.QuickFix, CodeActionKind.Refactor] },
	semanticTokensProvider: {
		legend: {
			tokenTypes: [...exactSemanticTokenTypes],
			tokenModifiers: [...exactSemanticTokenModifiers]
		},
		full: { delta: true }
	}
}) satisfies ServerCapabilities;
