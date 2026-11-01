import { afterAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { NativeCompilerProcess } from '@exactjs/compiler';
import { createExactLanguageProjection } from '../../compiler/src/language-tools/language-projection.js';
import { createExactLanguageAnalyzer } from './language.js';

const native = new NativeCompilerProcess({ executable: process.env.EXACT_COMPILER_EXECUTABLE! });
afterAll(() => native.dispose());
const id = path.resolve('packages/accessibility/src/test-support/projected-example.tsx');
const start = `import * as a11y from '@exactjs/accessibility/enhancements' with {type:'exact-enhancement'};
import {createRef,type Component} from '@exactjs/core';
const entryKey=createRef<HTMLInputElement>('entry');
export function Example(this:Component<{}>){const entry=this.ref(entryKey);return ()=><section `;
const end = `><input ref={entry} aria-label="Entry" /></section>;}`;
const analyzer = await createExactLanguageAnalyzer({
	protocol: '1.0.0',
	provider: { name: '@exactjs/accessibility', version: '0.7.1' },
	packageRoot: path.resolve('packages/accessibility'),
	workspace: { root: process.cwd() },
	capabilities: ['diagnostics', 'completions', 'hover'],
	dataFiles: []
});
function projected(source: string, target: 'client' | 'server') {
	const response = native.request({
		kind: 'compile',
		id,
		source,
		root: process.cwd(),
		configFile: path.resolve('packages/accessibility/tsconfig.json'),
		target,
		diagnostics: 'semantic'
	});
	expect(response.error).toBeUndefined();
	expect(response.diagnostics).toEqual([]);
	expect(response.analysis.components[0]?.placement).toBe('isomorphic');
	return createExactLanguageProjection(id, source, 1, response);
}

describe('native accessibility spelling and provider agreement', () => {
	it('checks focus companions from actual accepted native activations on both targets', async () => {
		const actual: boolean[] = [];
		for (const target of ['client', 'server'] as const) {
			for (const [attributes, invalid] of [
				['a11y:initial-focus={entry}', true],
				['a11y:focus-scope a11y:initial-focus={entry}', false]
			] as const) {
				const projection = projected(start + attributes + end, target);
				expect(projection.enhancements.map((a) => a.activator)).toContain('initial-focus');
				const diagnostics = await analyzer.diagnostics(
					{ scope: 'document', projection },
					new AbortController().signal
				);
				actual.push(diagnostics.some((d) => d.code === 'focus-companion') === invalid);
			}
		}
		expect(actual).toEqual([true, true, true, true]);
	});
	it('inserts a canonical completion that the native compiler accepts', async () => {
		for (const prefix of ['initial', 'initial-']) {
			const source = start + 'a11y:' + prefix + end;
			const projection = projected(start + 'a11y:focus-scope' + end, 'client');
			const position = source.indexOf('a11y:' + prefix) + ('a11y:' + prefix).length;
			const request = { ...projection, document: { ...projection.document, text: source } };
			const completions = await analyzer.complete!(
				{ projection: request, position },
				new AbortController().signal
			);
			const completion = completions.find((c) => c.label === 'initial-focus');
			expect(completion).toBeDefined();
			const inserted =
				source.slice(0, completion!.replace!.start) +
				completion!.label +
				'={entry}' +
				source.slice(completion!.replace!.end);
			for (const target of ['client', 'server'] as const) projected(inserted, target);
		}
	});
	it('describes the actual ARIA attribute from accepted relationship source', async () => {
		const source = start + 'a11y:described-by={entry}' + end;
		const projection = projected(source, 'client');
		const hover = await analyzer.hover!(
			{ projection, position: source.indexOf('a11y:described-by') + 6 },
			new AbortController().signal
		);
		expect(hover?.markdown).toContain('aria-describedby');
		expect(hover?.markdown).not.toContain('aria-described-by');
	});
});

function idProjection(children: string, target: 'client' | 'server') {
	return projected(
		`export function Example(props:{bag:{id?:string}}){
			const bag:{id?:string}={id:'other'};
			return ()=><section>${children}</section>;
		}`,
		target
	);
}

async function idDiagnostics(children: string, target: 'client' | 'server') {
	const projection = idProjection(children, target);
	const diagnostics = await analyzer.diagnostics(
		{ scope: 'document', projection },
		new AbortController().signal
	);
	return { projection, diagnostics };
}

describe('native effective ID evidence', () => {
	it.each(['client', 'server'] as const)(
		'keeps only definite ordered IDs in %s diagnostics',
		async (target) => {
			for (const [second, duplicate] of [
				['<div id="fixed-id" />', true],
				['<div id="fixed-id" {...props.bag} />', false],
				['<div id="fixed-id" {...bag} />', false],
				['<div {...props.bag} id="fixed-id" />', true],
				['<div {...props.bag} id={props.bag.id} />', false]
			] as const) {
				const { projection, diagnostics } = await idDiagnostics(
					'<div id="fixed-id" />' + second,
					target
				);
				const duplicates = diagnostics.filter((diagnostic) => diagnostic.code === 'duplicate-id');
				expect(duplicates).toHaveLength(duplicate ? 1 : 0);
				if (duplicate) {
					expect(duplicates[0]?.severity).toBe('error');
					const source = projection.document.text!;
					const range = duplicates[0]!.range;
					expect(source.slice(range.start, range.end).trim()).toBe('id="fixed-id"');
					expect(duplicates[0]?.related?.[0]?.range.start).toBeLessThan(range.start);
				}
			}
		}
	);

	it.each(['client', 'server'] as const)(
		'keeps unknown targets as finite-region warnings in %s diagnostics',
		async (target) => {
			const { diagnostics } = await idDiagnostics(
				`<label htmlFor="entry">Entry</label><input id="entry" {...props.bag} />
				<button command="show-modal" commandFor="panel">Open</button>
				<div id="panel" {...props.bag} />
				<div aria-controls="entry" />`,
				target
			);
			for (const code of [
				'unresolved-label-target',
				'unresolved-command-target',
				'unresolved-id-reference',
				'no-provable-accessible-name'
			])
				expect(diagnostics).toEqual(
					expect.arrayContaining([expect.objectContaining({ code, severity: 'warning' })])
				);
			expect(diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(false);
		}
	);

	it.each(['client', 'server'] as const)(
		'preserves definite label and command checks in %s diagnostics',
		async (target) => {
			const valid = await idDiagnostics(
				`<label htmlFor="entry">Entry</label><input {...props.bag} id="entry" />
				<button command="show-modal" commandFor="panel">Open</button>
				<dialog {...props.bag} id="panel" aria-label="Panel" />
				<div aria-controls="entry" />`,
				target
			);
			expect(valid.diagnostics).toEqual([]);
			const invalid = await idDiagnostics(
				`<label htmlFor="entry">Entry</label><div {...props.bag} id="entry" />
				<button command="show-modal" commandFor="panel">Open</button>
				<div {...props.bag} id="panel" />`,
				target
			);
			for (const code of ['invalid-label-target', 'command-target-mismatch'])
				expect(invalid.diagnostics).toEqual(
					expect.arrayContaining([expect.objectContaining({ code, severity: 'error' })])
				);
		}
	);

	it.each(['client', 'server'] as const)(
		'does not construct a finite relationship cycle from an overwritten ID in %s',
		async (target) => {
			const { diagnostics } = await idDiagnostics(
				'<div id="a" {...props.bag} aria-flowto="b" /><div id="b" aria-flowto="a" />',
				target
			);
			expect(diagnostics.some((diagnostic) => diagnostic.code === 'aria-relationship-cycle')).toBe(
				false
			);
			expect(diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: 'unresolved-id-reference', severity: 'warning' })
				])
			);
		}
	);
});
