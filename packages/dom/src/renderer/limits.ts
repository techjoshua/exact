import type { Root } from '../types.js';
import { consumeDomWork } from '../work.js';

const DEFAULT_MAX_TREE_DEPTH = 512;
const HARD_MAX_TREE_DEPTH = 1_024;
const DEFAULT_MAX_TREE_NODES = 100_000;

/** Signals that a renderer traversal exceeded its configured nesting limit. */
export class DomTreeDepthError extends Error {
	constructor(limit: number) {
		super(`eXact DOM tree exceeds the configured maximum depth of ${limit}`);
		this.name = 'DomTreeDepthError';
	}
}

/** Signals that one renderer update exceeded its configured work limit. */
export class DomTreeWorkError extends Error {
	constructor(limit: number) {
		super(`eXact DOM update exceeds the configured maximum of ${limit} render values`);
		this.name = 'DomTreeWorkError';
	}
}

/** Normalizes a caller-provided depth limit and enforces the hard safety cap. */
export function normalizeTreeDepth(value: number | undefined): number {
	return Number.isSafeInteger(value) && value! > 0
		? Math.min(value!, HARD_MAX_TREE_DEPTH)
		: DEFAULT_MAX_TREE_DEPTH;
}

/** Normalizes the amount of vnode work permitted during one renderer update. */
export function normalizeTreeNodes(value: number | undefined): number {
	return Number.isSafeInteger(value) && value! > 0 ? value! : DEFAULT_MAX_TREE_NODES;
}

/**
 * Establishes an update-scoped work counter.
 *
 * Nested renderer calls share the outer counter so re-entrant work cannot reset
 * the safety budget partway through an update.
 */
export function withDomWork<T>(root: Root, run: () => T): T {
	const outermost = root.workDepth++ === 0;
	if (outermost) root.traversedNodes = 0;
	try {
		return run();
	} finally {
		root.workDepth--;
	}
}

/** Charges one render value against both local and hydration-shared budgets. */
export function countDomWork(root: Root): void {
	if (root.workBudget) consumeDomWork(root.workBudget);
	if (++root.traversedNodes > root.maxTreeNodes) {
		throw new DomTreeWorkError(root.maxTreeNodes);
	}
}

/** Returns whether an error represents an intentional renderer safety limit. */
export function isDomRenderLimitError(
	error: unknown
): error is DomTreeDepthError | DomTreeWorkError {
	return error instanceof DomTreeDepthError || error instanceof DomTreeWorkError;
}

/** Runs one nested traversal step while restoring depth on every exit path. */
export function withTreeDepth<T>(root: Root, run: () => T): T {
	root.traversalDepth++;
	if (root.traversalDepth > root.maxTreeDepth) {
		root.traversalDepth--;
		throw new DomTreeDepthError(root.maxTreeDepth);
	}
	try {
		return run();
	} finally {
		root.traversalDepth--;
	}
}
