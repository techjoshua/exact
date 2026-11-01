import { itemMarkerKey } from './item-markers.js';
import {
	consumeDomWork,
	createDomWorkBudget,
	findNodeOwnerInstance,
	walkDomSubtree,
	type DomWorkBudget
} from '@exactjs/dom/root';
import { type ExactRange, type ProtocolIndex } from './planning.js';

/** Creates a protocol index. */
export function createProtocolIndex(
	container: Element,
	work?: number | DomWorkBudget,
	executionRoot?: string
): ProtocolIndex | undefined {
	const budget = typeof work === 'number' || work === undefined ? createDomWorkBudget(work) : work;
	const index: ProtocolIndex = {
		ranges: new Map(),
		exactElements: new Map(),
		serverSlots: new Map(),
		clientBoundaries: new Map(),
		listItems: new Map(),
		budget
	};
	const attributes: Array<[string, Map<string, Element>]> = [
		['data-exact-id', index.exactElements],
		['data-exact-server-slot', index.serverSlots],
		['data-exact-client-boundary', index.clientBoundaries]
	];
	const stack: Array<{
		data: string;
		id: string;
		start: Comment;
		nearestBoundaryId?: string;
		listId?: string;
		itemKey?: string;
		nestedItem: boolean;
	}> = [];
	let valid = true;
	walkDomSubtree(
		container,
		(node) => {
			if (!valid) return;
			if (node instanceof Element) {
				if (!ownedByExecutionRoot(node, executionRoot)) return;
				for (const [attribute, output] of attributes) {
					const value = node.getAttribute(attribute);
					if (value === null) continue;
					if (output.has(value)) {
						valid = false;
						return;
					}
					output.set(value, node);
				}
				return;
			}
			if (!(node instanceof Comment)) return;
			const comment = node;
			const data = comment.data;
			if (data.startsWith('/exact:') || data.startsWith('/i:')) {
				const open = stack.pop();
				if (!open || data !== `/${open.data}`) {
					valid = false;
					return;
				}
				const range = { start: open.start, end: comment };
				if (!ownedByExecutionRoot(open.start, executionRoot) || open.nestedItem) return;
				if (open.itemKey !== undefined && open.listId) {
					let items = index.listItems.get(open.listId);
					if (!items) index.listItems.set(open.listId, (items = new Map()));
					if (items.has(open.itemKey)) {
						valid = false;
						return;
					}
					items.set(open.itemKey, range);
				} else {
					if (index.ranges.has(open.id)) {
						valid = false;
						return;
					}
					index.ranges.set(open.id, range);
				}
				return;
			}
			if (!data.startsWith('exact:') && !data.startsWith('i:')) return;
			const id = data.startsWith('i:') ? `item:${data.slice(2)}` : data.slice('exact:'.length);
			const itemKey = itemMarkerKey(data);
			if (itemKey === '') {
				valid = false;
				return;
			}
			const parent = stack.at(-1);
			const parentBoundary = parent?.nearestBoundaryId;
			const nestedItem = itemKey !== undefined && parent?.itemKey !== undefined;
			const listId = itemKey === undefined || nestedItem ? undefined : parentBoundary;
			const nearestBoundaryId = itemKey === undefined ? id : parentBoundary;
			stack.push({ data, id, start: comment, nearestBoundaryId, listId, itemKey, nestedItem });
		},
		{ budget }
	);
	return !valid || stack.length ? undefined : index;
}

function ownedByExecutionRoot(node: Node, executionRoot: string | undefined): boolean {
	if (!executionRoot) return true;
	const owner = findNodeOwnerInstance(node);
	return !owner || owner.domain.executionRoot === executionRoot;
}

/** Rebuilds direct list membership while keeping nested item and explicit boundary scopes separate. */
export function reindexList(index: ProtocolIndex, listId: string): void {
	const list = index.ranges.get(listId);
	if (!list) return;
	const items = new Map<string, ExactRange>();
	let cursor: Node | null = list.start.nextSibling;
	const stack: Array<{ data: string; start: Comment; key?: string }> = [];
	while (cursor && cursor !== list.end) {
		consumeDomWork(index.budget);
		if (cursor instanceof Comment) {
			const data = cursor.data;
			if (data.startsWith('i:') || data.startsWith('exact:')) {
				const key = stack.length ? undefined : itemMarkerKey(data);
				stack.push({ data, start: cursor, key });
			} else if (data.startsWith('/i:') || data.startsWith('/exact:')) {
				const open = stack.pop();
				if (open?.key !== undefined && data === `/${open.data}`)
					items.set(open.key, { start: open.start, end: cursor });
			}
		}
		cursor = cursor.nextSibling;
	}
	index.listItems.set(listId, items);
}
