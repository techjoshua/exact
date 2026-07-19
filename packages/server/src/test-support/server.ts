import { type ExactServerContext } from '../index.js';

export const noopLogger = {
	isEnabled: () => false,
	log() {}
};

export function context(overrides: Partial<ExactServerContext> = {}): ExactServerContext {
	return {
		manifest: {
			version: 1,
			actions: {
				'allowed-action': { id: 'allowed-action', placement: 'server' }
			},
			boundaries: {
				'allowed-boundary': { id: 'allowed-boundary' }
			}
		},
		actions: {
			'allowed-action': async (input) => ({
				patches: [
					{
						type: 'text',
						id: 'title',
						value: String((input.payload as { title?: string }).title ?? '')
					}
				]
			})
		},
		refreshBoundaries: {
			'allowed-boundary': () => ({
				patches: [{ type: 'replace', id: 'allowed-boundary', html: '<section>Updated</section>' }]
			})
		},
		logger: noopLogger,
		...overrides
	};
}

export async function readStreamEvents(stream: ReadableStream<Uint8Array>): Promise<unknown[]> {
	const reader = stream.getReader();
	return readRemainingStreamEvents(reader);
}

export async function readRemainingStreamEvents(
	reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<unknown[]> {
	const events: unknown[] = [];
	while (true) {
		const next = await reader.read();
		if (next.done) return events;
		const text = new TextDecoder().decode(next.value);
		for (const line of text.split(/\r?\n/)) {
			if (line.trim()) events.push(JSON.parse(line));
		}
	}
}

export async function readNextStreamLine(
	reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
	const next = await reader.read();
	if (next.done) throw new Error('stream ended');
	return new TextDecoder().decode(next.value).trim();
}
