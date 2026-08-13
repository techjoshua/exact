import type {
	ExactLanguageAnalyzerContext,
	ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';
import { describe, expect, it } from 'vitest';
import { createExactLanguageAnalyzer } from './language.js';

describe('@exactjs/accessibility language analyzer', () => {
	it('reports finite ARIA, naming, focus-order, ID, and navigation failures', async () => {
		const analyzer = await createExactLanguageAnalyzer(context());
		const diagnostics = await analyzer.diagnostics(
			{
				scope: 'document',
				projection: projection({
					text: '<button id="duplicate" tabIndex={3}></button><div id="duplicate" role="tree" a11y:navigate aria-madeup="x" />',
					jsx: [
						element('button', 0, 48, [
							attribute('id', 'duplicate', 8, 22),
							attribute('tabIndex', 3, 23, 35, 32, 35)
						]),
						element('div', 48, 111, [
							attribute('id', 'duplicate', 53, 67),
							attribute('role', 'tree', 68, 79),
							attribute('aria-madeup', 'x', 95, 111)
						])
					],
					enhancements: [
						{
							id: 'a1',
							namespace: 'a11y',
							activator: 'navigate',
							range: { start: 80, end: 94 },
							nameRange: { start: 80, end: 94 },
							package: { name: '@exactjs/accessibility' },
							targetJsxId: 'jsx-48',
							application: 'direct'
						}
					]
				})
			},
			new AbortController().signal
		);

		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
			expect.arrayContaining([
				'no-provable-accessible-name',
				'positive-tabindex',
				'duplicate-id',
				'unknown-aria-property',
				'unsupported-navigation-role'
			])
		);
	});

	it('provides role completions, enhancement hover, inlays, and a bounded tab-index edit', async () => {
		const analyzer = await createExactLanguageAnalyzer(context());
		const value = '<div role="tab" tabIndex={4} a11y:navigate />';
		const document = projection({
			text: value,
			jsx: [
				element('div', 0, value.length, [
					attribute('role', 'tab', 5, 15, 11, 14),
					attribute('tabIndex', 4, 16, 28, 25, 28)
				])
			],
			enhancements: [
				{
					id: 'a1',
					namespace: 'a11y',
					activator: 'navigate',
					range: { start: 29, end: 43 },
					nameRange: { start: 29, end: 43 },
					package: { name: '@exactjs/accessibility' },
					targetJsxId: 'jsx-0',
					application: 'direct'
				}
			]
		});
		const signal = new AbortController().signal;

		const completions = await analyzer.complete!({ projection: document, position: 14 }, signal);
		expect(completions.map((completion) => completion.label)).toContain('tab');
		const hover = await analyzer.hover!({ projection: document, position: 35 }, signal);
		expect(hover?.markdown).toContain('a11y:navigate');
		const hints = await analyzer.inlayHints!(
			{ projection: document, range: { start: 0, end: value.length } },
			signal
		);
		expect(hints[0]?.label).toContain('tab keyboard policy');
		const actions = await analyzer.codeActions!(
			{
				projection: document,
				range: { start: 16, end: 28 },
				diagnostics: ['@exactjs/accessibility/positive-tabindex']
			},
			signal
		);
		expect(actions[0]?.edits[0]?.newText).toBe('{0}');
	});

	it('coordinates native labels and reports finite relationship and interaction failures', async () => {
		const analyzer = await createExactLanguageAnalyzer(context());
		const text =
			'<label htmlFor="email">Email</label><input id="email" /><div id="a" aria-owns="b" /><div id="b" aria-owns="a" /><div onClick={run} role="button" />';
		const diagnostics = await analyzer.diagnostics(
			{
				scope: 'document',
				projection: projection({
					text,
					jsx: [
						element('label', 0, 41, [attribute('htmlFor', 'email', 7, 22)]),
						element('input', 41, 61, [attribute('id', 'email', 48, 58)]),
						element('div', 61, 89, [
							attribute('id', 'a', 66, 72),
							attribute('aria-owns', 'b', 73, 87)
						]),
						element('div', 89, 117, [
							attribute('id', 'b', 94, 100),
							attribute('aria-owns', 'a', 101, 115)
						]),
						element('div', 117, text.length, [
							attribute('onClick', true, 122, 135),
							attribute('role', 'button', 136, 149)
						])
					]
				})
			},
			new AbortController().signal
		);

		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
			expect.arrayContaining([
				'aria-relationship-cycle',
				'pointer-only-interaction',
				'nonfocusable-interaction',
				'prefer-native-control'
			])
		);
		expect(
			diagnostics.filter(
				(diagnostic) =>
					diagnostic.code === 'no-provable-accessible-name' && diagnostic.range.start === 42
			)
		).toHaveLength(0);
	});

	it('treats dynamic authored children as an unproven possible name rather than an error', async () => {
		const analyzer = await createExactLanguageAnalyzer(context());
		const text = '<button>{props.label}</button>';
		const diagnostics = await analyzer.diagnostics(
			{
				scope: 'document',
				projection: projection({
					text,
					jsx: [
						{
							...element('button', 0, text.length, []),
							openingRange: { start: 0, end: 8 }
						}
					]
				})
			},
			new AbortController().signal
		);
		expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
			'no-provable-accessible-name'
		);
	});
});

function projection(options: {
	text: string;
	jsx: ExactLanguageProjectionV1['jsx'];
	enhancements?: ExactLanguageProjectionV1['enhancements'];
}): ExactLanguageProjectionV1 {
	return {
		protocol: 1,
		generation: 1,
		project: { root: '/workspace', kind: 'configured' },
		document: {
			uri: 'file:///workspace/page.tsx',
			path: '/workspace/page.tsx',
			version: 1,
			textHash: 'test',
			text: options.text
		},
		imports: [],
		components: [],
		enhancements: options.enhancements ?? [],
		jsx: options.jsx,
		expressions: [],
		types: []
	};
}

function element(
	tag: string,
	start: number,
	end: number,
	attributes: ExactLanguageProjectionV1['jsx'][number]['attributes']
): ExactLanguageProjectionV1['jsx'][number] {
	return {
		id: `jsx-${start}`,
		range: { start, end },
		openingRange: { start, end },
		tagRange: { start: start + 1, end: start + 1 + tag.length },
		kind: 'intrinsic',
		tag,
		attributes
	};
}

function attribute(
	name: string,
	constant: string | number | boolean,
	start: number,
	end: number,
	valueStart = start,
	valueEnd = end
): ExactLanguageProjectionV1['jsx'][number]['attributes'][number] {
	return {
		name,
		localName: name,
		range: { start, end },
		nameRange: { start, end: start + name.length },
		valueRange: { start: valueStart, end: valueEnd },
		valueKind: typeof constant === 'string' ? 'string' : 'expression',
		constant
	};
}

function context(): ExactLanguageAnalyzerContext {
	return {
		protocol: '1.0.0',
		provider: { name: '@exactjs/accessibility', version: '0.1.0' },
		packageRoot: '/package',
		workspace: { root: '/workspace' },
		capabilities: ['diagnostics', 'completions', 'hover', 'inlayHints', 'codeActions'],
		dataFiles: []
	};
}
