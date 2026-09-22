import type { Child } from '@exactjs/core';
import { createCompiledIntrinsicReceipt } from '@exactjs/core/runtime/component-operations';
import {
	readRenderProgramReceipt,
	readRenderProgramSlot,
	type ExactRenderProgramInvocation,
	type ExactRenderProgramPropertyOperand
} from '@exactjs/core/runtime/render-operations';
import { readIndexedReactiveSlot, unwrap } from '@exactjs/reactive/framework/runtime';
import type { PreparedTextResolver } from '@exactjs/core/framework/render-structure';
import { materializeProgramTemplate } from './render-program-template.js';
import { claimCompiledRenderProgram, type ClaimedRenderProgram } from './render-program-claims.js';

type Snapshot = { element: Element; claims: ClaimedRenderProgram };

/**
 * Serializes compiler programs through inert template claims. No template node is attached and no
 * event, ref, binding, or lifecycle is installed on it. Only captured slot readers are evaluated.
 * The containing text presentation owns reactive tracking and nested component lifetimes.
 */
export function createTextProgramProjection(ownerDocument: Document): PreparedTextResolver {
	const snapshots = new WeakMap<object, Snapshot>();
	return (value, project) => {
		const receipt = readRenderProgramReceipt(value);
		if (!receipt) return undefined;
		const invocation = receipt.invocation;
		let snapshot = snapshots.get(invocation.program);
		if (!snapshot) {
			if (invocation.program.template === undefined)
				throw new TypeError('Text projection requires a client render program');
			const fragment = materializeProgramTemplate(invocation.program, ownerDocument);
			const element = fragment.firstElementChild;
			const claims = element && claimCompiledRenderProgram(invocation.program, element, 'template');
			if (!element || !claims) throw new TypeError('Invalid compiler program text projection');
			snapshot = { element, claims };
			snapshots.set(invocation.program, snapshot);
		}
		return project([readSnapshot(snapshot, invocation)]);
	};
}

function readSnapshot(snapshot: Snapshot, invocation: ExactRenderProgramInvocation): Child {
	const replacements = new Map<Node, Child>();
	const properties = new Map<Element, Record<string, unknown>>();
	const insertions = new Map<Node, Array<{ before: Node | null; value: Child }>>();
	const slot = (index: number): Child => unwrap(readRenderProgramSlot(invocation, index)) as Child;
	const operand = (source: 0 | 1, index: number): unknown => {
		const owner = invocation.owner as { state: object; props: object };
		return unwrap(readIndexedReactiveSlot(source === 0 ? owner.state : owner.props, index));
	};
	const replace = (index: number, value: Child) => {
		const node = snapshot.claims.slotNodes[index];
		if (Array.isArray(node)) {
			const [parent, , end] = node;
			let pending = insertions.get(parent);
			if (!pending) insertions.set(parent, (pending = []));
			pending.push({ before: end ?? null, value });
		} else if (node) replacements.set(node as Node, value);
	};
	for (const operation of invocation.program.wire?.[2] ?? []) {
		const index = operation[1] as number;
		switch (operation[0]) {
			case 0: {
				const input = Array.isArray(operation[2])
					? operand(operation[2][0] as 0 | 1, operation[2][1] as number)
					: slot(index);
				replace(index, input as Child);
				break;
			}
			case 11: {
				const [prefix, suffix, , source, offset] = operation[2] as readonly [
					string,
					string,
					boolean?,
					(0 | 1)?,
					number?
				];
				const input = source === undefined ? slot(index) : operand(source, offset!);
				replace(
					index,
					`${prefix}${input == null || typeof input === 'boolean' ? '' : String(input)}${suffix}`
				);
				break;
			}
			case 1:
			case 2:
			case 3:
				replace(index, slot(index));
				break;
			case 4:
				for (const child of operation[1] as readonly number[]) replace(child, slot(child));
				break;
			case 5:
			case 6:
			case 12: {
				const element = snapshot.claims.slotNodes[operation[2] as number] as Element;
				const props = properties.get(element) ?? {};
				const apply = (name: string, value: unknown) => {
					if (name === '') Object.assign(props, unwrap(value));
					else props[name] = unwrap(value);
				};
				if (operation[0] === 12)
					for (const [
						name,
						source,
						offset
					] of operation[3] as readonly ExactRenderProgramPropertyOperand[])
						apply(name, operand(source, offset));
				else invocation.propertyWriter?.(index, apply);
				properties.set(element, props);
				break;
			}
		}
	}
	const children = (node: Node): Child[] => {
		const result: Child[] = [];
		const pending = insertions.get(node) ?? [];
		for (const child of node.childNodes) {
			for (const insertion of pending) if (insertion.before === child) result.push(insertion.value);
			result.push(read(child));
		}
		for (const insertion of pending) if (insertion.before === null) result.push(insertion.value);
		return result;
	};
	const read = (node: Node): Child => {
		if (replacements.has(node)) return replacements.get(node);
		if (node.nodeType === 3) return node.textContent ?? '';
		if (!(node instanceof Element)) return null;
		const props: Record<string, unknown> = {};
		for (const attribute of node.attributes)
			if (attribute.name !== 'data-exact-id') props[attribute.name] = attribute.value;
		Object.assign(props, properties.get(node));
		return createCompiledIntrinsicReceipt(node.localName, props, ...children(node));
	};
	return read(snapshot.element);
}
