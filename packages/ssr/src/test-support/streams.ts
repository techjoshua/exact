export async function readStreamEvent(
	reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<any> {
	const next = await reader.read();
	if (next.done) throw new Error('stream ended');
	return JSON.parse(new TextDecoder().decode(next.value).trim());
}

export async function readRemainingStreamEvents(
	reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<any[]> {
	const events: any[] = [];
	while (true) {
		const next = await reader.read();
		if (next.done) return events;
		const text = new TextDecoder().decode(next.value);
		for (const line of text.split(/\r?\n/)) {
			if (line.trim()) events.push(JSON.parse(line));
		}
	}
}

export async function readStreamText(stream: ReadableStream<Uint8Array>): Promise<string> {
	const reader = stream.getReader();
	return readRemainingText(reader);
}

export async function readRemainingStreamText(
	reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
	const decoder = new TextDecoder();
	let text = '';
	while (true) {
		const next = await reader.read();
		if (next.done) return text;
		text += decoder.decode(next.value, { stream: true });
	}
}

export async function readRemainingText(
	reader: ReadableStreamDefaultReader<Uint8Array>
): Promise<string> {
	const decoder = new TextDecoder();
	let text = '';
	while (true) {
		const next = await reader.read();
		if (next.done) return text;
		text += decoder.decode(next.value);
	}
}
