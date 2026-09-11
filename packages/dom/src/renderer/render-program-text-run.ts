import type { RenderProgramChildAnchor } from '../types.js';

/** Hydration-only text values collected by the ordinary dependency-tracked binding pass. */
export type PendingProgramTextRuns = {
	runs: { container: Node; parts: readonly (string | number)[] }[];
	values: Map<number, string | undefined>;
};

/** Records a compiler-proven whole-element run without changing its server DOM. */
export function prepareProgramTextRun(
	container: Node,
	parts: readonly (string | number)[],
	pending: PendingProgramTextRuns
): boolean {
	const first = container.firstChild;
	if (first && (!(first instanceof Text) || first.nextSibling)) return false;
	pending.runs.push({ container, parts });
	for (const part of parts) if (typeof part === 'number') pending.values.set(part, undefined);
	return true;
}

/**
 * Validates every collected run before splitting any DOM. UTF-16 offsets preserve independent
 * binding ownership even for empty values and repeated delimiters. The caller releases this
 * temporary plan on success or failure; no run bookkeeping survives initial hydration.
 */
export function finishProgramTextRuns(
	pending: PendingProgramTextRuns,
	slotNodes: readonly (Node | RenderProgramChildAnchor | undefined)[]
): boolean {
	for (const { container, parts } of pending.runs) {
		let expected = '';
		for (const part of parts) {
			const value = typeof part === 'string' ? part : pending.values.get(part);
			if (value === undefined) return false;
			expected += value;
		}
		const first = container.firstChild;
		if (first && (!(first instanceof Text) || first.nextSibling)) return false;
		if ((first?.textContent ?? '') !== expected) return false;
	}
	const nodes = slotNodes as (Node | RenderProgramChildAnchor | undefined)[];
	for (const { container, parts } of pending.runs) {
		let node = container.firstChild as Text | null;
		if (!node) {
			node = container.ownerDocument!.createTextNode('');
			container.appendChild(node);
		}
		for (let index = 0; index < parts.length; index++) {
			const part = parts[index]!;
			const value = typeof part === 'string' ? part : pending.values.get(part)!;
			if (typeof part === 'number') nodes[part] = node;
			if (index < parts.length - 1) node = node.splitText(value.length);
		}
	}
	return true;
}
