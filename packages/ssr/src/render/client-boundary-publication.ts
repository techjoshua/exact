import { escapeAttr } from '../html.js';
import { jsonUnsafePath, serializeHydrationPayload } from '../hydration.js';
import type { SsrContext } from '../types.js';
import { SsrHydrationTable } from './hydration-table.js';
import type { SsrSerializedResumption } from '../resumption.js';
import { clientBoundarySerializationMessage } from './client-boundary-validation.js';

/** Publishes either compact compiler-finite or self-describing client-boundary HTML. */
export function publishClientBoundary(
	context: SsrContext,
	name: string,
	id: string,
	props: Record<string, unknown>,
	hydration: 'interaction' | 'eager' | undefined,
	finite: boolean,
	children: string,
	resumptions?: readonly SsrSerializedResumption[]
): string {
	const records = resumptions?.length ? resumptions : undefined;
	const payload = { props, ...(records ? { resumptions: records } : {}) };
	if (records) {
		const unsafePath = jsonUnsafePath(payload);
		if (unsafePath) throw new Error(clientBoundarySerializationMessage(name, id, unsafePath));
	}
	// The compact prop table has no activation-record field. Use the existing explicit
	// island payload when descendants need resumptions, preserving its wire contract.
	const coordinate =
		finite && !records
			? (context.hydrationTable ??= new SsrHydrationTable()).add(name, id, props)
			: undefined;
	const identity = coordinate
		? ` data-xh="${coordinate}"`
		: ` data-exact-client-name="${escapeAttr(name)}" data-exact-client-props="${escapeAttr(serializeHydrationPayload(payload))}"`;
	const boundaryIdentity = coordinate
		? identity
		: ` data-exact-client-boundary="${escapeAttr(id)}"${identity}`;
	const activation = hydration
		? ` data-exact-client-hydration="${hydration}" data-exact-client-generation="1"`
		: '';
	return `<div${boundaryIdentity}${activation}>${children}</div>`;
}
