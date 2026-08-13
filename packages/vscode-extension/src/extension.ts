import type {
	ExactCompilerSeparationResult,
	ExactComponentSemanticsResult,
	ExactInferenceDecorationsResult,
	ExactProjectStatusResult,
	ExactSourceEntity
} from '@exactjs/language-server';
import * as vscode from 'vscode';
import {
	LanguageClient,
	TransportKind,
	type LanguageClientOptions,
	type ServerOptions
} from 'vscode-languageclient/node.js';
import { resolveExactLanguageServerModule } from './server-module.js';
import { projectStatusPresentation } from './project-status.js';

let client: LanguageClient | undefined;

/** Activates compiler-aware eXact presentation for trusted TypeScript workspaces. */
export async function activate(context: vscode.ExtensionContext): Promise<void> {
	const configuration = vscode.workspace.getConfiguration('exact.languageTools');
	if (!configuration.get('enabled', true)) return;
	const serverModule = resolveExactLanguageServerModule(import.meta.url);
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.stdio },
		debug: { module: serverModule, transport: TransportKind.stdio }
	};
	const clientOptions: LanguageClientOptions = {
		documentSelector: [
			{ scheme: 'file', language: 'typescript' },
			{ scheme: 'file', language: 'typescriptreact' }
		],
		initializationOptions: {
			workspaceTrusted: vscode.workspace.isTrusted,
			trace: configuration.get('trace.server', 'off'),
			inlayHints: configuration.get('inlayHints', 'important')
		}
	};
	client = new LanguageClient(
		'exactLanguageTools',
		'eXact Language Tools',
		serverOptions,
		clientOptions
	);
	context.subscriptions.push(client);
	await client.start();

	const semantics = new ComponentSemanticsProvider(client);
	const regionDecoration = vscode.window.createTextEditorDecorationType({
		isWholeLine: true,
		borderWidth: '0 0 0 2px',
		borderStyle: 'solid',
		borderColor: new vscode.ThemeColor('editorInfo.foreground'),
		overviewRulerColor: new vscode.ThemeColor('editorInfo.foreground'),
		overviewRulerLane: vscode.OverviewRulerLane.Left
	});
	const inferenceDecoration = vscode.window.createTextEditorDecorationType({
		textDecoration: 'underline'
	});
	const tree = vscode.window.createTreeView('exact.componentSemantics', {
		treeDataProvider: semantics,
		showCollapseAll: true
	});
	const separation = new SeparationDocumentProvider(client);
	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
	status.name = 'eXact compiler status';
	status.command = 'exact.showComponentSemantics';
	status.show();
	context.subscriptions.push(
		tree,
		status,
		regionDecoration,
		inferenceDecoration,
		vscode.workspace.registerTextDocumentContentProvider('exact-separation', separation),
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			semantics.select(editor?.document.uri);
			void decorateEditor(editor, client!, regionDecoration);
			void decorateInferenceEvidence(editor, client!, inferenceDecoration);
			void updateStatus(status, editor?.document.uri, client!);
		}),
		vscode.workspace.onDidChangeTextDocument((event) => {
			if (event.document === vscode.window.activeTextEditor?.document) {
				semantics.refresh();
				void decorateEditor(vscode.window.activeTextEditor, client!, regionDecoration);
				void decorateInferenceEvidence(
					vscode.window.activeTextEditor,
					client!,
					inferenceDecoration
				);
				void updateStatus(status, event.document.uri, client!);
			}
		}),
		client.onNotification('exact/providerStatusChanged', ({ uri }: { uri: string }) => {
			const editor = vscode.window.activeTextEditor;
			if (editor?.document.uri.toString() === uri) {
				void updateStatus(status, editor.document.uri, client!);
				void decorateInferenceEvidence(editor, client!, inferenceDecoration);
			}
		}),
		vscode.workspace.onDidChangeConfiguration((event) => {
			if (!event.affectsConfiguration('exact.languageTools.inlayHints')) return;
			void client!.sendNotification('exact/inlayHintLevelChanged', {
				level: vscode.workspace
					.getConfiguration('exact.languageTools')
					.get('inlayHints', 'important')
			});
			void decorateInferenceEvidence(vscode.window.activeTextEditor, client!, inferenceDecoration);
		}),
		vscode.commands.registerCommand('exact.showComponentSemantics', async () => {
			semantics.select(vscode.window.activeTextEditor?.document.uri);
			await vscode.commands.executeCommand('exact.componentSemantics.focus');
		}),
		vscode.commands.registerCommand('exact.showCompilerSeparation', async () => {
			const uri = vscode.window.activeTextEditor?.document.uri;
			if (!uri) return;
			await separation.open(uri);
		}),
		vscode.commands.registerCommand(
			'exact.explainEntity',
			async (filename?: string, entityId?: string) => {
				const uri = filename
					? vscode.Uri.file(filename)
					: vscode.window.activeTextEditor?.document.uri;
				if (!uri || !entityId) return;
				const entity = await client!.sendRequest<ExactSourceEntity | undefined>(
					'exact/explainEntity',
					{ textDocument: { uri: uri.toString() }, entityId }
				);
				if (entity) await revealEntity(uri, entity);
			}
		)
	);
	semantics.select(vscode.window.activeTextEditor?.document.uri);
	await decorateEditor(vscode.window.activeTextEditor, client, regionDecoration);
	await decorateInferenceEvidence(vscode.window.activeTextEditor, client, inferenceDecoration);
	await updateStatus(status, vscode.window.activeTextEditor?.document.uri, client);
}

