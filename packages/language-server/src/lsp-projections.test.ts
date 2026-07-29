import type { ExactSourceEntity, ExactSourceInspection } from '@exactjs/compiler';
import { describe, expect, it } from 'vitest';
import {
	projectCodeLenses,
	projectDocumentSymbols,
	projectHover,
	projectInlayHints,
	projectSemanticTokens
} from './lsp-projections.js';

describe('language-server projections', () => {
	it('projects one compiler task through standard LSP capabilities', () => {
		const source = 'function Page() { return () => <main />; }';
		const inspection = fixture(source);

		expect(projectDocumentSymbols(inspection, source)[0]?.name).toBe('Page');
		expect(projectCodeLenses(inspection, source).map((lens) => lens.command?.title)).toEqual(
			expect.arrayContaining([
				expect.stringContaining('eXact component'),
				expect.stringContaining('Inferred blocking server task')
			])
		);
		const hints = projectInlayHints(inspection, source);
		expect(hints.map((hint) => badgeValues(hint.label))).toEqual([
			['⚙', '⇄'],
			['📋', '⚡', '🖥']
		]);
		expect(hints.every((hint) => hint.position.character === source.length)).toBe(true);
		expect(hints[0]?.tooltip).toMatchObject({
			kind: 'markdown',
			value: expect.stringContaining('Initialization')
		});
		expect(hints[1]?.tooltip).toMatchObject({
			kind: 'markdown',
			value: expect.stringContaining('Inferred task')
		});
		expect(projectHover(inspection, source, { line: 0, character: 10 })?.contents).toMatchObject({
			kind: 'markdown'
		});
		expect(projectSemanticTokens(inspection, source).data.length).toBeGreaterThan(0);
	});

	it('composes independently explained badges for explicit tasks and actions', () => {
		const source = 'function Page() { this.task(); this.action(); }';
		const inspection = fixture(source);
		const initializer = inspection.components[0]?.children[0];
		const inferredTask = initializer?.children[0];
		if (!initializer || !inferredTask) throw new Error('Expected language-tools fixture entities.');
		const explicitTask: ExactSourceEntity = {
			...inferredTask,
			id: 'Page:explicit-task',
			kind: 'explicit-task',
			selectionRange: sourceRange(source, 'task'),
			classification: {
				...inferredTask.classification!,
				kind: 'task',
				origin: 'explicit',
				priority: 'deferred',
				publication: 'immediate'
			}
		};
		const action: ExactSourceEntity = {
			id: 'Page:action',
			kind: 'action',
			name: 'Save',
			range: { start: 0, end: source.length },
			selectionRange: sourceRange(source, 'action'),
			children: [],
			classification: {
				kind: 'action',
				placement: 'server',
				concurrency: 'latest'
			},
			reasons: []
		};
		const compositeInspection: ExactSourceInspection = {
			...inspection,
			components: [
				{
					...inspection.components[0]!,
					children: [{ ...initializer, children: [explicitTask, action] }]
				}
			]
		};

		const hints = projectInlayHints(compositeInspection, source);
		expect(hints.map((hint) => badgeValues(hint.label))).toEqual([
			['⚙', '⇄'],
			['📋', '🖥', '⏳', '🚨'],
			['▶', '🖥']
		]);
		expect(badgeParts(hints[1]?.label)[2]?.tooltip).toMatchObject({
			kind: 'markdown',
			value: expect.stringContaining('Deferred priority')
		});
		expect(badgeParts(hints[2]?.label)[0]?.tooltip).toMatchObject({
			kind: 'markdown',
			value: expect.stringContaining('Action')
		});
		expect(hints[2]?.tooltip).toMatchObject({
			kind: 'markdown',
			value: expect.stringContaining('latest')
		});
		expect(
			semanticTokenFacts(source, projectSemanticTokens(compositeInspection, source).data)
		).toEqual([
			{ text: 'Page', type: 0 },
			{ text: 'task', type: 3 },
			{ text: 'action', type: 3 }
		]);
	});

	it('explains the referenced component instead of its containing component', () => {
		const source = 'function Page() { return () => <CalculatorWorkspace />; }';
		const inspection = fixture(source);
		const component = inspection.components[0]!;
		const tagRange = sourceRange(source, 'CalculatorWorkspace');
		const elementRange = {
			start: tagRange.start - 1,
			end: source.indexOf('/>', tagRange.end) + 2
		};
		const renderExpression: ExactSourceEntity = {
			id: 'Page:render:0',
			kind: 'render-expression',
			name: 'CalculatorWorkspace',
			range: elementRange,
			selectionRange: tagRange,
			children: [],
			classification: {
				kind: 'render',
				execution: 'reactive',
				dependencies: [],
				effects: [],
				referencedComponent: {
					id: 'CalculatorWorkspace',
					placement: 'client',
					boundary: 'client'
				}
			},
			reasons: []
		};
		const preciseInspection: ExactSourceInspection = {
			...inspection,
			components: [{ ...component, children: [...component.children, renderExpression] }]
		};

		const hover = projectHover(preciseInspection, source, {
			line: 0,
			character: tagRange.start + 2
		});
		expect(hover?.contents).toMatchObject({
			kind: 'markdown',
			value: expect.stringMatching(/CalculatorWorkspace[\s\S]+client component/)
		});
		expect(hover?.contents).not.toMatchObject({
			value: expect.stringContaining('Page')
		});
		expect(hover?.range).toEqual({
			start: { line: 0, character: tagRange.start },
			end: { line: 0, character: tagRange.end }
		});
		expect(
			semanticTokenFacts(source, projectSemanticTokens(preciseInspection, source).data)
		).toEqual([{ text: 'Page', type: 0 }]);
	});

	it('places badges after authored source instead of inside selected tokens', () => {
		const source = [
			'function Page() {',
			'\tthis.task(async () => {});',
			'\treturn () => <main />;',
			'}'
		].join('\r\n');
		const inspection = fixture(source);
		const pageOffset = source.indexOf('Page');
		const taskOffset = source.indexOf('task');
		const initializer = inspection.components[0]?.children[0];
		const task = initializer?.children[0];
		if (!initializer || !task) throw new Error('Expected language-tools fixture entities.');
		const rangedInspection: ExactSourceInspection = {
			...inspection,
			components: [
				{
					...inspection.components[0]!,
					selectionRange: { start: pageOffset, end: pageOffset + 4 },
					children: [
						{
							...initializer,
							selectionRange: { start: pageOffset, end: pageOffset + 4 },
							children: [
								{
									...task,
									selectionRange: { start: taskOffset, end: taskOffset + 4 }
								}
							]
						}
					]
				}
			]
		};

		const hints = projectInlayHints(rangedInspection, source);
		expect(hints.map((hint) => hint.position)).toEqual([
			{ line: 0, character: 'function Page() {'.length },
			{ line: 1, character: '\tthis.task(async () => {});'.length }
		]);
	});
});

