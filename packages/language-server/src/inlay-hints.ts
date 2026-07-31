import type { ExactSourceEntity, ExactSourceInspection } from '@exactjs/compiler';
import { InlayHint, InlayHintKind, MarkupKind, Position } from 'vscode-languageserver/node.js';
import type { InlayHintLabelPart } from 'vscode-languageserver/node.js';
import { entityFacts, reasonFacts } from './entity-explanations.js';

/**
 * Projects concise semantic badges beside the operation they classify.
 *
 * Assignment badges precede the authored expression and call badges follow the opening
 * parenthesis. Both anchors are token boundaries, preserving TypeScript syntax classification.
 */
export function projectInlayHints(inspection: ExactSourceInspection, source: string): InlayHint[] {
	return flattenInspection(inspection).flatMap((entity) => {
		const classification = entity.classification;
		if (classification?.kind === 'state-assignment')
			return [
				semanticBadge(
					lineFirstTokenPosition(source, entity.selectionRange.start),
					entity,
					[
						classification.execution === 'once-per-instance'
							? badge('⚙', 'Initialization', `Initializes ${classification.effect.path} once.`)
							: badge(
									'⚡',
									'Deferred reactive assignment',
									`Reevaluates ${classification.effect.path} when its reactive inputs change.`
								)
					],
					classification.execution === 'once-per-instance'
						? 'Initialization'
						: 'Deferred reactive assignment',
					entityFacts(entity)
				)
			];
		if (classification?.kind === 'derived') {
			const badges = [
				semanticBadge(
					positionAt(source, classification.definition.end),
					entity,
					[badge('🔗', 'Derived reactive', 'This binding links reactive inputs to its consumers.')],
					'Derived reactive',
					entityFacts(entity)
				),
				...classification.references.map((reference) =>
					semanticBadge(
						positionAt(source, reference.start),
						entity,
						[
							badge(
								'🔗',
								'Derived reactive use',
								'This use reads a compiler-tracked derived value.'
							)
						],
						'Derived reactive use',
						entityFacts(entity)
					)
				)
			];
			return badges;
		}
		if (classification?.kind === 'task')
			return [
				semanticBadge(
					classification.origin === 'explicit'
						? callArgumentPosition(source, entity)
						: lineFirstTokenPosition(source, entity.selectionRange.start),
					entity,
					[
						badge('📋', 'Task', 'Compiler-owned asynchronous work.'),
						classification.origin === 'inferred'
							? badge(
									'⚡',
									'Inferred',
									'The compiler inferred this task from authored control flow.'
								)
							: undefined,
						placementBadge(classification.placement),
						classification.priority === 'deferred'
							? badge('⏳', 'Deferred priority', 'This task is scheduled as deferred work.')
							: undefined,
						classification.publication === 'immediate'
							? badge(
									'🚨',
									'Immediate publication',
									'State effects publish as the task progresses instead of staging until completion.'
								)
							: undefined
					],
					classification.origin === 'explicit' ? 'Task with authored policy' : 'Inferred task',
					entityFacts(entity)
				)
			];
		return [];
	});
}

type InlayBadge = Readonly<{
	icon: string;
	title: string;
	detail: string;
}>;

function semanticBadge(
	position: Position,
	entity: ExactSourceEntity,
	badges: readonly (InlayBadge | undefined)[],
	title: string,
	facts: readonly string[]
): InlayHint {
	const label = badges.filter((candidate): candidate is InlayBadge => candidate !== undefined);
	const hint = InlayHint.create(position, label.map(badgeLabelPart), InlayHintKind.Type);
	hint.paddingRight = true;
	hint.tooltip = {
		kind: MarkupKind.Markdown,
		value: [`### ${title}`, ...facts, ...reasonFacts(entity)].join('\n\n')
	};
	return hint;
}

function badge(icon: string, title: string, detail: string): InlayBadge {
	return { icon, title, detail };
}

function badgeLabelPart(value: InlayBadge, index: number): InlayHintLabelPart {
	return {
		value: `${index ? ' ' : ''}${value.icon}`,
		tooltip: {
			kind: MarkupKind.Markdown,
			value: `**${value.title}**\n\n${value.detail}`
		}
	};
}

function placementBadge(placement: 'server' | 'client' | 'isomorphic' | 'unknown'): InlayBadge {
	switch (placement) {
		case 'server':
			return badge('🖥', 'Server placement', 'This work executes on the server.');
		case 'client':
			return badge('📱', 'Client placement', 'This work executes in the browser.');
		case 'isomorphic':
			return badge(
				'⇄',
				'Isomorphic placement',
				'This work is valid in server and client contexts.'
			);
		case 'unknown':
			return badge('?', 'Unknown placement', 'The compiler cannot prove a placement yet.');
	}
}

function callArgumentPosition(source: string, entity: ExactSourceEntity): Position {
	const opening = source.indexOf('(', entity.selectionRange.end);
	const bounded =
		opening >= entity.selectionRange.end && opening < entity.range.end
			? opening + 1
			: entity.selectionRange.end;
	return positionAt(source, bounded);
}

function lineFirstTokenPosition(source: string, requested: number): Position {
	let offset = source.lastIndexOf('\n', Math.max(0, requested - 1)) + 1;
	while (offset < source.length && (source[offset] === ' ' || source[offset] === '\t')) offset++;
	return positionAt(source, offset);
}

function positionAt(source: string, requested: number): Position {
	const offset = Math.max(0, Math.min(source.length, requested));
	const before = source.slice(0, offset);
	const lines = before.split('\n');
	return Position.create(lines.length - 1, lines.at(-1)!.replace(/\r$/, '').length);
}

function flattenInspection(inspection: ExactSourceInspection): ExactSourceEntity[] {
	return inspection.components.flatMap(flattenEntity);
}

function flattenEntity(entity: ExactSourceEntity): ExactSourceEntity[] {
	return [entity, ...entity.children.flatMap(flattenEntity)];
}
