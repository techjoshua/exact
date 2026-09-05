import type { AnyComponentInstance } from '../component/contracts.js';
import { executePreparedComponentOutput } from '../component/render.js';
import {
	exactCompatibilityClientAttachment,
	type ExactClientAttachMode,
	type ExactClientComponentArtifact,
	type ExactCompatibilityClientAttachmentTarget,
	type ExactClientMountedRange
} from './client.js';

/** Delegates a fixed foreign-renderer island without projecting its output into native children. */
export function attachExactCompatibilityClientComponent(
	this: ExactClientComponentArtifact,
	instance: object,
	target: ExactCompatibilityClientAttachmentTarget,
	mode: ExactClientAttachMode
): ExactClientMountedRange {
	return target[exactCompatibilityClientAttachment](this, instance, mode);
}
import {
	exactServerDispose,
	exactServerIssue,
	exactServerWrite,
	type ExactHtmlWriter,
	type ExactRequestExecution,
	type ExactServerComponentArtifact,
	type ExactServerFrame
} from './server.js';

/** Executes compatibility-owned output without asserting a native child representation. */
export function executeExactCompatibilityComponentOutput(
	instance: AnyComponentInstance,
	onInvalidate: () => void
): unknown {
	return executePreparedComponentOutput(instance, onInvalidate);
}

/** Releases a client component instance through its idempotent instance-owned finalizer. */
export function disposeExactClientComponent(instance: AnyComponentInstance, reason: unknown): void {
	instance.unmount(typeof reason === 'string' ? reason : 'artifact-dispose');
}

/** Establishes request ownership through the request execution protocol. */
export function issueExactServerComponent(
	this: ExactServerComponentArtifact,
	request: ExactRequestExecution,
	parent: object | undefined,
	props: Record<string, unknown>
): object | Promise<object> {
	return request[exactServerIssue](this, parent, props);
}

/** Publishes an issued frame through the writer protocol in authored order. */
export function writeExactServerComponent(
	this: ExactServerComponentArtifact,
	frame: object,
	output: ExactHtmlWriter
): void | Promise<void> {
	return output[exactServerWrite](this, frame);
}

/** Releases request-local frame ownership without storing request state on the artifact. */
export function disposeExactServerComponent(
	this: ExactServerComponentArtifact,
	frame: ExactServerFrame,
	reason: unknown
): void | Promise<void> {
	return frame[exactServerDispose](this, reason);
}
