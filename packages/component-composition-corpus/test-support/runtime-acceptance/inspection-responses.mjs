import * as queryDataApi from '@exactjs/devtools-protocol';
import { verifyInspectionQueryData } from '../inspection-query-journey.ts';
import { parseExactInspectionResponse } from '@exactjs/devtools-protocol';

/** Verifies transported failure codes retain their string type without selector coercion. */
export function inspectionResponseJourney() {
	verifyInspectionQueryData(queryDataApi);
	const results = [];
	for (const error of ['unavailable', 'not-authorized', 'bad-request']) {
		const response = { protocol: 1, id: 'response', ok: false, error };
		results.push(parseExactInspectionResponse(response).error === error);
		for (const invalid of [[error], [[error]]]) {
			let rejected = false;
			try {
				parseExactInspectionResponse({ ...response, error: invalid });
			} catch (failure) {
				rejected = failure instanceof TypeError;
			}
			results.push(rejected);
		}
	}
	return results;
}
