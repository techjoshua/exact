import type { ExactLanguageProjectionV1 } from '@exactjs/language-extension-api';
import { describe, expect, it } from 'vitest';
import { validateInteractiveResult } from './language-result-policy.js';

const projection: ExactLanguageProjectionV1 = {
	protocol: 1,
	generation: 1,
	project: { root: '/workspace', kind: 'configured' },
	document: {
		uri: 'file:///workspace/view.tsx',
		path: '/workspace/view.tsx',
		version: 1,
		textHash: 'fixture',
		text: 'pounds'
	},
	imports: [],
	components: [],
	enhancements: [],
	jsx: [],
	expressions: [],
	types: []
};

describe('inference evidence policy', () => {
	it('accepts bounded evidence on an inlay hint', () => {
		expect(() =>
			validateInteractiveResult('inlayHints', projection, [
				{
					position: 6,
					label: 'unit',
					evidence: [
						{
							range: { start: 0, end: 6 },
							kind: 'unit',
							explanation: 'pound inferred from authored fallback'
						}
					]
				}
			])
		).not.toThrow();
	});

	it('rejects evidence outside the projected document', () => {
		expect(() =>
			validateInteractiveResult('inlayHints', projection, [
				{
					position: 6,
					label: 'unit',
					evidence: [
						{
							range: { start: 0, end: 7 },
							kind: 'unit',
							explanation: 'invalid range'
						}
					]
				}
			])
		).toThrow('invalid inference evidence');
	});
});
