import type { Readable } from 'node:stream';

/** Incrementally frames bounded UTF-8 newline messages from a subprocess stream. */
export function readBoundedLines(
	stream: Readable,
	options: Readonly<{
		maxBytes: number;
		onLine(line: string): void;
		onError(error: Error): void;
	}>
): () => void {
	let chunks: Buffer[] = [];
	let bytes = 0;
	let failed = false;
	const decoder = new TextDecoder('utf-8', { fatal: true });
	const data = (value: Buffer | string) => {
		if (failed) return;
		let chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
		while (chunk.length) {
			const newline = chunk.indexOf(10);
			const segment = newline < 0 ? chunk : chunk.subarray(0, newline);
			bytes += segment.length;
			if (bytes > options.maxBytes)
				return fail('Subprocess response frame exceeded its byte limit');
			if (segment.length) chunks.push(segment);
			if (newline < 0) return;
			try {
				const framed = chunks.length === 1 ? chunks[0]! : Buffer.concat(chunks, bytes);
				options.onLine(decoder.decode(framed).replace(/\r$/, ''));
			} catch {
				return fail('Subprocess returned an invalid UTF-8 response frame');
			}
			chunks = [];
			bytes = 0;
			chunk = chunk.subarray(newline + 1);
		}
	};
	const end = () => {
		if (!failed && bytes) fail('Subprocess closed with an incomplete response frame');
	};
	stream.on('data', data);
	stream.once('end', end);
	return () => {
		failed = true;
		stream.off('data', data);
		stream.off('end', end);
		chunks = [];
		bytes = 0;
	};

	function fail(message: string): void {
		if (failed) return;
		failed = true;
		options.onError(new Error(message));
	}
}
