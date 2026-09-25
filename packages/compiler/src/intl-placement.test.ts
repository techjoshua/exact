import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { compileProject } from './index.js';
import { analyzeSource } from './compilation/source-analysis.js';

describe('native Intl instance placement', () => {
	it.each([
		['NumberFormat', 'format(1234)'],
		['DateTimeFormat', 'format(0)'],
		['PluralRules', 'select(2)'],
		['RelativeTimeFormat', 'format(2, "day")'],
		['ListFormat', 'format(["one", "two"])'],
		['Collator', 'compare("a", "b")'],
		['Segmenter', 'segment("words")'],
		['DisplayNames', 'of("US")'],
		['Locale', 'toString()'],
		['NumberFormat', '["format"](1234)'],
		['NumberFormat', '[String("format") as "format"](1234)']
	])('keeps module-owned %s calls isomorphic', (constructor, operation) => {
		const analysis = analyzeSource(
			`const formatter = new Intl.${constructor}("en-US"${constructor === 'DisplayNames' ? ", {type: 'region'}" : ''});
			export function format() { return formatter${operation.startsWith('[') ? '' : '.'}${operation}; }`,
			{ filename: 'IntlView.tsx' }
		);
		expect(analysis.callables.find((value) => value.name === 'format')?.effect).toBe('neutral');
	});

	it.each([
		'interface NumberFormat { format(value: number): string } declare const formatter: NumberFormat;',
		'export {}; declare namespace Intl { interface NumberFormat { format(value: number): string } } declare const formatter: Intl.NumberFormat;'
	])('does not trust a custom formatter declaration: %s', (declaration) => {
		const analysis = analyzeSource(
			`${declaration}
			export function format() { return formatter.format(1); }`,
			{ filename: 'CustomFormatter.tsx' }
		);
		expect(analysis.callables.find((value) => value.name === 'format')?.effect).toBe('unknown');
	});

	it('publishes both targets when a component imports a module-owned formatter helper', async () => {
		const root = await mkdtemp(path.join(tmpdir(), 'exact-intl-placement-'));
		try {
			await writeFile(
				path.join(root, 'copy.ts'),
				`const formatter = new Intl.NumberFormat("en-US");
				export function count(value: number) { return formatter.format(value); }`
			);
			const entry = path.join(root, 'View.tsx');
			await writeFile(
				entry,
				`import { count } from './copy.js';
				export function View() { return () => <output>{count(1234)}</output>; }`
			);
			for (const target of ['client', 'server'] as const) {
				const results = await compileProject([entry, path.join(root, 'copy.ts')], {
					root,
					rootDir: root,
					outDir: path.join(root, target),
					target,
					includeAllModules: true
				});
				expect(results.flatMap((result) => result.componentBuild?.components ?? [])).toEqual([
					expect.objectContaining({
						placement: 'isomorphic',
						artifactTargets: ['client', 'server']
					})
				]);
			}
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
