import type { AnyComponentInstance, Child } from '@exactjs/core';
import type { SsrContext } from '../types.js';
import { renderChildren } from './sync-children.js';

/** Streams one opaque native operation or scalar without reopening its topology. */
export function* renderChildChunks(
	context: SsrContext,
	child: Child,
	parent: AnyComponentInstance | undefined,
	_depth: number,
	hasComponentAncestor = false
): Generator<string> {
	yield renderChildren(context, [child], parent, hasComponentAncestor);
}
