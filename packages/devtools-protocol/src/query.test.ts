import { describe, expect, it } from 'vitest';
import {
	paginateExactInspection,
	parseExactInspectionRequest
} from './query.js';

describe('eXact inspection query validation', () => {
	it('rejects unknown methods and oversized collection requests', () => {
		expect(() =>
			parseExactInspectionRequest({ protocol: 1, id: '1', method: 'actions.invoke' })
		).toThrow('Unknown');
		expect(() =>
			parseExactInspectionRequest({
				protocol: 1,
				id: '1',
				method: 'tasks.list',
				params: { page: { limit: 501 } }
			})
		).toThrow('limit');
	});

	it('resumes pagination without duplicating values', () => {
		const first = paginateExactInspection([1, 2, 3], { limit: 2 });
		const second = paginateExactInspection([1, 2, 3], {
			limit: 2,
			cursor: first.nextCursor
		});
		expect(first.values).toEqual([1, 2]);
		expect(second.values).toEqual([3]);
	});
});
