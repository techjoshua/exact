import type { ExactSourceEntity, ExactSourceInspection } from '@exactjs/compiler';
import { InlayHint, InlayHintKind, MarkupKind, Position } from 'vscode-languageserver/node.js';
import type { InlayHintLabelPart } from 'vscode-languageserver/node.js';
import { entityFacts, reasonFacts } from './entity-explanations.js';

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
					[
						badge('⚙', 'Initialization', 'Setup runs once per component instance.'),
						placementBadge(classification.placement)
					],
					'Initialization',
					entityFacts(entity)
				)
			];
		if (classification?.kind === 'task')
			return [
				lineEdgeBadge(
					source,
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
					classification.origin === 'explicit' ? 'Explicit task' : 'Inferred task',
					entityFacts(entity)
				)
			];
		if (classification?.kind === 'action')
			return [
				lineEdgeBadge(
					source,
					entity,
					[
						badge('▶', 'Action', 'Named component-owned interaction work.'),
						placementBadge(classification.placement)
					],
					'Action',
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

function lineEdgeBadge(
	source: string,
	entity: ExactSourceEntity,
	badges: readonly (InlayBadge | undefined)[],
	title: string,
	facts: readonly string[]
): InlayHint {
	const label = badges.filter((candidate): candidate is InlayBadge => candidate !== undefined);
	const hint = InlayHint.create(
		lineEndPosition(source, entity.selectionRange.start),
		label.map(badgeLabelPart),
		InlayHintKind.Type
	);
	hint.paddingLeft = true;
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

function lineEndPosition(source: string, requested: number): Position {
	const selection = positionAt(source, requested);
	const lineStart = sourceOffset(source, Position.create(selection.line, 0));
	const newline = source.indexOf('\n', lineStart);
	const rawEnd = newline < 0 ? source.length : newline;
	const lineEnd = rawEnd > lineStart && source.charCodeAt(rawEnd - 1) === 13 ? rawEnd - 1 : rawEnd;
	return positionAt(source, lineEnd);
}

function positionAt(source: string, requested: number): Position {
	const offset = Math.max(0, Math.min(source.length, requested));
	const before = source.slice(0, offset);
	const lines = before.split('\n');
	return Position.create(lines.length - 1, lines.at(-1)!.replace(/\r$/, '').length);
}

function sourceOffset(source: string, position: Position): number {
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

function flattenInspection(inspection: ExactSourceInspection): ExactSourceEntity[] {
	return inspection.components.flatMap(flattenEntity);
}

function flattenEntity(entity: ExactSourceEntity): ExactSourceEntity[] {
	return [entity, ...entity.children.flatMap(flattenEntity)];
}
