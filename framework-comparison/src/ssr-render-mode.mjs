const streamingParticipants = new Set(['exact', 'react', 'tanstack-start']);

/** Selects an actual renderer API, rejecting modes unavailable for the controlled application. */
export function ssrRenderMode(value = process.env.COMPARISON_SSR_RENDER_MODE, participantId) {
	const mode = value ?? 'string';
	if (!['string', 'stream'].includes(mode)) throw new Error(`Unknown SSR rendering mode ${mode}`);
	if (mode === 'stream' && participantId && !streamingParticipants.has(participantId))
		throw new Error(`${participantId} has no streaming renderer for this controlled document`);
	return mode;
}

/** Reports whether this fixture exposes the requested API without substituting another mode. */
export function supportsSsrRenderMode(participantId, mode) {
	ssrRenderMode(mode);
	return mode === 'string' || streamingParticipants.has(participantId);
}
