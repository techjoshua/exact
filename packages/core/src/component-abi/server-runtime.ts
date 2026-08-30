import {
	exactServerDispose,
	exactServerIssue,
	exactServerWrite,
	type ExactHtmlWriter,
	type ExactRequestExecution,
	type ExactServerComponentArtifact,
	type ExactServerFrame
} from './server.js';

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
