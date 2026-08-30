import type { ExactServerBoundaryReceiptData } from '@exactjs/core/runtime/component-abi';
import type { AnyComponentInstance, RenderToStringOptions, SsrContext } from '../types.js';
import { ssrCapabilities } from './capability-registry.js';

type ServerBoundaryCapability = Readonly<{
	render(context: SsrContext, boundary: ExactServerBoundaryReceiptData, finite?: boolean): string;
	renderAsync(
		context: SsrContext,
		boundary: ExactServerBoundaryReceiptData,
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions,
		finite?: boolean
	): Promise<string>;
}>;

const capabilityName = 'server-boundary';

/** Installs client-boundary and resumption rendering for artifacts that emit those structures. */
export function registerServerBoundaryCapability(next: ServerBoundaryCapability): void {
	ssrCapabilities[capabilityName] = next;
}

/** Renders an explicitly compiler-selected server boundary. */
export function renderServerBoundary(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	finite = false
): string {
	const capability = ssrCapabilities[capabilityName] as ServerBoundaryCapability | undefined;
	if (!capability)
		throw new TypeError('Server boundary rendering requires its compiler capability');
	return capability.render(context, boundary, finite);
}

/** Renders an explicitly compiler-selected server boundary asynchronously. */
export function renderServerBoundaryAsync(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	finite = false
): Promise<string> {
	const capability = ssrCapabilities[capabilityName] as ServerBoundaryCapability | undefined;
	if (!capability)
		throw new TypeError('Server boundary rendering requires its compiler capability');
	return capability.renderAsync(context, boundary, parent, options, finite);
}
