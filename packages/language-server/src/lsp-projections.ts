import type {
	ExactSourceEntity,
	ExactSourceInspection,
	ExactSourceRange,
	ExactTaskClassification
} from '@exactjs/compiler';
import {
	DocumentSymbol,
	CompletionItemKind,
	MarkupKind,
	Position,
	Range,
	SemanticTokensBuilder,
	SymbolKind
} from 'vscode-languageserver/node.js';
import type {
	CodeLens,
	CompletionItem,
	Hover,
	SemanticTokens,
	TextEdit,
	WorkspaceEdit
} from 'vscode-languageserver/node.js';
import { capitalize, entityFacts } from './entity-explanations.js';
import { projectInlayHints } from './inlay-hints.js';

export { projectInlayHints };

/** Base token types emitted only for eXact-owned semantic distinctions. */
export const exactSemanticTokenTypes = Object.freeze([
	'function',
	'variable',
	'property',
	'method'
]);

/** Stable semantic-token modifiers understood by eXact editor clients. */
export const exactSemanticTokenModifiers = Object.freeze([
	'exactComponent',
	'exactInitializer',
	'exactRender',
	'exactInferredTask',
	'exactExplicitTask',
	'exactDerived',
	'exactDependency',
	'exactEffect',
	'exactServer',
	'exactClient',
	'exactBlocking',
	'exactDeferred',
	'exactOwned',
	'exactDisposable'
]);

/** Projects compiler classifications into standard full semantic tokens. */
export function projectSemanticTokens(
	inspection: ExactSourceInspection,
	source: string
): SemanticTokens {
	const builder = new SemanticTokensBuilder();
	for (const entity of flattenInspection(inspection)) {
		const projection = entitySemanticToken(entity);
		if (!projection) continue;
		const range = lspRange(source, entity.selectionRange);
		if (range.start.line !== range.end.line) continue;
		builder.push(
			range.start.line,
			range.start.character,
			Math.max(1, range.end.character - range.start.character),
			exactSemanticTokenTypes.indexOf(projection.type),
			modifierMask(projection.modifiers)
		);
	}
	return builder.build();
}

/** Projects a detailed compiler explanation at one source position. */
export function projectHover(
	inspection: ExactSourceInspection,
	source: string,
	position: Position
): Hover | undefined {
	const offset = sourceOffset(source, position);
	const status = taskStatusMemberAt(inspection, source, offset);
	if (status?.member) {
		return {
			contents: {
				kind: MarkupKind.Markdown,
				value: `### ${status.name}.${status.member}\n\n${taskStatusDescription(status.member)}`
			},
			range: lspRange(source, status.memberRange)
		};
	}
	const entity = smallestEntityAt(inspection, offset);
	if (!entity) return undefined;
	const facts = entityFacts(entity);
	const reasons = entity.reasons.flatMap((reason) => [
		`**${reason.code}** — ${reason.summary}`,
		...(reason.related ?? []).map((related) => `- ${related.summary}`)
	]);
	return {
		contents: {
			kind: MarkupKind.Markdown,
			value: [`### ${entity.name ?? entity.kind}`, ...facts, ...reasons].join('\n\n')
		},
		range: lspRange(source, entity.selectionRange)
	};
}

/** Provides compiler-synthetic task status members at recognized task facades. */
export function projectTaskStatusCompletions(
	inspection: ExactSourceInspection,
	source: string,
	position: Position
): CompletionItem[] {
	const status = taskStatusMemberAt(inspection, source, sourceOffset(source, position), true);
	if (!status) return [];
	return taskStatusMembers.map((member) => ({
		label: member,
		detail: taskStatusDescription(member),
		kind: member === 'cancel' ? CompletionItemKind.Method : CompletionItemKind.Property
	}));
}

/** Renames a compiler-recognized task definition and its statically resolvable references. */
export function projectTaskRename(
	inspection: ExactSourceInspection,
	source: string,
	position: Position,
	newName: string,
	uri: string
): WorkspaceEdit | undefined {
	if (!/^[A-Za-z_$][\w$]*$/.test(newName)) return undefined;
	const status = taskStatusMemberAt(inspection, source, sourceOffset(source, position), true);
	const entity =
		status?.entity ??
		flattenInspection(inspection).find(
			(candidate) =>
				isTaskEntity(candidate) &&
				sourceOffset(source, position) >= candidate.selectionRange.start &&
				sourceOffset(source, position) <= candidate.selectionRange.end
		);
	if (!entity) return undefined;
	const name = source.slice(entity.selectionRange.start, entity.selectionRange.end);
	if (!/^[A-Za-z_$][\w$]*$/.test(name)) return undefined;
	const edits: TextEdit[] = [];
	const pattern = new RegExp(`\\b${name.replace(/[$]/g, '\\$&')}\\b`, 'g');
	for (const match of source.matchAll(pattern))
		edits.push({
			range: lspRange(source, { start: match.index, end: match.index + name.length }),
			newText: newName
		});
	return { changes: { [uri]: edits } };
}

