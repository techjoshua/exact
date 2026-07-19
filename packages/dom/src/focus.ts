import { describeNode, domDebug } from './debug.js';
import type { Root } from './types.js';

/** Runs DOM work and restores focus if patching drops focus back to the document body. */
export function preserveFocus<T>(root: Root, work: () => T): T {
	const active = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
	const inputSelection =
		active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
			? {
					start: active.selectionStart,
					end: active.selectionEnd,
					direction: active.selectionDirection
				}
			: undefined;
	const documentSelection = active?.isContentEditable ? cloneSelection(active) : undefined;
	const result = work();
	if (active && active.isConnected && document.activeElement === document.body) {
		domDebug(root, 'restore focus', {
			active: describeNode(active),
			bodyOwnsFocus: document.activeElement === document.body
		});
		active.focus({ preventScroll: true });
	}
	if (active?.isConnected && document.activeElement === active) {
		if (
			inputSelection &&
			(active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) &&
			inputSelection.start !== null &&
			inputSelection.end !== null
		) {
			active.setSelectionRange(
				inputSelection.start,
				inputSelection.end,
				inputSelection.direction ?? undefined
			);
		} else if (documentSelection) restoreSelection(active, documentSelection);
	}
	return result;
}

type SavedSelection = { start: number[]; startOffset: number; end: number[]; endOffset: number };

function cloneSelection(root: HTMLElement): SavedSelection | undefined {
	const selection = document.getSelection();
	if (!selection?.rangeCount) return undefined;
	const range = selection.getRangeAt(0);
	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return undefined;
	return {
		start: pathFrom(root, range.startContainer),
		startOffset: range.startOffset,
		end: pathFrom(root, range.endContainer),
		endOffset: range.endOffset
	};
}

function restoreSelection(root: HTMLElement, saved: SavedSelection): void {
	const start = nodeFrom(root, saved.start);
	const end = nodeFrom(root, saved.end);
	if (!start || !end) return;
	try {
		const range = document.createRange();
		range.setStart(start, Math.min(saved.startOffset, maxOffset(start)));
		range.setEnd(end, Math.min(saved.endOffset, maxOffset(end)));
		const selection = document.getSelection();
		selection?.removeAllRanges();
		selection?.addRange(range);
	} catch {
		/* The edited content no longer contains a compatible range. */
	}
}

function pathFrom(root: Node, node: Node): number[] {
	const result: number[] = [];
	for (let cursor: Node | null = node; cursor && cursor !== root; cursor = cursor.parentNode) {
		if (!cursor.parentNode) return [];
		result.unshift(Array.prototype.indexOf.call(cursor.parentNode.childNodes, cursor));
	}
	return result;
}

function nodeFrom(root: Node, path: readonly number[]): Node | undefined {
	let node: Node | undefined = root;
	for (const index of path) node = node?.childNodes[index];
	return node;
}

function maxOffset(node: Node): number {
	return node.nodeType === Node.TEXT_NODE
		? (node.textContent?.length ?? 0)
		: node.childNodes.length;
}