/** Stops the language client and its owned native workspace sessions. */
export async function deactivate(): Promise<void> {
	await client?.stop();
	client = undefined;
}

class SemanticTreeItem extends vscode.TreeItem {
	constructor(readonly entity: ExactSourceEntity) {
		super(
			entity.name ?? entity.kind,
			entity.children.length
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.None
		);
		this.description = entityDescription(entity);
		this.tooltip = entity.reasons.map((reason) => reason.summary).join('\n');
		this.contextValue = entity.kind;
		this.command = {
			command: 'exact.explainEntity',
			title: 'Reveal eXact source',
			arguments: [undefined, entity.id]
		};
	}
}

class ComponentSemanticsProvider implements vscode.TreeDataProvider<SemanticTreeItem> {
	private readonly changed = new vscode.EventEmitter<SemanticTreeItem | undefined>();
	readonly onDidChangeTreeData = this.changed.event;
	private uri: vscode.Uri | undefined;
	private inspection: ExactComponentSemanticsResult | undefined;
	private requestGeneration = 0;

	constructor(private readonly languageClient: LanguageClient) {}

	select(uri: vscode.Uri | undefined): void {
		this.uri = uri?.scheme === 'file' ? uri : undefined;
		this.refresh();
	}

	refresh(): void {
		this.requestGeneration++;
		this.inspection = undefined;
		this.changed.fire(undefined);
	}

	getTreeItem(item: SemanticTreeItem): vscode.TreeItem {
		if (this.uri)
			item.command = {
				command: 'exact.explainEntity',
				title: 'Reveal eXact source',
				arguments: [this.uri.fsPath, item.entity.id]
			};
		return item;
	}

	async getChildren(item?: SemanticTreeItem): Promise<SemanticTreeItem[]> {
		if (item) return item.entity.children.map((entity) => new SemanticTreeItem(entity));
		if (!this.uri) return [];
		if (!this.inspection) {
			const requestGeneration = this.requestGeneration;
			const inspection = await this.languageClient.sendRequest<
				ExactComponentSemanticsResult | undefined
			>('exact/componentSemantics', { textDocument: { uri: this.uri.toString() } });
			if (!inspection || requestGeneration !== this.requestGeneration) return [];
			this.inspection = inspection;
		}
		return this.inspection.components.map((component) => new SemanticTreeItem(component));
	}
}

class SeparationDocumentProvider implements vscode.TextDocumentContentProvider {
	private readonly documents = new Map<string, string>();
	private readonly changed = new vscode.EventEmitter<vscode.Uri>();
	readonly onDidChange = this.changed.event;

	constructor(private readonly languageClient: LanguageClient) {}

	provideTextDocumentContent(uri: vscode.Uri): string {
		return this.documents.get(uri.toString()) ?? 'Compiler separation is no longer current.';
	}

	async open(source: vscode.Uri): Promise<void> {
		const result = await this.languageClient.sendRequest<ExactCompilerSeparationResult | undefined>(
			'exact/compilerSeparation',
			{ textDocument: { uri: source.toString() } }
		);
		if (!result) return;
		const uri = vscode.Uri.parse(result.uri);
		this.documents.set(uri.toString(), result.content);
		this.changed.fire(uri);
		await vscode.window.showTextDocument(uri, { preview: true });
	}
}

