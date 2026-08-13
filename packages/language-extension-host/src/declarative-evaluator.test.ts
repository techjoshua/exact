import type {
	ExactDeclarativeLanguageContributionV1,
	ExactLanguageProjectionV1
} from '@exactjs/language-extension-api';
import { describe, expect, it } from 'vitest';
import {
	evaluateDeclarativeCompletions,
	evaluateDeclarativeDiagnostics,
	evaluateDeclarativeHover
} from './declarative-evaluator.js';

const contribution: ExactDeclarativeLanguageContributionV1 = {
	schemaVersion: 1,
	provider: '@fixture/a11y',
	capabilities: {
		namespaces: [
			{
				name: 'a11y',
				description: 'Accessible relationships',
				attributes: [
					{
						name: 'labelled-by',
						description: 'References the authored label target.',
						valueKind: 'id-token-list',
						targets: ['input'],
						requires: ['label-target']
					},
					{ name: 'label-target', description: 'Marks the label target.' }
				]
			}
		]
	}
};

describe('declarative language evaluator', () => {
	it('evaluates fixed target, relationship, and value predicates', () => {
		const diagnostics = evaluateDeclarativeDiagnostics(contribution, projection());
		expect(diagnostics.map((value) => value.code)).toEqual([
			'invalid-target',
			'requires-label-target',
			'invalid-id-token-list'
		]);
	});

	it('provides finite metadata-backed hover and completions', () => {
		expect(evaluateDeclarativeHover(contribution, projection(), 7)?.markdown).toContain(
			'References the authored label target.'
		);
		const completionProjection = projection('<input a11y:lab');
		expect(
			evaluateDeclarativeCompletions(
				contribution,
				completionProjection,
				completionProjection.document.text!.length
			).map((value) => value.label)
		).toContain('labelled-by');
	});
});

function projection(text = '<div a11y:labelled-by="bad id!" />'): ExactLanguageProjectionV1 {
	return {
		protocol: 1,
		generation: 1,
		project: { root: '/fixture', kind: 'configured' },
		document: { uri: 'file:///fixture.tsx', path: '/fixture.tsx', version: 1, textHash: 'x', text },
		imports: [],
		components: [],
		enhancements: [],
		jsx: text.includes('labelled-by')
			? [
					{
						id: 'jsx:1',
						range: { start: 0, end: text.length },
						openingRange: { start: 0, end: text.length },
						tagRange: { start: 1, end: 4 },
						kind: 'intrinsic',
						tag: 'div',
						attributes: [
							{
								name: 'a11y:labelled-by',
								namespace: 'a11y',
								localName: 'labelled-by',
								range: { start: 5, end: text.length - 3 },
								nameRange: { start: 5, end: 21 },
								valueRange: { start: 22, end: text.length - 3 },
								valueKind: 'string',
								constant: 'bad id!'
							}
						]
					}
				]
			: [],
		expressions: [],
		types: []
	};
}
