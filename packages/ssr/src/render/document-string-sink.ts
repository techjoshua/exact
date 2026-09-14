import { SsrOutputLimitError } from './limits.js';
import type { SsrProgramSink } from './program-sink.js';
import { utf8ByteLength } from './utf8.js';

/** Collects text while retaining document boundaries for hydration insertion without an HTML scan. */
export class DocumentStringSink implements SsrProgramSink {
	private value = '';
	private parts: string[] = [];
	private remainingCharacters: number;
	private closed = false;

	constructor(private readonly maxBytes: number) {
		this.remainingCharacters = maxBytes;
	}

	/** Rejects the UTF-16 lower bound before retaining another complete span. */
	write(html: string): void {
		if (this.closed) throw new Error('SSR string sink is closed');
		if (this.value.length + html.length > this.remainingCharacters) {
			this.destroy();
			throw new SsrOutputLimitError(this.maxBytes);
		}
		if (html) this.value += html;
	}

	/** Retains a compiler-known document edge without inspecting accumulated text. */
	captureDocumentBoundary(): void {
		if (this.closed) throw new Error('SSR string sink is closed');
		this.parts.push(this.value);
		this.remainingCharacters -= this.value.length;
		this.value = '';
	}

	/** Complete-string collection has no transport pressure. */
	ready(): void {}

	/** String publication remains deferred until the document is complete. */
	flush(): void {}

	/** Transfers completed chunks after checking their combined UTF-8 limit, including prefix hints. */
	finishChunks(prefix: readonly string[] = []): readonly string[] {
		if (this.closed) throw new Error('SSR string sink is closed');
		let characters = this.maxBytes - this.remainingCharacters + this.value.length;
		for (const part of prefix) characters += part.length;
		if (characters > this.maxBytes) {
			this.destroy();
			throw new SsrOutputLimitError(this.maxBytes);
		}
		const chunks = [...prefix, ...this.parts, this.value];
		this.destroy();
		// Preserve cross-chunk surrogate pairs. Only near-limit output needs an exact scan.
		if (characters > this.maxBytes / 3 && utf8ByteLength(chunks.join('')) > this.maxBytes)
			throw new SsrOutputLimitError(this.maxBytes);
		return chunks;
	}

	/** Releases request-owned text on success, failure, or cancellation. */
	destroy(): void {
		this.value = '';
		this.parts = [];
		this.closed = true;
	}
}
