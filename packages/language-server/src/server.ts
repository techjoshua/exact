#!/usr/bin/env node
import type {
	ExactRefactorKind,
	ExactSourceDiagnostic,
	ExactSourceEntity,
	ExactSourceInspection
} from '@exactjs/compiler';
import {
	CodeActionKind,
	createConnection,
	DiagnosticRelatedInformation,
	DiagnosticSeverity,
	ProposedFeatures,
	TextDocuments,
	TextDocumentSyncKind
} from 'vscode-languageserver/node.js';
import type {
	CodeAction,
	CodeLens,
	CompletionItem,
	Diagnostic,
	DocumentSymbol,
	InlayHint,
	InitializeParams,
	InitializeResult,
	SemanticTokens,
	WorkspaceEdit
} from 'vscode-languageserver/node.js';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { fileURLToPath } from 'node:url';
import type {
	ExactCompilerSeparationResult,
	ExactComponentSemanticsParams,
	ExactExplainEntityParams,
	ExactLanguageServerInitializationOptions,
	ExactProjectStatusResult,
	ExactPreviewSemanticChangeParams
} from './contracts.js';
import {
	captureDocumentSnapshot,
	isCurrentDocumentSnapshot,
	type ExactDocumentSnapshot
} from './document-snapshots.js';
import {
	exactSemanticTokenModifiers,
	exactSemanticTokenTypes,
	lspRange,
	projectCodeLenses,
	projectDocumentSymbols,
	projectHover,
	projectInlayHints,
	projectSemanticTokens,
	projectTaskRename,
	projectTaskStatusCompletions,
	sourceOffset
} from './lsp-projections.js';
import { ExactLanguageWorkspaceManager } from './workspace-manager.js';
import { supportsExactWorkspaceFolderChanges } from './workspace-folders.js';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const activeAnalysis = new Map<string, AbortController>();
let workspaces: ExactLanguageWorkspaceManager | undefined;
let workspaceFolderChangesSupported = false;

connection.onInitialize((params: InitializeParams): InitializeResult => {
	const initialization = (params.initializationOptions ??
		{}) as ExactLanguageServerInitializationOptions;
	workspaceFolderChangesSupported = supportsExactWorkspaceFolderChanges(params);
	const roots = workspaceRoots(params);
	workspaces = new ExactLanguageWorkspaceManager(roots, initialization.workspaceTrusted === true);
	return {
		serverInfo: { name: '@exactjs/language-server', version: '0.1.0' },
		capabilities: {
			workspace: { workspaceFolders: { supported: true, changeNotifications: true } },
			textDocumentSync: TextDocumentSyncKind.Incremental,
			hoverProvider: true,
			completionProvider: { triggerCharacters: ['.'] },
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
		}
	};
});

connection.onInitialized(() => {
	if (workspaceFolderChangesSupported)
		connection.workspace.onDidChangeWorkspaceFolders(async (event) => {
			for (const folder of event.added)
				if (folder.uri.startsWith('file:')) workspaces?.addRoot(fileURLToPath(folder.uri));
			for (const folder of event.removed)
				if (folder.uri.startsWith('file:')) await workspaces?.removeRoot(fileURLToPath(folder.uri));
		});
	if (!workspaces?.isTrusted())
		connection.window.showWarningMessage(
			'eXact Language Tools is in untrusted-workspace mode. Compiler execution and semantic analysis are disabled.'
		);
});

