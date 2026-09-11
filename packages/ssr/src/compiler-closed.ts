import type { Child } from '@exactjs/core';
import { renderHydratableOutput, renderStringOutput } from './render/render-output.js';
import type { HydrationScriptOptions, RenderToStringOptions } from './types.js';

/** Compiler-proven roots use the shared engine, retaining only their root-boundary proof. */
export function renderCompilerClosedToString(
	operation: Child,
	options: RenderToStringOptions = {}
) {
	return renderStringOutput(operation, options, false);
}

/** Unmarked compiler roots use the shared engine with their established marker policy. */
export function renderCompilerClosedUnmarkedToString(
	operation: Child,
	options: RenderToStringOptions = {}
) {
	return renderStringOutput(operation, { ...options, markers: false }, true);
}

/** Hydration shares capture and execution with ordinary roots while omitting the proven root marker. */
export function renderCompilerClosedToHydratableString(
	operation: Child,
	options: RenderToStringOptions & HydrationScriptOptions = {}
) {
	return renderHydratableOutput(operation, options, true);
}