/** Projects one compact component summary into a standard CodeLens item. */
export function projectCodeLenses(inspection: ExactSourceInspection, source: string): CodeLens[] {
	const lenses: CodeLens[] = [];
	for (const component of inspection.components) {
		const descendants = flattenEntity(component);
		const tasks = descendants.filter(
			(entity) => entity.kind === 'inferred-task' || entity.kind === 'explicit-task'
		);
		const derived = descendants.filter(
			(entity) =>
				entity.kind === 'derived' ||
				(entity.classification?.kind === 'state-assignment' &&
					entity.classification.execution === 'deferred-reactive')
		);
		const summary = [
			'eXact',
			...(tasks.length ? [`${tasks.length} task${tasks.length === 1 ? '' : 's'}`] : []),
			...(derived.length ? [`${derived.length} reactive`] : [])
		].join(' · ');
		lenses.push({
			range: lspRange(source, component.selectionRange),
			command: {
				title: summary,
				command: 'exact.showComponentSemantics',
				arguments: [inspection.filename, component.id]
			}
		});
	}
	return lenses;
}

/** Projects the compiler's authored component tree as document symbols. */
export function projectDocumentSymbols(
	inspection: ExactSourceInspection,
	source: string
): DocumentSymbol[] {
	return inspection.components.map((component) =>
		DocumentSymbol.create(
			component.name,
			'eXact component',
			SymbolKind.Function,
			lspRange(source, component.range),
			lspRange(source, component.selectionRange),
			component.children.map((child) => symbolForEntity(child, source))
		)
	);
}

/** Converts a UTF-16 compiler range into an LSP line/character range. */
export function lspRange(source: string, range: ExactSourceRange): Range {
	return Range.create(positionAt(source, range.start), positionAt(source, range.end));
}

/** Converts an LSP position into a UTF-16 source offset. */
export function sourceOffset(source: string, position: Position): number {
	let line = 0;
	let offset = 0;
	while (line < position.line && offset < source.length) {
		const newline = source.indexOf('\n', offset);
		if (newline < 0) return source.length;
		offset = newline + 1;
		line++;
	}
	return Math.min(source.length, offset + position.character);
}

function positionAt(source: string, requested: number): Position {
	const offset = Math.max(0, Math.min(source.length, requested));
	const before = source.slice(0, offset);
	const lines = before.split('\n');
	return Position.create(lines.length - 1, lines.at(-1)!.replace(/\r$/, '').length);
}

function symbolForEntity(entity: ExactSourceEntity, source: string): DocumentSymbol {
	return DocumentSymbol.create(
		entity.name ?? entity.kind,
		entityDetail(entity),
		symbolKind(entity),
		lspRange(source, entity.range),
		lspRange(source, entity.selectionRange),
		entity.children.map((child) => symbolForEntity(child, source))
	);
}

function symbolKind(entity: ExactSourceEntity): SymbolKind {
	switch (entity.kind) {
		case 'inferred-task':
		case 'explicit-task':
		case 'interaction':
			return SymbolKind.Method;
		case 'derived':
		case 'state-assignment':
		case 'binding':
			return SymbolKind.Variable;
		case 'render':
		case 'render-expression':
			return SymbolKind.Interface;
		default:
			return SymbolKind.Namespace;
	}
}

function entityDetail(entity: ExactSourceEntity): string {
	const classification = entity.classification;
	return classification?.kind === 'task' ? taskLensTitle(classification) : entity.kind;
}

type ExactSemanticTokenProjection = Readonly<{
	type: (typeof exactSemanticTokenTypes)[number];
	modifiers: readonly string[];
}>;

/**
 * Selects only identifier-shaped entities whose standard token type agrees with TypeScript.
 *
 * Keywords, JSX tags, and inferred `await` sites remain owned by TypeScript/TextMate coloring;
 * emitting an eXact token over those ranges would replace their normal syntax classification.
 */
