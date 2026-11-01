/** Shares portable loader ownership checks using a genuine compiled client component. */
export function verifyRemoteLoadOwnership(api: {
	load(url: string, integrity?: string, signal?: AbortSignal): Promise<unknown>;
	component: unknown;
}): Promise<{ cases: number }>;
