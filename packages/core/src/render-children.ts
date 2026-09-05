import type { Child, RenderResult } from './component/contracts.js';

/** Flattens nested compiler-produced child arrays without assigning renderer topology. */
export function normalizeChildren(children: unknown[]): Child[] {
	const normalized: Child[] = [];
	for (const child of children) {
		if (Array.isArray(child)) normalized.push(...normalizeChildren(child));
		else normalized.push(child as Child);
	}
	return normalized;
}

/** Normalizes one component output into its owned child sequence. */
export function normalizeRenderResult(result: RenderResult): Child[] {
	if (!Array.isArray(result)) return [result];
	for (const child of result) if (Array.isArray(child)) return normalizeChildren(result);
	return result as Child[];
}