documents.onDidOpen((event) => void synchronize(event.document));
documents.onDidChangeContent((event) => void synchronize(event.document));
documents.onDidClose((event) => {
	activeAnalysis.get(event.document.uri)?.abort();
	activeAnalysis.delete(event.document.uri);
	void workspaces?.closeDocument(event.document.uri).catch(logRequestError);
	void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onHover((params) => withInspection(params, projectHover));
connection.onCompletion(
	(params): Promise<CompletionItem[]> =>
		withInspection(params, projectTaskStatusCompletions).then((result) => result ?? [])
);
connection.onRenameRequest(async (params): Promise<WorkspaceEdit | null> => {
	const document = documents.get(params.textDocument.uri);
	if (!document) return null;
	const snapshot = captureDocumentSnapshot(document);
	const inspection = await workspaces?.inspect(snapshot.uri);
	if (!inspection || !isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))) return null;
	return (
		projectTaskRename(
			inspection,
			snapshot.source,
			params.position,
			params.newName,
			params.textDocument.uri
		) ?? null
	);
});
connection.onCodeLens(
	(params): Promise<CodeLens[]> =>
		withInspection(params, projectCodeLenses).then((result) => result ?? [])
);
connection.languages.inlayHint.on(
	(params): Promise<InlayHint[]> =>
		withInspection(params, projectInlayHints).then((result) => result ?? [])
);
connection.onDocumentSymbol(
	(params): Promise<DocumentSymbol[]> =>
		withInspection(params, projectDocumentSymbols).then((result) => result ?? [])
);
connection.languages.semanticTokens.on(
	(params): Promise<SemanticTokens> =>
		withInspection(params, projectSemanticTokens).then((result) => result ?? { data: [] })
);
connection.languages.semanticTokens.onDelta((params) =>
	withInspection(params, projectSemanticTokens).then((result) => result ?? { data: [] })
);

connection.onCodeAction(async (params): Promise<CodeAction[]> => {
	const document = documents.get(params.textDocument.uri);
	const manager = workspaces;
	if (!document || !manager) return [];
	const snapshot = captureDocumentSnapshot(document);
	const inspection = await manager.inspect(snapshot.uri);
	if (!inspection || !isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))) return [];
	const sourceRange = {
		start: sourceOffset(snapshot.source, params.range.start),
		end: sourceOffset(snapshot.source, params.range.end)
	};
	const task = flattenInspection(inspection).find(
		(entity) =>
			(entity.kind === 'inferred-task' || entity.kind === 'explicit-task') &&
			entity.range.start <= sourceRange.end &&
			sourceRange.start <= entity.range.end
	);
	if (!task) return [];
	const kinds: ExactRefactorKind[] =
		task.kind === 'inferred-task'
			? ['convert-to-explicit-task']
			: ['convert-to-inferred-task', 'make-placement-explicit'];
	const actions: CodeAction[] = [];
	for (const kind of kinds) {
		const plan = await manager.refactor(snapshot.uri, {
			generation: inspection.generation,
			range: task.range,
			kind
		});
		if (!isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))) return [];
		if (!plan) continue;
		actions.push({
			title: plan.title,
			kind: CodeActionKind.RefactorRewrite,
			edit: workspaceEdit(snapshot, plan.edits),
			data: { semanticChange: plan.semanticChange, expected: plan.expected }
		});
	}
	return actions;
});

connection.onRequest('exact/componentSemantics', async (params: ExactComponentSemanticsParams) =>
	withInspection(params, (inspection) => inspection)
);
connection.onRequest(
	'exact/projectStatus',
	async (params: ExactComponentSemanticsParams): Promise<ExactProjectStatusResult> => {
		const inspection = await withInspection(params, (current) => current);
		return {
			trusted: workspaces?.isTrusted() === true,
			...(inspection?.project ? { project: inspection.project } : {}),
			...(inspection?.compiler ? { compiler: inspection.compiler } : {})
		};
	}
);
connection.onRequest('exact/explainEntity', async (params: ExactExplainEntityParams) => {
	const inspection = await withInspection(params, (current) => current);
	return inspection
		? flattenInspection(inspection).find((entity) => entity.id === params.entityId)
		: undefined;
});
connection.onRequest(
	'exact/previewSemanticChange',
	async (params: ExactPreviewSemanticChangeParams) => {
		const document = documents.get(params.textDocument.uri);
		if (!document || document.version !== params.version) return undefined;
		const snapshot = captureDocumentSnapshot(document);
		const inspection = await workspaces?.inspect(snapshot.uri);
		if (!inspection || !isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri)))
			return undefined;
		const plan = await workspaces?.refactor(snapshot.uri, {
			generation: inspection.generation,
			range: params.range,
			kind: params.kind
		});
		return isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri)) ? plan : undefined;
	}
);
connection.onRequest(
	'exact/compilerSeparation',
	async (
		params: ExactComponentSemanticsParams
	): Promise<ExactCompilerSeparationResult | undefined> => {
		const inspection = await withInspection(params, (current) => current);
		if (!inspection) return undefined;
		return {
			generation: inspection.generation,
			uri: `exact-separation:${encodeURIComponent(params.textDocument.uri)}?generation=${inspection.generation}`,
			content: compilerSeparation(inspection)
		};
	}
);

