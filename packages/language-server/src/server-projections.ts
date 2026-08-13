import type {
	ExactSourceDiagnostic,
	ExactSourceEntity,
	ExactSourceInspection
} from '@exactjs/compiler';
import {
	DiagnosticRelatedInformation,
	DiagnosticSeverity,
	type Diagnostic,
	type Hover,
	type InitializeParams,
	type WorkspaceEdit
} from 'vscode-languageserver/node.js';
import { fileURLToPath } from 'node:url';
import { lspRange } from './lsp-projections.js';
import type { ExactDocumentSnapshot } from './document-snapshots.js';

/** Converts a compiler diagnostic into the Language Server Protocol representation. */
export function lspDiagnostic(
	document: ExactDocumentSnapshot,
	diagnostic: ExactSourceDiagnostic
): Diagnostic {
	return {
		range: lspRange(document.source, diagnostic.range),
		severity: diagnosticSeverity(diagnostic.severity),
		code: diagnostic.code,
		source: 'eXact',
		message: `${diagnostic.summary}\n\n${diagnostic.explanation}`,
		relatedInformation: diagnostic.related.map((related) =>
			DiagnosticRelatedInformation.create(
				{
					uri: document.uri,
					range: lspRange(document.source, related.range)
				},
				related.message
			)
		)
	};
}

/** Converts a hosted provider diagnostic into a namespaced LSP diagnostic. */
export function lspProviderDiagnostic(
	document: ExactDocumentSnapshot,
	hosted: Readonly<{
		provider: string;
		diagnostic: Readonly<{
			code: string;
			severity: 'error' | 'warning' | 'information' | 'hint';
			range: Readonly<{ start: number; end: number }>;
			summary: string;
			explanation?: string;
			documentation?: string;
			tags?: readonly ('deprecated' | 'unnecessary')[];
			related?: readonly Readonly<{
				uri?: string;
				range: Readonly<{ start: number; end: number }>;
				message: string;
			}>[];
		}>;
	}>,
	resolveSource: (uri: string, fallback?: ExactDocumentSnapshot) => string
): Diagnostic {
	const diagnostic = hosted.diagnostic;
	return {
		range: lspRange(document.source, diagnostic.range),
		severity: providerDiagnosticSeverity(diagnostic.severity),
		code: `${hosted.provider}/${diagnostic.code}`,
		source: hosted.provider,
		message: [diagnostic.summary, diagnostic.explanation, diagnostic.documentation]
			.filter(Boolean)
			.join('\n\n'),
		tags: diagnostic.tags?.map((tag) => (tag === 'deprecated' ? 2 : 1)),
		relatedInformation: diagnostic.related?.map((related) => {
			const uri = related.uri ?? document.uri;
			return DiagnosticRelatedInformation.create(
				{ uri, range: lspRange(resolveSource(uri, document), related.range) },
				related.message
			);
		})
	};
}

function diagnosticSeverity(severity: ExactSourceDiagnostic['severity']): DiagnosticSeverity {
	if (severity === 'error') return DiagnosticSeverity.Error;
	if (severity === 'warning') return DiagnosticSeverity.Warning;
	return DiagnosticSeverity.Information;
}

function providerDiagnosticSeverity(
	severity: 'error' | 'warning' | 'information' | 'hint'
): DiagnosticSeverity {
	if (severity === 'error') return DiagnosticSeverity.Error;
	if (severity === 'warning') return DiagnosticSeverity.Warning;
	if (severity === 'hint') return DiagnosticSeverity.Hint;
	return DiagnosticSeverity.Information;
}

/** Converts compiler-authored edits for the active document into a versioned workspace edit. */
export function workspaceEdit(
	document: ExactDocumentSnapshot,
	edits: readonly Readonly<{
		filename: string;
		range: Readonly<{ start: number; end: number }>;
		newText: string;
	}>[]
): WorkspaceEdit {
	return {
		documentChanges: [
			{
				textDocument: { uri: document.uri, version: document.version },
				edits: edits.map((edit) => ({
					range: lspRange(document.source, edit.range),
					newText: edit.newText
				}))
			}
		]
	};
}

/** Converts validated provider edits into versioned LSP document changes. */
export function providerWorkspaceEdit(
	edits: readonly Readonly<{
		uri: string;
		version: number;
		range: Readonly<{ start: number; end: number }>;
		newText: string;
	}>[],
	resolveSource: (uri: string) => string
): WorkspaceEdit {
	return {
		documentChanges: edits.map((edit) => ({
			textDocument: { uri: edit.uri, version: edit.version },
			edits: [{ range: lspRange(resolveSource(edit.uri), edit.range), newText: edit.newText }]
		}))
	};
}

/** Extracts plain Markdown from the supported LSP hover-content variants. */
export function hoverMarkdown(hover: Hover | undefined): string | undefined {
	if (!hover) return undefined;
	if (typeof hover.contents === 'string') return hover.contents;
	if (Array.isArray(hover.contents))
		return hover.contents
			.map((part) => (typeof part === 'string' ? part : part.value))
			.join('\n\n');
	return 'value' in hover.contents ? hover.contents.value : undefined;
}

/** Flattens the compiler's nested source entities in stable depth-first order. */
export function flattenInspection(inspection: ExactSourceInspection): ExactSourceEntity[] {
	const flatten = (entity: ExactSourceEntity): ExactSourceEntity[] => [
		entity,
		...entity.children.flatMap(flatten)
	];
	return inspection.components.flatMap(flatten);
}

/** Renders the compiler's client/server placement summary for an inspection hover. */
export function compilerSeparation(inspection: ExactSourceInspection): string {
	const components = inspection.components.map((component) => {
		const entities = flattenInspection({ ...inspection, components: [component] });
		const client = entities.filter(
			(entity) =>
				entity.classification?.kind === 'task' && entity.classification.placement === 'client'
		);
		const server = entities.filter(
			(entity) =>
				entity.classification?.kind === 'task' && entity.classification.placement === 'server'
		);
		return [
			component.name,
			'├─ Shared setup',
			'│  └─ initialize state and register owned work',
			'├─ Client',
			...(client.length
				? client.map((entity) => `│  └─ ${entity.name ?? entity.kind}`)
				: ['│  └─ render DOM']),
			'└─ Server',
			...(server.length
				? server.map((entity) => `   └─ ${entity.name ?? entity.kind}`)
				: ['   └─ no server-only work'])
		].join('\n');
	});
	return `eXact compiler separation · generation ${inspection.generation}\n\n${components.join('\n\n')}`;
}

/** Resolves file-backed workspace roots from an LSP initialization request. */
export function workspaceRoots(params: InitializeParams): string[] {
	const folders = params.workspaceFolders?.flatMap((folder) =>
		folder.uri.startsWith('file:') ? [fileURLToPath(folder.uri)] : []
	);
	if (folders?.length) return folders;
	if (params.rootUri?.startsWith('file:')) return [fileURLToPath(params.rootUri)];
	return params.rootPath ? [params.rootPath] : [];
}

/** Identifies cancellation and generation supersession errors that need no user diagnostic. */
export function isExpectedSupersession(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.name === 'AbortError' || error.name === 'ExactStaleLanguageResultError')
	);
}
