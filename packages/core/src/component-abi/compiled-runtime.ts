import { flushSync, updateReactiveShallow } from '@exactjs/reactive/framework/runtime';
import { executeCompiledComponentOutput } from '../component/compiled-output.js';
import type { AnyComponentInstance } from '../component/contracts.js';
import {
	exactCompiledClientAttachment,
	type ExactClientAttachMode,
	type ExactClientComponentArtifact,
	type ExactClientMountedRange,
	type ExactClientPropSource,
	type ExactCompiledClientAttachmentTarget
} from './client.js';

const emptyChildren: readonly unknown[] = Object.freeze([]);

/** Executes one compiler-owned output and delegates its opaque child ranges to the DOM owner. */
export function attachExactCompiledClientComponent(
	this: ExactClientComponentArtifact,
	instance: AnyComponentInstance,
	target: ExactCompiledClientAttachmentTarget,
	mode: ExactClientAttachMode
): ExactClientMountedRange {
	flushSync('normal');
	return target[exactCompiledClientAttachment](
		this,
		instance,
		executeCompiledComponentOutput(instance),
		mode
	);
}

/** Applies one final-value-per-slot prop receipt and publishes it to the receiving instance once. */
export function receiveExactClientComponentProps(
	this: ExactClientComponentArtifact,
	instance: AnyComponentInstance,
	source: ExactClientPropSource,
	children: readonly unknown[] = emptyChildren
): void {
	instance.receiveProps(this.props, source, children);
}

/** Applies the open prop surface owned by a compiler-selected dynamic component facade. */
export function receiveExactDynamicClientComponentProps(
	instance: AnyComponentInstance,
	source: ExactClientPropSource,
	children: readonly unknown[] = emptyChildren
): void {
	const next = { ...source };
	if (children.length === 1) next.children = children[0];
	else if (children.length > 1) next.children = children;
	else if (!Object.prototype.hasOwnProperty.call(source, 'children')) delete next.children;
	updateReactiveShallow(instance.props, next);
}

/** Releases a client component instance through its idempotent instance-owned finalizer. */
export function disposeExactClientComponent(instance: AnyComponentInstance, reason: unknown): void {
	instance.unmount(typeof reason === 'string' ? reason : 'artifact-dispose');
}
