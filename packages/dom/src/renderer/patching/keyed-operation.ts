import type { AnyComponentInstance, Child } from '@exactjs/core';
import type {
	ExactKeyedChildReceipt,
	ExactKeyedChildReceiptData
} from '@exactjs/core/runtime/component-operations';
import {
	createEffectScope,
	transferEffectScope,
	type EffectScope
} from '@exactjs/reactive/framework/runtime';
import type { Mounted, Root } from '../../types.js';
import { patchChildren } from './children.js';

/** Updates one compiler-keyed child while retaining its range and reactive owner scope. */
export function patchKeyedOperation(
	root: Root,
	parent: Node,
	mounted: Mounted,
	operation: ExactKeyedChildReceipt,
	data: ExactKeyedChildReceiptData,
	parentInstance: AnyComponentInstance | undefined,
	parentScope: EffectScope | undefined,
	structuralOwner: Mounted | undefined
): Mounted {
	const retainedRange = mounted.range === 'item' ? mounted : undefined;
	const previous = retainedRange?.children[0] ?? mounted;
	const previousScope = retainedRange?.scope;
	const nextScope = data.ownerScope ?? previousScope ?? createEffectScope(parentScope);
	if (data.ownerScope && nextScope !== previousScope) transferEffectScope(nextScope, parentScope);
	const patchedChildren = patchChildren(
		root,
		parent,
		[previous],
		[data.value as Child],
		parentInstance,
		nextScope,
		undefined,
		structuralOwner
	);
	if (patchedChildren.length !== 1)
		throw new Error('A keyed compiler operation must contribute one child range');
	const patched = patchedChildren[0]!;
	if (retainedRange) {
		if (patched.scope !== nextScope) transferEffectScope(patched.scope, nextScope);
		if (previousScope && previousScope !== nextScope) previousScope.stop();
		retainedRange.operation = operation;
		retainedRange.operationKey = data.key;
		retainedRange.scope = nextScope;
		retainedRange.dom = patched.dom;
		retainedRange.end = patched.end;
		retainedRange.children = [patched];
		return retainedRange;
	}
	return {
		operation,
		operationKey: data.key,
		range: 'item',
		dom: patched.dom,
		...(patched.end ? { end: patched.end } : {}),
		scope: nextScope,
		children: [patched]
	};
}
