import type {
	ExactLanguageAnalyzerContext,
	ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createExactLanguageAnalyzer } from './language.js';

describe('intl language contribution', () => {
	it('reports native inference and per-message catalog locale coverage', async () => {
		const root = fileURLToPath(new URL('../../../apps/intl-testbed/', import.meta.url));
		const filename = path.join(root, 'src', 'showcase.tsx');
		const source = await readFile(filename, 'utf8');
		const analyzer = await createExactLanguageAnalyzer(
			analyzerContext(root, {
				catalogFiles: [
					'locales/en-US.xlf',
					'locales/ar-EG.xlf',
					'locales/fr-FR.xlf',
					'locales/ja-JP.xlf'
				],
				catalogHygiene: true
			})
		);
		try {
			const projection = sourceProjection(root, filename, source);
			const hover = await analyzer.hover?.(
				{ projection, position: source.indexOf('panel-title') },
				new AbortController().signal
			);
			expect(hover?.markdown).toContain('plain message interpolation');
			expect(hover?.markdown).toContain('ar-EG, fr-FR, ja-JP');
			expect(
				await analyzer.diagnostics({ projection, scope: 'document' }, new AbortController().signal)
			).toEqual([]);
		} finally {
			await analyzer.dispose?.();
		}
	});

	it('completes semantic formatter vocabularies from the active attribute', async () => {
		const root = fileURLToPath(new URL('../../../apps/intl-testbed/', import.meta.url));
		const source = 'const View = () => () => <output intl:unit="distance" />;';
		const filename = path.join(root, 'src', 'completion.tsx');
		const analyzer = await createExactLanguageAnalyzer(analyzerContext(root));
		try {
			const position = source.indexOf('distance') + 'distance'.length;
			const completions = await analyzer.complete?.(
				{ projection: sourceProjection(root, filename, source), position },
				new AbortController().signal
			);
			expect(completions?.map((completion) => completion.label)).toContain('distance-road');
		} finally {
			await analyzer.dispose?.();
		}
	});

	it('shows inference notes by default and permits an explicit provider opt-out', async () => {
		const root = fileURLToPath(new URL('../../../apps/intl-testbed/', import.meta.url));
		const source =
			'export function Inbox(props: { count: number }) { return () => <p intl:message>You have {props.count} {props.count === 1 ? "message" : "messages"}.</p>; }';
		const filename = path.join(root, 'src', 'inlay-default.tsx');
		const projection = sourceProjection(root, filename, source);
		const enabled = await createExactLanguageAnalyzer(analyzerContext(root));
		const disabled = await createExactLanguageAnalyzer(
			analyzerContext(root, { showInlayHints: false })
		);
		try {
			const range = { start: 0, end: source.length };
			const hints = await enabled.inlayHints?.({ projection, range }, new AbortController().signal);
			expect(hints?.[0]?.label).toContain('plural cardinal');
			expect(
				await disabled.inlayHints?.({ projection, range }, new AbortController().signal)
			).toEqual([]);
		} finally {
			await enabled.dispose?.();
			await disabled.dispose?.();
		}
	});

	it('locates the authored text and native Intl expressions that prove inference', async () => {
		const root = fileURLToPath(new URL('../../../apps/intl-testbed/', import.meta.url));
		const source = `
			export function Measurements() {
				return () => <section>
					<output intl:unit="mass-person">{180} pounds</output>
					<output intl:unit="volume-liquid">{12} gallons</output>
					<output intl:unit="speed-road">{65} mph</output>
					<p intl:message>{new Intl.NumberFormat('en-US', { style: 'unit', unit: 'mile-per-hour' }).format(65)}</p>
				</section>;
			}
		`;
		const filename = path.join(root, 'src', 'inference-evidence.tsx');
		const analyzer = await createExactLanguageAnalyzer(analyzerContext(root));
		try {
			const hints = await analyzer.inlayHints?.(
				{
					projection: sourceProjection(root, filename, source),
					range: { start: 0, end: source.length }
				},
				new AbortController().signal
			);
			const evidence = (hints ?? []).flatMap((hint) => hint.evidence ?? []);
			expect(evidence.map((item) => source.slice(item.range.start, item.range.end))).toEqual(
				expect.arrayContaining([
					'pounds',
					'gallons',
					'mph',
					"new Intl.NumberFormat('en-US', { style: 'unit', unit: 'mile-per-hour' }).format(65)"
				])
			);
			expect(evidence.map((item) => item.kind)).toEqual(
				expect.arrayContaining(['unit', 'unit', 'unit'])
			);
		} finally {
			await analyzer.dispose?.();
		}
	});

	it('warns when authored fallback formatting contradicts the source locale', async () => {
		const root = fileURLToPath(new URL('../../../apps/intl-testbed/', import.meta.url));
		const source = `const View = (count: number) => () => <p intl:message="counter">Total {new Intl.NumberFormat('en-US').format(count)}</p>;`;
		const filename = path.join(root, 'src', 'locale-warning.tsx');
		const analyzer = await createExactLanguageAnalyzer(
			analyzerContext(root, { sourceLocale: 'fr-FR', localeConsistency: true })
		);
		try {
			const diagnostics = await analyzer.diagnostics(
				{ projection: sourceProjection(root, filename, source), scope: 'document' },
				new AbortController().signal
			);
			expect(diagnostics).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ code: 'locale-contradicts-source', severity: 'warning' })
				])
			);
		} finally {
			await analyzer.dispose?.();
		}
	});

	it('reports display-name properties as formatter-only instead of untranslated', async () => {
		const root = fileURLToPath(new URL('../../../apps/intl-testbed/', import.meta.url));
		const source = `export function Language(languageCode: string) { return () => <button aria-label={languageCode} intl:aria-label="display-name:languageCode" />; }`;
		const filename = path.join(root, 'src', 'display-name.tsx');
		const analyzer = await createExactLanguageAnalyzer(
			analyzerContext(root, { requiredLocales: ['fr-FR'] })
		);
		try {
			const projection = sourceProjection(root, filename, source);
			const hints = await analyzer.inlayHints?.(
				{ projection, range: { start: 0, end: source.length } },
				new AbortController().signal
			);
			expect(hints?.[0]).toMatchObject({
				label: expect.stringContaining('formatter-only'),
				tooltip: expect.stringContaining('requires no catalog translation')
			});
			expect(hints?.[0]?.label).not.toContain('0 locales');
			const hover = await analyzer.hover?.(
				{ projection, position: source.indexOf('display-name') },
				new AbortController().signal
			);
			expect(hover?.markdown).toContain('Formatter descriptor key');
			expect(hover?.markdown).toContain('not applicable (formatter-only)');
			expect(hover?.markdown).not.toContain('Missing required locales');
		} finally {
			await analyzer.dispose?.();
		}
	});

	it('warns for untranslated text and intrinsic properties unless translate=no is inherited', async () => {
		const root = fileURLToPath(new URL('../../../apps/intl-testbed/', import.meta.url));
		const source = `export function Page(description: string) { return () => <section title="Dashboard" aria-description={description}><p lang="en-US" dir="ltr">Translate me</p><div translate="no"><span title="Product name">Brand name</span><em translate="yes" title="Override">Translate again</em></div><img alt="Portrait" intl:alt /></section>; }`;
		const filename = path.join(root, 'src', 'missing-intl.tsx');
		const analyzer = await createExactLanguageAnalyzer(analyzerContext(root));
		try {
			const diagnostics = await analyzer.diagnostics(
				{ projection: sourceProjection(root, filename, source), scope: 'document' },
				new AbortController().signal
			);
			expect(
				diagnostics
					.filter((diagnostic) => diagnostic.code === 'missing-intl')
					.map((diagnostic) => source.slice(diagnostic.range.start, diagnostic.range.end))
			).toEqual(['description', 'Dashboard', 'Translate me', 'Override', 'Translate again']);
		} finally {
			await analyzer.dispose?.();
		}
	});
});

function analyzerContext(
	root: string,
	configuration?: ExactLanguageAnalyzerContext['configuration']
): ExactLanguageAnalyzerContext {
	return {
		protocol: '1.0.0' as const,
		provider: { name: '@exactjs/intl', version: '0.1.0' },
		packageRoot: path.dirname(fileURLToPath(import.meta.url)),
		workspace: { root },
		capabilities: ['diagnostics', 'completions', 'hover', 'inlayHints'] as const,
		...(configuration ? { configuration } : {}),
		dataFiles: []
	};
}

function sourceProjection(root: string, filename: string, text: string): ExactLanguageProjectionV1 {
	return {
		protocol: 1,
		generation: 1,
		project: { root, kind: 'configured' },
		document: {
			uri: pathToFileURL(filename).href,
			path: filename,
			version: 1,
			textHash: 'fixture',
			text
		},
		imports: [],
		components: [],
		enhancements: [],
		jsx: [],
		expressions: [],
		types: []
	};
}
