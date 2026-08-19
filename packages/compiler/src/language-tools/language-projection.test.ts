import { describe, expect, it } from 'vitest';
import type { NativeCompilerResponse } from '../native/process-contracts.js';
import { createExactLanguageProjection } from './language-projection.js';

describe('language projection JSX ranges', () => {
	it('separates the opening tag from the complete nested element range', () => {
		const source = '<time time:update="second"><time>nested</time>{Date.now()}</time>';
		const openingEnd = source.indexOf('>') + 1;
		const response = {
			analysis: {
				components: [],
				imports: [],
				stateReads: [],
				enhancementActivations: [],
				jsx: [
					{
						start: 0,
						length: openingEnd,
						tag: 'time',
						intrinsic: true,
						attributes: []
					}
				]
			}
		} as unknown as NativeCompilerResponse;

		const [element] = createExactLanguageProjection('/clock.tsx', source, 1, response).jsx;
		expect(element?.openingRange).toEqual({ start: 0, end: openingEnd });
		expect(element?.range).toEqual({ start: 0, end: source.length });
	});
});
