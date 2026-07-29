import type {
	ExactSourceEntity,
	ExactSourceInspection,
	ExactSourceRange,
	ExactTaskClassification
} from '@exactjs/compiler';
import {
	DocumentSymbol,
	InlayHint,
	InlayHintKind,
	MarkupKind,
	Position,
	Range,
	SemanticTokensBuilder,
	SymbolKind
} from 'vscode-languageserver/node.js';
import type { CodeLens, Hover, SemanticTokens } from 'vscode-languageserver/node.js';

/** Base token types emitted only for eXact-owned semantic distinctions. */
export const exactSemanticTokenTypes = Object.freeze(['function', 'variable', 'property']);

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
		const modifiers = entityModifiers(entity);
		if (!modifiers.length) continue;
		const range = lspRange(source, entity.selectionRange);
		if (range.start.line !== range.end.line) continue;
		builder.push(
			range.start.line,
			range.start.character,
			Math.max(1, range.end.character - range.start.character),
			entity.kind === 'component' || entity.kind === 'action' ? 0 : 1,
			modifierMask(modifiers)
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
		range: lspRange(source, entity.range)
	};
}

/** Projects concise component and task summaries into standard CodeLens items. */
export function projectCodeLenses(inspection: ExactSourceInspection, source: string): CodeLens[] {
	const lenses: CodeLens[] = [];
	for (const component of inspection.components) {
		const descendants = flattenEntity(component);
		const tasks = descendants.filter(
			(entity) => entity.kind === 'inferred-task' || entity.kind === 'explicit-task'
		);
		const derived = descendants.filter((entity) => entity.kind === 'derived');
		lenses.push({
			range: lspRange(source, component.selectionRange),
			command: {
				title: `eXact component · setup once · ${tasks.length} task${tasks.length === 1 ? '' : 's'} · ${derived.length} derived`,
				command: 'exact.showComponentSemantics',
				arguments: [inspection.filename, component.id]
			}
		});
		for (const task of tasks) {
			const classification = task.classification?.kind === 'task' ? task.classification : undefined;
			if (!classification) continue;
			lenses.push({
				range: lspRange(source, task.selectionRange),
				command: {
					title: taskLensTitle(classification),
					command: 'exact.explainEntity',
					arguments: [inspection.filename, task.id]
				}
			});
		}
	}
	return lenses;
}

/**
 * Projects important placement, readiness, and ownership facts as line-edge badges.
 *
 * Badge positions are always after the authored source on the entity's selection line. Keeping
 * the hints outside token ranges prevents presentation metadata from splitting TypeScript tokens.
 */
export function projectInlayHints(inspection: ExactSourceInspection, source: string): InlayHint[] {
	return flattenInspection(inspection).flatMap((entity) => {
		const classification = entity.classification;
		if (classification?.kind === 'initializer')
			return [
				lineEdgeBadge(
					source,
					entity,
					'◆',
					'Initialization',
					'Runs once per component instance.',
					entityFacts(entity)
				)
			];
		if (classification?.kind !== 'task') return [];
		return [
			lineEdgeBadge(
				source,
				entity,
				classification.origin === 'explicit' ? '▶' : '⚡',
				classification.origin === 'explicit' ? 'Explicit task' : 'Inferred task',
				`${capitalize(classification.readiness)} ${classification.placement} work.`,
				entityFacts(entity)
			)
		];
	});
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

function lineEdgeBadge(
	source: string,
	entity: ExactSourceEntity,
	icon: string,
	title: string,
	summary: string,
	facts: readonly string[]
): InlayHint {
	const hint = InlayHint.create(
		lineEndPosition(source, entity.selectionRange.start),
		icon,
		InlayHintKind.Type
	);
	hint.paddingLeft = true;
	hint.tooltip = {
		kind: MarkupKind.Markdown,
		value: [`### ${title}`, summary, ...facts, ...reasonFacts(entity)].join('\n\n')
	};
	return hint;
}

function lineEndPosition(source: string, requested: number): Position {
	const selection = positionAt(source, requested);
	const lineStart = sourceOffset(source, Position.create(selection.line, 0));
	const newline = source.indexOf('\n', lineStart);
	const rawEnd = newline < 0 ? source.length : newline;
	const lineEnd = rawEnd > lineStart && source.charCodeAt(rawEnd - 1) === 13 ? rawEnd - 1 : rawEnd;
	return positionAt(source, lineEnd);
}

function reasonFacts(entity: ExactSourceEntity): string[] {
	return entity.reasons.flatMap((reason) => [
		`**Why:** ${reason.summary}`,
		...(reason.related ?? []).map((related) => `- ${related.summary}`)
	]);
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

function entityModifiers(entity: ExactSourceEntity): string[] {
	const modifiers: string[] = [];
	switch (entity.kind) {
		case 'component':
			modifiers.push('exact.component');
			break;
		case 'initializer':
			modifiers.push('exact.initializer');
			break;
		case 'render':
		case 'render-expression':
			modifiers.push('exact.render');
			break;
		case 'inferred-task':
			modifiers.push('exact.inferredTask');
			break;
		case 'explicit-task':
			modifiers.push('exact.explicitTask');
			break;
		case 'action':
			modifiers.push('exact.action');
			break;
		case 'derived':
			modifiers.push('exact.derived');
			break;
	}
	const classification = entity.classification;
	if (classification?.kind === 'task') {
		if (classification.placement === 'server') modifiers.push('exact.server');
		if (classification.placement === 'client') modifiers.push('exact.client');
		if (classification.readiness === 'blocking') modifiers.push('exact.blocking');
		if (classification.priority === 'deferred') modifiers.push('exact.deferred');
		if (classification.resources.length) modifiers.push('exact.owned', 'exact.disposable');
	}
	return modifiers;
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

function entityFacts(entity: ExactSourceEntity): string[] {
	const classification = entity.classification;
	if (!classification) return [];
	if (classification.kind === 'initializer')
		return [`Runs **${classification.execution}** with **${classification.placement}** placement.`];
	if (classification.kind === 'render')
		return [
			'Runs as fine-grained **reactive** render work.',
			...classification.dependencies.map(
				(dependency) =>
					`Dependency: \`${dependency.path}\`${dependency.confidence === 'exact' ? '' : ` (${dependency.confidence})`}`
			)
		];
	if (classification.kind === 'task')
		return [
			`${capitalize(classification.origin)} **${classification.readiness} ${classification.placement}** task.`,
			`Priority: **${classification.priority}**. Publication: **${classification.publication}**.`,
			`Cancellation: **${classification.cancellation}**.`,
			...classification.dependencies.map(
				(dependency) =>
					`Dependency: \`${dependency.path}\`${dependency.confidence === 'exact' ? '' : ` (${dependency.confidence})`}`
			),
			...classification.effects.map(
				(effect) =>
					`Effect: \`${effect.path ?? effect.kind}\`${effect.confidence === 'exact' ? '' : ` (${effect.confidence})`}`
			)
		];
	return [];
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
		.filter((entity) => offset >= entity.range.start && offset <= entity.range.end)
		.sort(
			(left, right) => left.range.end - left.range.start - (right.range.end - right.range.start)
		)[0];
}

function capitalize(value: string): string {
	return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
