/** Provides the canonical default dom work limit value. */
export const DEFAULT_DOM_WORK_LIMIT = 100_000;

/** Defines the dom work budget type contract. */
export type DomWorkBudget = { readonly limit: number; used: number };

/** Creates a dom work budget. */
export function createDomWorkBudget(maxNodes?: number): DomWorkBudget {
	return {
		limit: Number.isSafeInteger(maxNodes) && maxNodes! > 0 ? maxNodes! : DEFAULT_DOM_WORK_LIMIT,
		used: 0
	};
}

/** Performs the consume dom work domain operation. */
export function consumeDomWork(budget: DomWorkBudget): void {
	if (++budget.used > budget.limit) throw new DomTraversalLimitError(budget.limit);
}

/** Reserves a known amount of work without allowing a partially consumed reservation. */
export function reserveDomWork(budget: DomWorkBudget, amount: number): void {
	if (!Number.isSafeInteger(amount) || amount < 0)
		throw new RangeError('DOM work reservation must be a non-negative safe integer');
	if (amount > budget.limit - budget.used) throw new DomTraversalLimitError(budget.limit);
	budget.used += amount;
}

/** Represents a failure raised by dom traversal limit. */
export class DomTraversalLimitError extends Error {
	constructor(readonly limit: number) {
		super(`eXact DOM traversal exceeds the configured maximum of ${limit} nodes`);
		this.name = 'DomTraversalLimitError';
	}
}

/** Iterates an existing DOM subtree with one total, selector-independent budget. */
export function walkDomSubtree(
	root: Node,
	visit: (node: Node) => void,
	options: { maxNodes?: number; includeRoot?: boolean; budget?: DomWorkBudget } = {}
): number {
	const budget = options.budget ?? createDomWorkBudget(options.maxNodes);
	let visited = 0;
	const accept = (node: Node): void => {
		consumeDomWork(budget);
		visited++;
		visit(node);
	};
	if (options.includeRoot !== false) accept(root);
	const ownerDocument = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
	if (!ownerDocument) throw new Error('Cannot traverse a DOM node without an owner document');
	const walker = ownerDocument.createTreeWalker(root, 0xffffffff);
	while (walker.nextNode()) accept(walker.currentNode);
	return visited;
}
