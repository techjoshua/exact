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
		expect(projectInlayHints(inspection, source)[0]?.label).toContain('setup once');
		expect(projectHover(inspection, source, { line: 0, character: 10 })?.contents).toMatchObject({
			kind: 'markdown'
		});
		expect(projectSemanticTokens(inspection, source).data.length).toBeGreaterThan(0);
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
