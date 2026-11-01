import type { linearTicks, scaleLinear } from '../../../component-libraries/charts/src/scales.js';
/** Executes the public scale contract shared by source, built-package and browser checks. */
export function verifyChartNumericValues(api: {
	linearTicks: typeof linearTicks;
	scaleLinear: typeof scaleLinear;
}): true;
