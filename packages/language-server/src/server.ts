#!/usr/bin/env node
import type { ExactRefactorKind, ExactSourceInspection } from '@exactjs/compiler';
import {
	CodeActionKind,
	createConnection,
	ProposedFeatures,
	TextDocuments
} from 'vscode-languageserver/node.js';
import type {
	CodeAction,
	CodeLens,
	CompletionItem,
	DocumentSymbol,
	Hover,
	InitializeParams,
	InitializeResult,
	SemanticTokens,
	WorkspaceEdit
} from 'vscode-languageserver/node.js';
import { MarkupKind } from 'vscode-languageserver/node.js';
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
import { captureDocumentSnapshot, isCurrentDocumentSnapshot } from './document-snapshots.js';
import {
	lspRange,
	projectCodeLenses,
	projectDocumentSymbols,
	projectHover,
	projectSemanticTokens,
	projectTaskRename,
	projectTaskStatusCompletions,
	sourceOffset
} from './lsp-projections.js';
import { ExactLanguageWorkspaceManager } from './workspace-manager.js';
import { supportsExactWorkspaceFolderChanges } from './workspace-folders.js';
import { createServerSourceAccess } from './server-source-access.js';
import {
	compilerSeparation,
	flattenInspection,
	hoverMarkdown,
	isExpectedSupersession,
	lspDiagnostic,
	lspProviderDiagnostic,
	providerWorkspaceEdit,
	workspaceEdit,
	workspaceRoots
} from './server-projections.js';
import { exactLanguageServerCapabilities } from './capabilities.js';
import { registerInlayPresentation } from './inlay-presentation.js';
import { ExactDocumentAnalysisState } from './document-analysis-state.js';

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const { sourceForUri, logRequestError } = createServerSourceAccess(documents, connection);
const analyses = new ExactDocumentAnalysisState();
let workspaces: ExactLanguageWorkspaceManager | undefined;
let workspaceFolderChangesSupported = false;
let shuttingDown = false;
const inlayPresentation = registerInlayPresentation(
	connection,
	documents,
	() => workspaces,
	(uri) => analyses.presentationBlocked(uri, documents.get(uri)?.version)
);

