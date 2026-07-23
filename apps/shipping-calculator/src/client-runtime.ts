import type { ExactClient } from '@exactjs/hydrate';

let client: ExactClient | undefined;

/** Performs the install exact client domain operation. */
export function installExactClient(value: ExactClient): void {
	client = value;
}
/** Performs the exact client domain operation. */
export function exactClient(): ExactClient {
	if (!client) throw new Error('Parcel Lab hydration client is not ready');
	return client;
}
