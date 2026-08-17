import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';
import { describe, expect, it } from 'vitest';
import { createExactLanguageAnalyzer } from './language.js';

describe('@exactjs/time language analyzer', () => {
	it('diagnoses invalid policies and offers finite policy assistance', async () => {
		const source = '<time time:update="sometimes">{Date.now()}</time>';
		const projection = timeProjection(source, 'sometimes');
		const analyzer = await createExactLanguageAnalyzer({} as never);
		const signal = new AbortController().signal;

		const diagnostics = await analyzer.diagnostics({ projection, scope: 'document' }, signal);
		expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
			'invalid-time-update-policy'
		]);

		const partial = '<time time:update="mi';
		const completions = await analyzer.complete?.(
			{ projection: timeProjection(partial, 'mi'), position: partial.length },
			signal
		);
		expect(completions?.map((completion) => completion.label)).toEqual(['millisecond', 'minute']);

		const hover = await analyzer.hover?.({ projection, position: 12 }, signal);
		expect(hover?.markdown).toContain('Reactive clock view');
	});

	it('reports missing clocks and unbounded automatic formatting', async () => {
		const analyzer = await createExactLanguageAnalyzer({} as never);
		const signal = new AbortController().signal;
		const missing = '<time time:update="second">Static</time>';
		const opaque = '<time time:update="auto">{format(Date.now())}</time>';
		const missingDiagnostics = await analyzer.diagnostics(
			{ projection: timeProjection(missing, 'second'), scope: 'document' },
			signal
		);
		const opaqueDiagnostics = await analyzer.diagnostics(
			{ projection: timeProjection(opaque, 'auto'), scope: 'document' },
			signal
		);
		expect(missingDiagnostics.map(({ code }) => code)).toContain('time-update-without-clock');
		expect(opaqueDiagnostics.map(({ code }) => code)).toContain('time-auto-inference-unbounded');
	});

	it('reports Temporal precision unavailable from the millisecond clock', async () => {
		const analyzer = await createExactLanguageAnalyzer({} as never);
		const signal = new AbortController().signal;
		const source = `<time time:update>{Temporal.Now.instant().until(deadline).round({ smallestUnit: 'microsecond' })}</time>`;
		const diagnostics = await analyzer.diagnostics(
			{ projection: timeProjection(source, 'auto'), scope: 'document' },
			signal
		);
		expect(diagnostics.map(({ code }) => code)).toContain('time-clock-precision-unavailable');
	});
});

function timeProjection(text: string, constant: string): ExactLanguageProjectionV1 {
	return {
		protocol: 1,
		generation: 1,
		project: { root: '/', kind: 'configured' },
		document: { uri: 'file:///clock.tsx', path: '/clock.tsx', version: 1, textHash: 'x', text },
		imports: [],
		components: [],
		expressions: [],
		types: [],
		jsx: [
			{
				id: 'jsx-1',
				range: { start: 0, end: text.length },
				openingRange: { start: 0, end: text.length },
				tagRange: { start: 1, end: 5 },
				kind: 'intrinsic',
				tag: 'time',
				attributes: [
					{
						name: 'time:update',
						namespace: 'time',
						localName: 'update',
						range: { start: 6, end: Math.min(text.length, 29) },
						nameRange: { start: 6, end: 17 },
						valueRange: { start: 19, end: Math.min(text.length, 28) },
						valueKind: 'string',
						constant
					}
				]
			}
		],
		enhancements: [
			{
				id: 'time-1',
				namespace: 'time',
				activator: 'update',
				range: { start: 6, end: Math.min(text.length, 29) },
				nameRange: { start: 6, end: 17 },
				package: { name: '@exactjs/time' },
				targetJsxId: 'jsx-1',
				application: 'direct'
			}
		]
	};
}
