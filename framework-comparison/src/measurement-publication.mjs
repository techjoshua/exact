/**
 * Derives publication metadata without preventing a local collector from preserving raw evidence.
 */
export function measurementPublication(metadata, label, warn = console.warn) {
	const unreviewed = metadata
		.filter((participant) => participant.status !== 'complete')
		.map((participant) => participant.id);
	if (unreviewed.length)
		warn(
			`Raw ${label} measurement will be marked non-publishable because participants remain unreviewed: ${unreviewed.join(', ')}`
		);
	return Object.freeze({
		publishable: unreviewed.length === 0,
		unreviewed: Object.freeze(unreviewed)
	});
}