connection.onInitialize((params: InitializeParams): InitializeResult => {
	const initialization = (params.initializationOptions ??
		{}) as ExactLanguageServerInitializationOptions;
	workspaceFolderChangesSupported = supportsExactWorkspaceFolderChanges(params);
	inlayPresentation.setLevel(initialization.inlayHints);
	const roots = workspaceRoots(params);
	workspaces = new ExactLanguageWorkspaceManager(roots, initialization.workspaceTrusted === true);
	return {
		serverInfo: { name: '@exactjs/language-server', version: '0.1.0' },
		capabilities: exactLanguageServerCapabilities
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
	analyses.close(event.document.uri);
	void workspaces?.closeDocument(event.document.uri).catch(logRequestError);
	void connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.onHover(async (params): Promise<Hover | undefined> => {
	const document = documents.get(params.textDocument.uri);
	if (!document) return undefined;
	const snapshot = captureDocumentSnapshot(document);
	const inspection = await workspaces?.inspect(snapshot.uri);
	if (!inspection || !isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri)))
		return undefined;
	const core = projectHover(inspection, snapshot.source, params.position);
	const contributions = await workspaces?.hover(
		snapshot.uri,
		sourceOffset(snapshot.source, params.position)
	);
	if (!isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))) return undefined;
	const providerMarkdown = (contributions ?? []).map(
		({ provider, value }) => `${value.markdown}\n\n_Source: ${provider}_`
	);
	if (!providerMarkdown.length) return core;
	const coreValue = hoverMarkdown(core);
	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: [...(coreValue ? [coreValue] : []), ...providerMarkdown].join('\n\n---\n\n')
		},
		...(core?.range ? { range: core.range } : {})
	};
});
connection.onCompletion(async (params): Promise<CompletionItem[]> => {
	const document = documents.get(params.textDocument.uri);
	if (!document) return [];
	const snapshot = captureDocumentSnapshot(document);
	const inspection = await workspaces?.inspect(snapshot.uri);
	if (!inspection || !isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))) return [];
	const core = projectTaskStatusCompletions(inspection, snapshot.source, params.position);
	const contributions = await workspaces?.complete(
		snapshot.uri,
		sourceOffset(snapshot.source, params.position),
		params.context?.triggerCharacter
	);
	if (!isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))) return [];
	return [
		...core,
		...(contributions ?? []).map(({ provider, value }) => ({
			label: value.label,
			detail: value.detail ? `${value.detail} · ${provider}` : provider,
			documentation: value.documentation,
			insertText: value.insertText,
			sortText: value.sortText,
			...(value.replace
				? {
						textEdit: {
							range: lspRange(snapshot.source, value.replace),
							newText: value.insertText ?? value.label
						}
					}
				: {})
		}))
	];
});
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
	const actions: CodeAction[] = [];
	if (task) {
		const kinds: ExactRefactorKind[] =
			task.kind === 'inferred-task'
				? ['convert-to-explicit-task']
				: ['convert-to-inferred-task', 'make-placement-explicit'];
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
	}
	const providerActions = await manager.languageCodeActions(
		snapshot.uri,
		sourceRange,
		params.context.diagnostics.flatMap((diagnostic) =>
			typeof diagnostic.code === 'string' ? [diagnostic.code] : []
		)
	);
	for (const { provider, value } of providerActions) {
		actions.push({
			title: value.title,
			kind: value.kind === 'quickfix' ? CodeActionKind.QuickFix : CodeActionKind.RefactorRewrite,
			edit: providerWorkspaceEdit(value.edits, sourceForUri),
			data: { provider }
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
			...(inspection?.compiler ? { compiler: inspection.compiler } : {}),
			providers: await workspaces?.providerStatus(params.textDocument.uri),
			...(workspaces?.providerFailure(params.textDocument.uri)
				? { providerFailure: workspaces.providerFailure(params.textDocument.uri) }
				: {})
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
	shuttingDown = true;
	analyses.dispose();
	await workspaces?.dispose();
});

documents.listen(connection);
connection.listen();

async function synchronize(document: TextDocument): Promise<void> {
	const manager = workspaces;
	if (!manager) return;
	const snapshot = captureDocumentSnapshot(document);
	const controller = analyses.start(snapshot.uri, snapshot.version);
	if (!controller) return;
	try {
		const result = await manager.synchronizeDocument(
			snapshot.uri,
			snapshot.version,
			snapshot.source,
			controller.signal
		);
		if (
			!result ||
			shuttingDown ||
			controller.signal.aborted ||
			!analyses.isCurrent(snapshot.uri, controller) ||
			!isCurrentDocumentSnapshot(snapshot, documents.get(snapshot.uri))
		)
			return;
		// Publish readiness before refresh notifications so follow-up presentation requests
		// observe the completed provider generation instead of being fenced as concurrent work.
		if (!analyses.publish(snapshot.uri, snapshot.version, controller)) return;
		void connection.sendDiagnostics({
			uri: snapshot.uri,
			version: snapshot.version,
			diagnostics: [
				...result.inspection.diagnostics.map((diagnostic) => lspDiagnostic(snapshot, diagnostic)),
				...result.providerDiagnostics.map((diagnostic) =>
					lspProviderDiagnostic(snapshot, diagnostic, sourceForUri)
				)
			]
		});
		void connection.sendNotification('exact/providerStatusChanged', { uri: snapshot.uri });
		connection.languages.semanticTokens.refresh();
		void connection.languages.inlayHint.refresh().catch(logPresentationError);
		void connection.sendRequest('workspace/codeLens/refresh').catch(() => undefined);
	} catch (error) {
		if (!isExpectedSupersession(error)) logRequestError(error);
	} finally {
		analyses.finish(snapshot.uri, controller);
	}
}

function logPresentationError(error: unknown): void {
	if (!shuttingDown) logRequestError(error);
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