function entitySemanticToken(entity: ExactSourceEntity): ExactSemanticTokenProjection | undefined {
	const modifiers: string[] = [];
	let type: ExactSemanticTokenProjection['type'];
	switch (entity.kind) {
		case 'component':
			modifiers.push('exactComponent');
			type = 'function';
			break;
		case 'explicit-task':
			modifiers.push('exactExplicitTask');
			type = 'method';
			break;
		case 'derived':
			modifiers.push('exactDerived');
			type = 'variable';
			break;
		default:
			return undefined;
	}
	const classification = entity.classification;
	if (classification?.kind === 'task') {
		if (classification.placement === 'server') modifiers.push('exactServer');
		if (classification.placement === 'client') modifiers.push('exactClient');
		if (classification.readiness === 'blocking') modifiers.push('exactBlocking');
		if (classification.priority === 'deferred') modifiers.push('exactDeferred');
		if (classification.resources.length) modifiers.push('exactOwned', 'exactDisposable');
	}
	return { type, modifiers };
}

function modifierMask(modifiers: readonly string[]): number {
	let mask = 0;
	for (const modifier of modifiers) {
		const index = exactSemanticTokenModifiers.indexOf(modifier);
		if (index >= 0) mask |= 1 << index;
	}
	return mask;
}

function taskLensTitle(classification: ExactTaskClassification): string {
	const dependencies = classification.dependencies.map((dependency) => dependency.path).join(', ');
	const captures = classification.capturedInputs.map((input) => input.path).join(', ');
	const effects = classification.effects.map((effect) => effect.path ?? effect.kind).join(', ');
	const flow =
		dependencies || captures || effects
			? ` · ${dependencies || 'event'}${captures ? ` + snapshot(${captures})` : ''} → ${effects || 'effect'}`
			: '';
	return `${capitalize(classification.origin)} ${classification.readiness} ${classification.placement} task${flow}`;
}

function flattenInspection(inspection: ExactSourceInspection): ExactSourceEntity[] {
	return inspection.components.flatMap(flattenEntity);
}

function flattenEntity(entity: ExactSourceEntity): ExactSourceEntity[] {
	return [entity, ...entity.children.flatMap(flattenEntity)];
}

function smallestEntityAt(
	inspection: ExactSourceInspection,
	offset: number
): ExactSourceEntity | undefined {
	return flattenInspection(inspection)
		.filter(
			(entity) =>
				entity.kind !== 'initializer' &&
				offset >= entity.selectionRange.start &&
				offset < entity.selectionRange.end
		)
		.sort(
			(left, right) =>
				left.selectionRange.end -
				left.selectionRange.start -
				(right.selectionRange.end - right.selectionRange.start)
		)[0];
}

const taskStatusMembers = [
	'pending',
	'pendingCount',
	'generation',
	'result',
	'error',
	'cancel'
] as const;

type TaskStatusMember = (typeof taskStatusMembers)[number];

function taskStatusDescription(member: TaskStatusMember): string {
	if (member === 'pending') return 'Whether this owner has foreground task work pending.';
	if (member === 'pendingCount') return 'The number of foreground generations pending.';
	if (member === 'generation') return 'The greatest accepted generation number.';
	if (member === 'result') return 'The latest accepted task result, when available.';
	if (member === 'error') return 'The latest non-cancellation task failure.';
	return 'Cancels every represented generation and its attached descendants.';
}

function taskStatusMemberAt(
	inspection: ExactSourceInspection,
	source: string,
	offset: number,
	allowEmpty = false
):
	| Readonly<{
			entity: ExactSourceEntity;
			name: string;
			member?: TaskStatusMember;
			memberRange: ExactSourceRange;
	  }>
	| undefined {
	const prefix = source.slice(0, offset);
	const match = /([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)?$/.exec(prefix);
	if (!match || (!allowEmpty && !match[2])) return undefined;
	const entity = flattenInspection(inspection).find(
		(candidate) =>
			isTaskEntity(candidate) &&
			source.slice(candidate.selectionRange.start, candidate.selectionRange.end) === match[1]
	);
	if (!entity) return undefined;
	const member = taskStatusMembers.find((candidate) => candidate === match[2]);
	if (match[2] && !member) return undefined;
	const start = offset - (match[2]?.length ?? 0);
	return {
		entity,
		name: match[1],
		...(member ? { member } : {}),
		memberRange: Object.freeze({ start, end: offset })
	};
}

function isTaskEntity(entity: ExactSourceEntity): boolean {
	return entity.kind === 'inferred-task' || entity.kind === 'explicit-task';
}
