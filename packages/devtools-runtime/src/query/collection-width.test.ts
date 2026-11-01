import { it } from 'vitest';
import { paginateInspectionSources } from './collection-pagination.js';
import {
	verifyWideInspectionPage,
	verifyFiniteInspectionSources
} from '../../../component-composition-corpus/test-support/wide-runtime-collections.mjs';
it.each([3, 140_000])('returns a configured %i-entry inspection page in order', async (count) => {
	await verifyWideInspectionPage({ paginateInspectionSources }, count);
});

it.each([3, 256])(
	'visits finite inspection owners and retained offsets at width %i',
	async (count) => {
		await verifyFiniteInspectionSources({ paginateInspectionSources }, count);
	}
);
