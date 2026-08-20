import type { Readable } from 'node:stream';

/** Frames newline-delimited UTF-8 messages while bounding each incomplete frame. */
export function readBoundedLines(
	stream: Readable,
	maxBytes: number,
	onLine: (line: string) => void,
	onError: (error: Error) => void
): () => void {
	let chunks: Buffer[] = [];
	let length = 0;
	let stopped = false;
	const data = (input: Buffer | string) => {
		if (stopped) return;
		let chunk = Buffer.isBuffer(input) ? input : Buffer.from(input);
		while (chunk.length) {
			const newline = chunk.indexOf(10);
			const part = newline < 0 ? chunk : chunk.subarray(0, newline);
			length += part.length;
			if (length > maxBytes) return fail('Language protocol frame exceeded its byte limit');
			if (part.length) chunks.push(part);
			if (newline < 0) return;
			try {
				onLine(
					new TextDecoder('utf-8', { fatal: true })
						.decode(Buffer.concat(chunks, length))
						.replace(/\r$/, '')
				);
			} catch {
				return fail('Language protocol frame was not valid UTF-8');
			}
			chunks = [];
			length = 0;
			chunk = chunk.subarray(newline + 1);
		}
	};
	stream.on('data', data);
	return () => {
		stopped = true;
		stream.off('data', data);
		chunks = [];
	};

	function fail(message: string): void {
		if (stopped) return;
		stopped = true;
		stream.off('data', data);
		onError(new Error(message));
	}
}
