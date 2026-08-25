const supportedTransports = new Set(['node-http', 'node-http-compat', 'bun-fetch']);

/** Resolves a participant's declared production transport for one benchmark runtime. */
export function ssrTransportFor(participant, runtimeId) {
	const transport = participant.ssrTransports?.[runtimeId];
	if (!transport)
		throw new Error(
			`participant ${participant.id} does not declare an SSR transport for ${runtimeId}`
		);
	if (!supportedTransports.has(transport))
		throw new Error(
			`participant ${participant.id} declares unsupported SSR transport ${transport}`
		);
	if (transport === 'bun-fetch' && runtimeId !== 'bun')
		throw new Error(`participant ${participant.id} can use bun-fetch only on Bun`);
	return transport;
}

/** Reports whether a worker must host its participant through Bun's native Fetch server. */
export function usesNativeBunServer(transport) {
	return transport === 'bun-fetch';
}
