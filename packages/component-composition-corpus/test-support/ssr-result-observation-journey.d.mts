/** Checks writable preload aliases and independent render results. */
export function verifySsrResultLinks(
	api: Pick<
		typeof import('../../ssr/src/render/output-result.js'),
		'createChunkedStringResult' | 'createChunkedHydratableResult'
	>
): true;
/** Checks writable hydration field names and private cached-schema isolation. */
export function verifySsrHydrationObservations(api: {
	SsrHydrationTable: typeof import('../../ssr/src/render/hydration-table.js').SsrHydrationTable;
}): true;
