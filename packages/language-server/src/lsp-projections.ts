import type {
	ExactSourceEntity,
	ExactSourceInspection,
	ExactSourceRange,
	ExactTaskClassification
} from '@exactjs/compiler';
import {
	DocumentSymbol,
	MarkupKind,
	Position,
	Range,
	SemanticTokensBuilder,
	SymbolKind
} from 'vscode-languageserver/node.js';
import type { CodeLens, Hover, SemanticTokens } from 'vscode-languageserver/node.js';
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
	'exact.component',
	'exact.initializer',
	'exact.render',
	'exact.inferredTask',
	'exact.explicitTask',
	'exact.action',
	'exact.derived',
	'exact.dependency',
	'exact.effect',
	'exact.server',
	'exact.client',
	'exact.blocking',
	'exact.deferred',
	'exact.owned',
	'exact.disposable'
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
		case 'action':
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
			modifiers.push('exact.component');
			type = 'function';
			break;
		case 'explicit-task':
			modifiers.push('exact.explicitTask');
			type = 'method';
			break;
		case 'action':
			modifiers.push('exact.action');
			type = 'method';
			break;
		case 'derived':
			modifiers.push('exact.derived');
			type = 'variable';
			break;
		default:
			return undefined;
	}
	const classification = entity.classification;
	if (classification?.kind === 'task') {
		if (classification.placement === 'server') modifiers.push('exact.server');
		if (classification.placement === 'client') modifiers.push('exact.client');
		if (classification.readiness === 'blocking') modifiers.push('exact.blocking');
		if (classification.priority === 'deferred') modifiers.push('exact.deferred');
		if (classification.resources.length) modifiers.push('exact.owned', 'exact.disposable');
	}
	if (classification?.kind === 'action') {
		if (classification.placement === 'server') modifiers.push('exact.server');
		if (classification.placement === 'client') modifiers.push('exact.client');
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
	const effects = classification.effects.map((effect) => effect.path ?? effect.kind).join(', ');
	const flow =
		dependencies || effects ? ` · ${dependencies || 'event'} → ${effects || 'effect'}` : '';
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
