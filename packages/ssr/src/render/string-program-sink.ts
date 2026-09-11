import { SsrOutputLimitError } from './limits.js';
import type { SsrProgramSink } from './program-sink.js';
import type { RenderValue } from './execution.js';
import { utf8ByteLength } from './utf8.js';

/** Collects one request's ordered text, validating its complete UTF-8 size before publication. */
export class StringProgramSink implements SsrProgramSink {
	/** Owned output; a streaming subclass may publish an immutable prefix at a flush boundary. */
	protected value = '';
	private closed = false;
	constructor(private readonly maxBytes: number) {}

	/** Rejects the UTF-16 lower bound before retaining additional request output. */
	write(html: string): void {
		if (this.closed) throw new Error('SSR string sink is closed');
		if (this.value.length + html.length > this.maxBytes) {
			this.destroy();
			throw new SsrOutputLimitError(this.maxBytes);
		}
		if (!html) return;
		this.value += html;
	}

	/** Complete-string collection has no transport pressure. */
	ready(): void {}

	/** Publication boundaries do not expose an unfinished string result. */
	flush(): RenderValue<void> {}

	/** Returns accumulated text without inspecting it unless exact byte-limit validation is required. */
	finish(prefix: readonly string[] = []): string {
		if (this.closed) throw new Error('SSR string sink is closed');
		let characters = this.value.length;
		for (const part of prefix) {
			characters += part.length;
			if (characters > this.maxBytes) {
				this.destroy();
				throw new SsrOutputLimitError(this.maxBytes);
			}
		}
		let hints = '';
		for (const part of prefix) hints += part;
		const html = hints ? hints + this.value : this.value;
		this.destroy();
		// Each UTF-16 code unit encodes to at most three UTF-8 bytes, including lone
		// surrogates. A proven upper bound needs no flattening or exact byte scan.
		if (characters > this.maxBytes / 3 && utf8ByteLength(html) > this.maxBytes)
			throw new SsrOutputLimitError(this.maxBytes);
		return html;
	}

	/** Releases retained text on completion, failure, or cancellation. */
	destroy(): void {
		this.value = '';
		this.closed = true;
	}
}