function fixture(source: string): ExactSourceInspection {
	const full = { start: 0, end: source.length };
	const name = { start: 9, end: 13 };
	const task = {
		id: 'Page:task',
		kind: 'inferred-task' as const,
		name: 'Load page',
		range: full,
		selectionRange: name,
		children: [],
		classification: {
			kind: 'task' as const,
			origin: 'inferred' as const,
			placement: 'server' as const,
			priority: 'normal' as const,
			readiness: 'blocking' as const,
			dependencies: [
				{
					kind: 'prop' as const,
					path: 'props.id',
					range: name,
					confidence: 'exact' as const
				}
			],
			effects: [
				{
					kind: 'state-write' as const,
					path: 'state.page',
					range: name,
					confidence: 'exact' as const
				}
			],
			publication: 'staged' as const,
			cancellation: 'generation-abort-signal' as const,
			signalCalls: [],
			resources: [],
			cleanup: 'none' as const
		},
		reasons: [
			{
				code: 'server-module' as const,
				summary: 'loadPage is server-resident.',
				range: name
			}
		]
	};
	return {
		generation: 1,
		filename: 'Page.tsx',
		compiler: { typescriptVersion: '7.0.0', backendVersion: '1.24.0' },
		diagnostics: [],
		components: [
			{
				id: 'Page',
				kind: 'component',
				name: 'Page',
				range: full,
				selectionRange: name,
				children: [
					{
						id: 'Page:init',
						kind: 'initializer',
						name: 'Initialization',
						range: full,
						selectionRange: name,
						children: [task],
						classification: {
							kind: 'initializer',
							execution: 'once-per-instance',
							placement: 'isomorphic'
						},
						reasons: []
					}
				],
				reasons: []
			}
		]
	};
}

function badgeValues(label: string | { value: string }[]): string[] {
	return badgeParts(label).map((part) => part.value.trim());
}

function badgeParts(
	label: string | { value: string; tooltip?: unknown }[] | undefined
): { value: string; tooltip?: unknown }[] {
	if (!label) return [];
	return typeof label === 'string' ? [{ value: label }] : label;
}

function sourceRange(source: string, token: string): { start: number; end: number } {
	const start = source.indexOf(token);
	return { start, end: start + token.length };
}

function semanticTokenFacts(
	source: string,
	data: readonly number[]
): { text: string; type: number }[] {
	const lines = source.split(/\r?\n/);
	const result: { text: string; type: number }[] = [];
	let line = 0;
	let character = 0;
	for (let index = 0; index < data.length; index += 5) {
		const lineDelta = data[index]!;
		line += lineDelta;
		character = lineDelta ? data[index + 1]! : character + data[index + 1]!;
		const length = data[index + 2]!;
		result.push({
			text: lines[line]!.slice(character, character + length),
			type: data[index + 3]!
		});
	}
	return result;
}
