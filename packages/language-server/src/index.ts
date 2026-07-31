/** Public protocol and projection API for eXact language-server clients. */
export type * from './contracts.js';
export type { ExactSourceEntity, ExactSourceInspection, ExactSourceRange } from '@exactjs/compiler';
export {
	exactSemanticTokenModifiers,
	exactSemanticTokenTypes,
	projectCodeLenses,
	projectDocumentSymbols,
	projectHover,
	projectInlayHints,
	projectSemanticTokens
} from './lsp-projections.js';
export {
	ExactLanguageWorkspaceManager,
	type ExactDocumentSynchronization,
	type ExactLanguageWorkspaceManagerHost
} from './workspace-manager.js';
