import { flushSync, updateReactiveShallow } from '@exactjs/reactive/framework/runtime';
import { executeCompiledComponentOutput, executeCompiledComponentOutputValue } from '../component/compiled-output.js';
import { normalizeRenderResult } from '../render-children.js';
import type { ExactRenderProgramInvocation } from '../render-program.js';
import type { AnyComponentInstance } from '../component/contracts.js';
import {
	exactCompiledClientAttachment,
 exactCompiledDirectProgramAttachment,
 type ExactCompiledDirectProgramTarget,
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

/** Attaches a compiler-proven returned finite region without issuing an opaque child operation. */
export function attachExactCompiledDirectProgramComponent(
 this: ExactClientComponentArtifact,
 instance: AnyComponentInstance,
 target: ExactCompiledDirectProgramTarget & ExactCompiledClientAttachmentTarget,
 mode: ExactClientAttachMode
): ExactClientMountedRange {
 if (typeof target[exactCompiledDirectProgramAttachment] !== 'function')
  throw new TypeError('The installed DOM provider does not support direct compiled regions');
 flushSync('normal');
 const output = executeCompiledComponentOutputValue(instance);
 // Authored error/suspension handling retains its ordinary output and ownership path.
 if (output == null || instance.errorFallback)
  return target[exactCompiledClientAttachment](this, instance, normalizeRenderResult(output), mode);
 return target[exactCompiledDirectProgramAttachment](this, instance, output as ExactRenderProgramInvocation, mode);
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
