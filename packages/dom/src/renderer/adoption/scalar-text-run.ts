import { reconcileSelectText } from '../../controlled-select.js';
import type { Child } from '@exactjs/core';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../../types.js';
import { roots } from '../../state.js';
import { bindText } from '../patching/text-binding.js';
import { scalarText } from '../scalar-child.js';

/** Private text acquisition policy. Only explicit render carries a receiving-attempt fence. */
export type ScalarTextAcquisition = Readonly<{
	physicalParent?: Node;
	renderUpdate?: () => boolean;
}>;

/** Captures the existing receiving attempt before scalar acquisition can call authored readers. */
export function scalarTextAcquisition(root: Root, physicalParent?: Node): ScalarTextAcquisition {
	const attempt = root.componentInputAttempt;
	return {
		physicalParent,
		renderUpdate:
			attempt?.acquisitionIntent === 'render-update'
				? () =>
						roots.get(root.container) === root &&
						root.componentInputAttempt === attempt &&
						!!root.mounted?.scope.active
				: undefined
	};
}

/** Independently owned scalar bindings split from one browser-coalesced server Text. */
export type AdoptedScalarTextRun = Readonly<{
	parts: readonly { value: Child; text: string; node: Text }[];
	nextChild: number;
}>;

/**
 * Matches consecutive scalar values to one server Text before changing its topology.
 * Empty placeholders are ignored and opaque operations end the run. Matching text is split at
 * UTF-16 boundaries while retaining the original node and each scalar's independent binding.
 * This runs only when the first scalar does not already match the complete node.
 */
export function adoptCoalescedScalarTextRun(
	children: readonly Child[],
	start: number,
	node: Text,
	firstText: string
): AdoptedScalarTextRun | undefined {
	const parts: { value: Child; text: string; node: Text }[] = [
		{ value: children[start]!, text: firstText, node }
	];
	let expected = firstText;
	let nextChild = start + 1;
	while (expected.length < node.data.length && nextChild < children.length) {
		const value = children[nextChild++]!;
		if (value === null || value === undefined || value === false || value === true || value === '')
			continue;
		const text = scalarText(value);
		if (text === undefined) return undefined;
		expected += text;
		parts.push({ value, text, node });
	}
	if (expected !== node.data || parts.length < 2) return undefined;
	let current = node;
	for (let index = 0; index < parts.length; index++) {
		const part = parts[index]!;
		part.node = current;
		if (index < parts.length - 1) current = current.splitText(part.text.length);
	}
	return { parts, nextChild };
}

/** Adopts one scalar or a validated coalesced run, materializing omitted live empty anchors. */
export function adoptScalarTextChildren(
	children: readonly Child[],
	start: number,
	nodes: readonly Node[],
	cursor: number,
	parentScope: EffectScope,
	text: string,
	acquisition: ScalarTextAcquisition = {}
): { mounts: Mounted[]; nextChild: number; next: number } | undefined {
	const value = children[start]!;
	const node = nodes[cursor];
	const { physicalParent, renderUpdate } = acquisition;
	if (renderUpdate)
		return adoptUpdatedScalarRun(children, start, nodes, cursor, parentScope, text, acquisition);
	if (text === '' && (!(node instanceof Text) || node.data !== '')) {
		const parent = node?.parentNode ?? nodes[cursor - 1]?.parentNode ?? physicalParent;
		if (!parent) return undefined;
		const anchor = document.createTextNode('');
		parent.insertBefore(anchor, node ?? null);
		return {
			mounts: [bindScalar(value, text, anchor, parentScope)],
			nextChild: start + 1,
			next: cursor
		};
	}
	if (!(node instanceof Text)) return undefined;
	if (node.data === text)
		return {
			mounts: [bindScalar(value, text, node, parentScope)],
			nextChild: start + 1,
			next: cursor + 1
		};
	const run = adoptCoalescedScalarTextRun(children, start, node, text);
	if (!run) return undefined;
	return {
		mounts: run.parts.map((part) => bindScalar(part.value, part.text, part.node, parentScope)),
		nextChild: run.nextChild,
		next: cursor + 1
	};
}

/** Gives each adopted Text its own binding lifetime under the retained parent scope. */
function bindScalar(
	value: Child,
	text: string,
	node: Text,
	parentScope: EffectScope,
	isCurrent?: () => boolean
): Mounted {
	const mounted: Mounted = {
		scalar: true,
		scalarValue: text,
		dom: node,
		scope: createEffectScope(parentScope),
		children: []
	};
	bindText(mounted, value, isCurrent);
	return mounted;
}

/**
 * Explicit render replaces the values of one structurally accepted scalar run. Browser-coalesced
 * text is partitioned from the new values, never from obsolete server string lengths. Opaque
 * children end the run. An absent nonempty text node remains a structural mismatch.
 */
function adoptUpdatedScalarRun(
	children: readonly Child[],
	start: number,
	nodes: readonly Node[],
	cursor: number,
	parentScope: EffectScope,
	firstText: string,
	acquisition: ScalarTextAcquisition
): { mounts: Mounted[]; nextChild: number; next: number } | undefined {
	const parts = [{ value: children[start]!, text: firstText }];
	let nextChild = start + 1;
	while (nextChild < children.length) {
		const value = children[nextChild]!;
		if (value === null || value === undefined || typeof value === 'boolean') {
			nextChild++;
			continue;
		}
		const text = scalarText(value);
		if (text === undefined) break;
		parts.push({ value, text });
		nextChild++;
	}
	const text = parts.map((part) => part.text).join('');
	const node = nodes[cursor];
	if (!(node instanceof Text)) {
		if (text !== '' || !acquisition.renderUpdate?.()) return undefined;
		const parent = node?.parentNode ?? nodes[cursor - 1]?.parentNode ?? acquisition.physicalParent;
		if (!parent) return undefined;
		const mounts: Mounted[] = [];
		for (const part of parts) {
			if (!acquisition.renderUpdate?.()) {
				for (const mounted of mounts) mounted.scope.stop();
				return undefined;
			}
			const anchor = document.createTextNode('');
			parent.insertBefore(anchor, node ?? null);
			mounts.push(bindScalar(part.value, part.text, anchor, parentScope, acquisition.renderUpdate));
		}
		return { mounts, nextChild, next: cursor };
	}
	// Multiple physical Text siblings are not a single browser-coalesced run. Keep the existing
	// structural rejection instead of claiming their ownership from changed string lengths.
	if (nodes[cursor + 1] instanceof Text || !acquisition.renderUpdate?.()) return undefined;
	const changed = node.data !== text;
	node.data = text;
	if (changed && node.parentNode) reconcileSelectText(undefined, node.parentNode);
	let current = node;
	const mounts: Mounted[] = [];
	for (let index = 0; index < parts.length; index++) {
		if (!acquisition.renderUpdate?.()) {
			for (const mounted of mounts) mounted.scope.stop();
			return undefined;
		}
		const part = parts[index]!;
		const next = index < parts.length - 1 ? current.splitText(part.text.length) : undefined;
		mounts.push(bindScalar(part.value, part.text, current, parentScope, acquisition.renderUpdate));
		if (next) current = next;
	}
	return { mounts, nextChild, next: cursor + 1 };
}
