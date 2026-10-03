import type { Child } from '@exactjs/core';
import { createEffectScope, type EffectScope } from '@exactjs/reactive/framework/runtime';
import type { Mounted } from '../../types.js';
import { bindText } from '../patching/text-binding.js';
import { scalarText } from '../scalar-child.js';

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
	physicalParent?: Node
): { mounts: Mounted[]; nextChild: number; next: number } | undefined {
	const value = children[start]!;
	const node = nodes[cursor];
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
function bindScalar(value: Child, text: string, node: Text, parentScope: EffectScope): Mounted {
	const mounted: Mounted = {
		scalar: true,
		scalarValue: text,
		dom: node,
		scope: createEffectScope(parentScope),
		children: []
	};
	bindText(mounted, value);
	return mounted;
}
