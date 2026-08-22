import { describeNode, domDebug } from './debug.js';
import type { DomFocusSnapshot, Root } from './types.js';

/** Runs DOM work and restores a user-focused element if patching drops focus to the document body. */
export function preserveFocus<T>(root: Root, work: () => T): T {
	if (root.focusTransactionDepth > 0) {
		root.focusTransactionDepth++;
		try {
			return work();
		} finally {
			root.focusTransactionDepth--;
		}
	}
	root.focusTransactionDepth = 1;
	root.focusSnapshot = captureFocus();
	try {
		const result = work();
		restoreFocus(root, root.focusSnapshot);
		return result;
	} finally {
		root.focusSnapshot = undefined;
		root.focusTransactionDepth = 0;
	}
}

/** Captures the one authored focus owner shared by a complete DOM transaction. */
function captureFocus(): DomFocusSnapshot | undefined {
	const active = document.activeElement;
	// Body focus means that no authored control owns focus. Besides avoiding unnecessary browser
	// focus work, this prevents passive hydration from manufacturing a focus transition.
	if (!(active instanceof HTMLElement) || active === document.body) return undefined;
	return {
		active,
		inputSelection:
			active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
				? {
						start: active.selectionStart,
						end: active.selectionEnd,
						direction: active.selectionDirection
					}
				: undefined,
		documentSelection: active.isContentEditable ? cloneSelection(active) : undefined
	};
}

/** Restores the focus snapshot once, after all nested reconciliation work completes. */
function restoreFocus(root: Root, snapshot: DomFocusSnapshot | undefined): void {
	if (!snapshot) return;
	const { active, inputSelection, documentSelection } = snapshot;
	if (active.isConnected && document.activeElement === document.body) {
		domDebug(root, 'restore focus', () => ({
			active: describeNode(active),
			bodyOwnsFocus: document.activeElement === document.body
		}));
		active.focus({ preventScroll: true });
	}
	if (active.isConnected && document.activeElement === active) {
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
}

function cloneSelection(root: HTMLElement): DomFocusSnapshot['documentSelection'] {
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

function restoreSelection(
	root: HTMLElement,
	saved: NonNullable<DomFocusSnapshot['documentSelection']>
): void {
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
