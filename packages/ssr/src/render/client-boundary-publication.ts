import { escapeAttr } from '../html.js';
import { serializeHydrationPayload } from '../hydration.js';
import type { SsrContext } from '../types.js';

/** Publishes either compact compiler-finite or self-describing client-boundary HTML. */
export function publishClientBoundary(
	context: SsrContext,
	name: string,
	id: string,
	props: Record<string, unknown>,
	hydration: 'interaction' | undefined,
	finite: boolean,
	children: string
): string {
	const coordinate = finite ? context.hydrationTable.add(name, id, props) : undefined;
	const identity = coordinate
		? ` data-xh="${coordinate}"`
		: ` data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload({ props }))}"`;
	const boundaryIdentity = coordinate
		? identity
		: ` data-exact-client-boundary="${escapeAttr(id)}"${identity}`;
	const activation = hydration
		? ` data-exact-client-hydration="${hydration}" data-exact-client-generation="1"`
		: '';
	return `<div${boundaryIdentity}${activation}>${children}</div>`;
}
