import type { Child, RenderResult } from './component/contracts.js';

/** Flattens nested compiler-produced child arrays without assigning renderer topology. */
export function normalizeChildren(children: unknown[]): Child[] {
	const normalized: Child[] = [];
	appendNormalizedChildren(children, normalized);
	return normalized;
}

/** Appends descendants in order without temporary arrays or variadic argument limits. */
function appendNormalizedChildren(children: unknown[], normalized: Child[]): void {
	for (const child of children) {
		if (Array.isArray(child)) appendNormalizedChildren(child, normalized);
		else normalized.push(child as Child);
	}
}

/** Normalizes one component output into its owned child sequence. */
export function normalizeRenderResult(result: RenderResult): Child[] {
	if (!Array.isArray(result)) return [result];
	for (const child of result) if (Array.isArray(child)) return normalizeChildren(result);
	return result as Child[];
}
