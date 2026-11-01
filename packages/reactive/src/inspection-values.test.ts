import { it } from 'vitest';
import {
	reactive,
	computed,
	inspectComputed,
	createEffectScope,
	withEffectScope,
	type ComputedInspection
} from './index.js';
import { verifyComputedObservationValues } from '../../component-composition-corpus/test-support/observation-values-journey.mjs';
it('keeps computed observation aliases independent of graph state', () =>
	verifyComputedObservationValues({
		reactive,
		computed,
		inspectComputed,
		createEffectScope,
		withEffectScope
	}));
/** Compile-only control for the diagnostic surface. */
function readonlyInspection(value: ComputedInspection) {
	// @ts-expect-error Diagnostic fields remain readonly in TypeScript.
	value.sources = 0;
}
void readonlyInspection;
