import type { ExactServerBoundaryReceiptData } from '@exactjs/core/runtime/component-abi';
import type { AnyComponentInstance, RenderToStringOptions, SsrContext } from '../types.js';
import { ssrCapabilities } from './capability-registry.js';
import type { RenderValue } from './execution.js';

type ServerBoundaryCapability = Readonly<{
	renderAsync(
		context: SsrContext,
		boundary: ExactServerBoundaryReceiptData,
		parent: AnyComponentInstance | undefined,
		options: RenderToStringOptions,
		finite?: boolean
	): RenderValue<string>;
}>;

const capabilityName = 'server-boundary';

/** Installs client-boundary and resumption rendering for artifacts that emit those structures. */
export function registerServerBoundaryCapability(next: ServerBoundaryCapability): void {
	ssrCapabilities[capabilityName] = next;
}

/** Renders an explicitly compiler-selected server boundary asynchronously. */
export function renderServerBoundary(
	context: SsrContext,
	boundary: ExactServerBoundaryReceiptData,
	parent: AnyComponentInstance | undefined,
	options: RenderToStringOptions,
	finite = false
): RenderValue<string> {
	const capability = ssrCapabilities[capabilityName] as ServerBoundaryCapability | undefined;
	if (!capability)
		throw new TypeError('Server boundary rendering requires its compiler capability');
	return capability.renderAsync(context, boundary, parent, options, finite);
}