connection.onShutdown(async () => {
	for (const controller of activeAnalysis.values()) controller.abort();
	activeAnalysis.clear();
	await workspaces?.dispose();
});

documents.listen(connection);
connection.listen();

async function synchronize(document: TextDocument): Promise<void> {
	const manager = workspaces;
	if (!manager) return;
	const snapshot = captureDocumentSnapshot(document);
	activeAnalysis.get(snapshot.uri)?.abort();
	const controller = new AbortController();
	activeAnalysis.set(snapshot.uri, controller);
	try {
		const result = await manager.synchronizeDocument(
			snapshot.uri,
			snapshot.version,
			snapshot.source,
			controller.signal
		);
		if (
			!result ||
			controller.signal.aborted ||
			activeAnalysis.get(snapshot.uri) !== controller ||
			!isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))
		)
			return;
		void connection.sendDiagnostics({
			uri: snapshot.uri,
			version: snapshot.version,
			diagnostics: result.inspection.diagnostics.map((diagnostic) =>
				lspDiagnostic(snapshot, diagnostic)
			)
		});
		connection.languages.semanticTokens.refresh();
		void connection.languages.inlayHint.refresh();
		void connection.sendRequest('workspace/codeLens/refresh').catch(() => undefined);
	} catch (error) {
		if (!isExpectedSupersession(error)) logRequestError(error);
	} finally {
		if (activeAnalysis.get(snapshot.uri) === controller) activeAnalysis.delete(snapshot.uri);
	}
}

async function withInspection<TParams extends { textDocument: { uri: string } }, TResult>(
	params: TParams,
	project: (inspection: ExactSourceInspection, source: string, position: never) => TResult
): Promise<TResult | undefined> {
	const document = documents.get(params.textDocument.uri);
	if (!document) return undefined;
	const snapshot = captureDocumentSnapshot(document);
	const inspection = await workspaces?.inspect(snapshot.uri);
	if (!inspection || !isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri)))
		return undefined;
	const position = 'position' in params ? params.position : undefined;
	return project(inspection, snapshot.source, position as never);
}

function lspDiagnostic(
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

function diagnosticSeverity(severity: ExactSourceDiagnostic['severity']): DiagnosticSeverity {
	if (severity === 'error') return DiagnosticSeverity.Error;
	if (severity === 'warning') return DiagnosticSeverity.Warning;
	return DiagnosticSeverity.Information;
}

function workspaceEdit(
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

function flattenInspection(inspection: ExactSourceInspection): ExactSourceEntity[] {
	const flatten = (entity: ExactSourceEntity): ExactSourceEntity[] => [
		entity,
		...entity.children.flatMap(flatten)
	];
	return inspection.components.flatMap(flatten);
}

function compilerSeparation(inspection: ExactSourceInspection): string {
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

function workspaceRoots(params: InitializeParams): string[] {
	const folders = params.workspaceFolders?.flatMap((folder) =>
		folder.uri.startsWith('file:') ? [fileURLToPath(folder.uri)] : []
	);
	if (folders?.length) return folders;
	if (params.rootUri?.startsWith('file:')) return [fileURLToPath(params.rootUri)];
	return params.rootPath ? [params.rootPath] : [];
}

function isExpectedSupersession(error: unknown): boolean {
	return (
		error instanceof Error &&
		(error.name === 'AbortError' || error.name === 'ExactStaleLanguageResultError')
	);
}

function logRequestError(error: unknown): void {
	connection.console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
