import type {
	ExactSourceEntity,
	ExactSourceInspection,
	ExactTaskClassification
} from '@exactjs/compiler';
import { describe, expect, it } from 'vitest';
import {
	projectCodeLenses,
	projectDocumentSymbols,
	projectHover,
	projectInlayHints,
	projectSemanticTokens,
	projectTaskRename,
	projectTaskStatusCompletions
} from './lsp-projections.js';

describe('language-server projections', () => {
	it('completes, explains, and renames synthetic task facade members', () => {
		const completionSource = 'function save() {}; save.';
		const completionInspection = fixture(completionSource);
		expect(
			projectTaskStatusCompletions(completionInspection, completionSource, {
				line: 0,
				character: completionSource.length
			}).map((item) => item.label)
		).toEqual(['pending', 'pendingCount', 'generation', 'result', 'error', 'cancel']);

		const hoverSource = 'function save() {}; save.pending';
		const hoverInspection = fixture(hoverSource);
		expect(
			projectHover(hoverInspection, hoverSource, {
				line: 0,
				character: hoverSource.length
			})?.contents
		).toMatchObject({ value: expect.stringContaining('foreground task work') });

		expect(
			projectTaskRename(
				hoverInspection,
				hoverSource,
				{ line: 0, character: 10 },
				'persist',
				'file:///Page.tsx'
			)?.changes?.['file:///Page.tsx']
		).toHaveLength(2);
	});

	it('projects one compiler task through standard LSP capabilities', () => {
		const source = 'function Page() { return () => <main />; }';
		const inspection = fixture(source);

		expect(projectDocumentSymbols(inspection, source)[0]?.name).toBe('Page');
		expect(projectCodeLenses(inspection, source).map((lens) => lens.command?.title)).toEqual([
			'eXact · 1 task'
		]);
		const hints = projectInlayHints(inspection, source);
		expect(hints.map((hint) => badgeValues(hint.label))).toEqual([['📋', '⚡', '🖥']]);
		expect(hints[0]?.tooltip).toMatchObject({
			kind: 'markdown',
			value: expect.stringContaining('Inferred task')
		});
		expect(projectHover(inspection, source, { line: 0, character: 10 })?.contents).toMatchObject({
			kind: 'markdown'
		});
		expect(projectSemanticTokens(inspection, source).data.length).toBeGreaterThan(0);
	});

	it('composes independently explained badges for explicit task policy', () => {
		const source =
			'function Page() { const load = (_task: TaskContext = TaskContext.client().deferred()) => {}; load(); }';
		const inspection = fixture(source);
		const initializer = inspection.components[0]?.children[0];
		const inferredTask = initializer?.children[0];
		if (!initializer || !inferredTask) throw new Error('Expected language-tools fixture entities.');
		const explicitTask: ExactSourceEntity = {
			...inferredTask,
			id: 'Page:explicit-task',
			kind: 'explicit-task',
			selectionRange: sourceRange(source, 'load'),
			classification: {
				...(inferredTask.classification as ExactTaskClassification),
				kind: 'task',
				origin: 'explicit',
				priority: 'deferred',
				publication: 'immediate'
			}
		};
		const compositeInspection: ExactSourceInspection = {
			...inspection,
			components: [
				{
					...inspection.components[0]!,
					children: [{ ...initializer, children: [explicitTask] }]
				}
			]
		};

		const hints = projectInlayHints(compositeInspection, source);
		expect(hints.map((hint) => badgeValues(hint.label))).toEqual([['📋', '🖥', '⏳', '🚨']]);
		expect(badgeParts(hints[0]?.label)[2]?.tooltip).toMatchObject({
			kind: 'markdown',
			value: expect.stringContaining('Deferred priority')
		});
		expect(
			semanticTokenFacts(source, projectSemanticTokens(compositeInspection, source).data)
		).toEqual([
			{ text: 'Page', type: 0 },
			{ text: 'load', type: 3 }
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

	it('places call badges after the opening parenthesis', () => {
		const source = [
			'function Page() {',
			'\tconst load = async (_task: TaskContext = TaskContext.client()) => {};',
			'\tload();',
			'\treturn () => <main />;',
			'}'
		].join('\r\n');
		const inspection = fixture(source);
		const pageOffset = source.indexOf('Page');
		const taskOffset = source.indexOf('load();');
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
									kind: 'explicit-task',
									range: {
										start: taskOffset,
										end: source.indexOf(';', taskOffset) + 1
									},
									selectionRange: { start: taskOffset, end: taskOffset + 4 },
									classification: {
										...(task.classification as ExactTaskClassification),
										kind: 'task',
										origin: 'explicit'
									}
								}
							]
						}
					]
				}
			]
		};

		const hints = projectInlayHints(rangedInspection, source);
		expect(hints.map((hint) => hint.position)).toEqual([{ line: 2, character: 6 }]);
	});

	it('places assignment badges before the assignment and explains the specific write', () => {
		const source = 'function Page() {\n\tthis.state.total = this.state.price * 2;\n}';
		const inspection = fixture(source);
		const assignmentStart = source.indexOf('this.state.total');
		const assignmentEnd = source.indexOf(';', assignmentStart) + 1;
		const initializer = inspection.components[0]!.children[0]!;
		const assignment: ExactSourceEntity = {
			id: 'Page:state-assignment:0',
			kind: 'state-assignment',
			name: 'state.total',
			range: { start: assignmentStart, end: assignmentEnd },
			selectionRange: { start: assignmentStart, end: assignmentStart + 'this.state.total'.length },
			children: [],
			classification: {
				kind: 'state-assignment',
				execution: 'deferred-reactive',
				dependencies: [
					{
						kind: 'state',
						path: 'state.price',
						range: sourceRange(source, 'this.state.price'),
						confidence: 'exact'
					}
				],
				effect: {
					kind: 'state-write',
					path: 'state.total',
					range: { start: assignmentStart, end: assignmentStart + 'this.state.total'.length },
					confidence: 'exact'
				}
			},
			reasons: []
		};
		const precise: ExactSourceInspection = {
			...inspection,
			components: [
				{
					...inspection.components[0]!,
					children: [{ ...initializer, children: [assignment] }]
				}
			]
		};

		const [hint] = projectInlayHints(precise, source);
		expect(hint?.position).toEqual({ line: 1, character: 1 });
		expect(badgeValues(hint!.label)).toEqual(['⚡']);
		expect(hint?.tooltip).toMatchObject({
			kind: 'markdown',
			value: expect.stringMatching(/state\.total[\s\S]+deferred reactive assignment/i)
		});
	});

	it('links a derived declaration to each symbol-resolved use', () => {
		const source = [
			'function Page() {',
			'\tconst doubled = this.state.count * 2;',
			'\treturn () => <output>{doubled}</output>;',
			'}'
		].join('\n');
		const inspection = fixture(source);
		const declaration = sourceRange(source, 'doubled');
		const use = sourceRange(source.slice(declaration.end), 'doubled');
		const absoluteUse = {
			start: declaration.end + use.start,
			end: declaration.end + use.end
		};
		const initializer = inspection.components[0]!.children[0]!;
		const derived: ExactSourceEntity = {
			id: 'Page:derived:0',
			kind: 'derived',
			name: 'doubled',
			range: declaration,
			selectionRange: declaration,
			children: [],
			classification: {
				kind: 'derived',
				dependencies: [],
				definition: sourceRange(source, 'this.state.count * 2'),
				references: [absoluteUse]
			},
			reasons: []
		};
		const precise: ExactSourceInspection = {
			...inspection,
			components: [
				{
					...inspection.components[0]!,
					children: [{ ...initializer, children: [derived] }]
				}
			]
		};

		const hints = projectInlayHints(precise, source);
		expect(hints.map((hint) => hint.position)).toEqual([
			{ line: 1, character: 37 },
			{ line: 2, character: 23 }
		]);
		expect(hints.map((hint) => badgeValues(hint.label))).toEqual([['🔗'], ['🔗']]);
	});

	it('does not claim hover ownership across a containing function or task body', () => {
		const source =
			'function Page() { const load = (_task: TaskContext = TaskContext.client()) => inner(value); load(); }';
		const inspection = fixture(source);
		const inner = source.indexOf('inner');

		expect(projectHover(inspection, source, { line: 0, character: inner })).toBeUndefined();
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
			concurrency: 'latest' as const,
			detached: false,
			dependencies: [
				{
					kind: 'prop' as const,
					path: 'props.id',
					range: name,
					confidence: 'exact' as const
				}
			],
			capturedInputs: [],
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
		compiler: { typescriptVersion: '7.0.0', backendVersion: '1.26.0' },
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
