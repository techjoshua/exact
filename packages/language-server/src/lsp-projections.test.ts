import type { ExactSourceInspection } from '@exactjs/compiler';
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
		expect(hints.map((hint) => hint.label)).toEqual(['◆', '⚡']);
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