async function decorateEditor(
	editor: vscode.TextEditor | undefined,
	languageClient: LanguageClient,
	decoration: vscode.TextEditorDecorationType
): Promise<void> {
	if (!editor || editor.document.uri.scheme !== 'file') return;
	const mode = vscode.workspace
		.getConfiguration('exact.languageTools')
		.get<'off' | 'boundaries' | 'all'>('regionDecorations', 'boundaries');
	if (mode === 'off') {
		editor.setDecorations(decoration, []);
		return;
	}
	const version = editor.document.version;
	const inspection = await languageClient.sendRequest<ExactComponentSemanticsResult | undefined>(
		'exact/componentSemantics',
		{ textDocument: { uri: editor.document.uri.toString() } }
	);
	if (!inspection || editor.document.version !== version) return;
	const entities = inspection.components
		.flatMap(flattenEntity)
		.filter((entity) =>
			mode === 'all'
				? entity.kind === 'initializer' ||
					entity.kind === 'render' ||
					entity.kind === 'inferred-task' ||
					entity.kind === 'explicit-task'
				: entity.kind === 'inferred-task' ||
					entity.kind === 'explicit-task' ||
					(entity.classification?.kind === 'task' &&
						(entity.classification.placement === 'client' ||
							entity.classification.placement === 'server'))
		);
	editor.setDecorations(
		decoration,
		entities.map((entity) => ({
			range: offsetRange(editor.document, entity.selectionRange),
			hoverMessage: `${entity.name ?? entity.kind} · compiler-owned eXact region`
		}))
	);
}

async function decorateInferenceEvidence(
	editor: vscode.TextEditor | undefined,
	languageClient: LanguageClient,
	decoration: vscode.TextEditorDecorationType
): Promise<void> {
	if (!editor || editor.document.uri.scheme !== 'file') return;
	const version = editor.document.version;
	const result = await languageClient.sendRequest<ExactInferenceDecorationsResult | undefined>(
		'exact/inferenceDecorations',
		{ textDocument: { uri: editor.document.uri.toString() } }
	);
	if (!result || result.version !== version || editor.document.version !== version) {
		editor.setDecorations(decoration, []);
		return;
	}
	editor.setDecorations(
		decoration,
		result.decorations.map((item) => ({
			range: offsetRange(editor.document, item.range),
			hoverMessage: new vscode.MarkdownString(item.hover)
		}))
	);
}

async function revealEntity(uri: vscode.Uri, entity: ExactSourceEntity): Promise<void> {
	const document = await vscode.workspace.openTextDocument(uri);
	const editor = await vscode.window.showTextDocument(document);
	const range = offsetRange(document, entity.selectionRange);
	editor.selection = new vscode.Selection(range.start, range.end);
	editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function offsetRange(
	document: vscode.TextDocument,
	range: Readonly<{ start: number; end: number }>
): vscode.Range {
	return new vscode.Range(document.positionAt(range.start), document.positionAt(range.end));
}

function flattenEntity(entity: ExactSourceEntity): ExactSourceEntity[] {
	return [entity, ...entity.children.flatMap(flattenEntity)];
}

function entityDescription(entity: ExactSourceEntity): string | undefined {
	const classification = entity.classification;
	if (classification?.kind === 'task')
		return `${classification.origin}, ${classification.placement}, ${classification.readiness}`;
	if (classification?.kind === 'initializer') return 'initializes state-machine instance';
	if (classification?.kind === 'state-assignment')
		return classification.execution === 'once-per-instance'
			? 'initializes once'
			: 'deferred reactive assignment';
	if (classification?.kind === 'render') return 'reactive';
	return undefined;
}

async function updateStatus(
	item: vscode.StatusBarItem,
	uri: vscode.Uri | undefined,
	languageClient: LanguageClient
): Promise<void> {
	if (!uri || uri.scheme !== 'file') {
		item.hide();
		return;
	}
	const status = await languageClient.sendRequest<ExactProjectStatusResult>('exact/projectStatus', {
		textDocument: { uri: uri.toString() }
	});
	const presentation = projectStatusPresentation(status);
	item.text = presentation.text;
	item.tooltip = presentation.tooltip;
	item.show();
}
