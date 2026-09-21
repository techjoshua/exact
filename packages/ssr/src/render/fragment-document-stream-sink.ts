import { DocumentStreamSink } from './document-stream-sink.js';
import { SsrOutputLimitError } from './limits.js';
import type { RenderValue } from './execution.js';
import { utf8ByteLength } from './utf8.js';

/**
 * Groups progressive output for hosts where counting individual spans is expensive.
 * The base sink retains publication, pressure, cancellation, and exact byte-limit ownership.
 */
export class FragmentDocumentStreamSink extends DocumentStreamSink {
	// Inherited counters describe the collected prefix. Each pending UTF-16 unit
	// needs at most three UTF-8 bytes, including lone surrogates.
	private readonly unmeasured: string[] = [];
	private unmeasuredCharacters = 0;

	/** Accepts a span using conservative bounds, counting exactly before a possible limit failure. */
	override write(html: string): void {
		this.assertOpen();
		if (!html) return;
		// UTF-16 length is a lower bound, so obviously oversized spans need no collection.
		if (
			this.emittedBytes + this.value.length + this.unmeasuredCharacters + html.length >
			this.maxBytes
		) {
			return this.fail(new SsrOutputLimitError(this.maxBytes));
		}
		this.unmeasured.push(html);
		this.unmeasuredCharacters += html.length;
		if (this.emittedBytes + this.bufferedBytes + 3 * this.unmeasuredCharacters > this.maxBytes) {
			this.collect();
			if (this.emittedBytes + this.bufferedBytes > this.maxBytes) {
				return this.fail(new SsrOutputLimitError(this.maxBytes));
			}
		}
	}

	/** Collects a pending group when the exact flush threshold may have been reached. */
	override ready(): RenderValue<void> {
		this.assertOpen();
		if (this.pending) return this.pending;
		if (this.committed && this.bufferedBytes + 3 * this.unmeasuredCharacters >= this.bufferSize) {
			this.collect();
			if (this.bufferedBytes >= this.bufferSize) return this.publishBody();
		}
	}

	/** Collects pending spans before the base destination handles head or suspension boundaries. */
	override flush(reason: 'head' | 'await'): RenderValue<void> {
		this.assertOpen();
		if (!this.pending) this.collect();
		return super.flush(reason);
	}

	/** Includes every accepted fragment before final output accounting and publication. */
	override finish(
		prefix: readonly string[] = []
	): RenderValue<{ html: string; streamed: boolean }> {
		this.assertOpen();
		if (!this.pending) this.collect();
		return super.finish(prefix);
	}

	/** Releases pending fragments on completion, cancellation, and destination failure. */
	override destroy(): void {
		this.unmeasured.length = 0;
		this.unmeasuredCharacters = 0;
		super.destroy();
	}

	/** Counts each pending group without slicing or repeatedly scanning the accumulated prefix. */
	private collect(): void {
		if (!this.unmeasuredCharacters) return;
		const html = this.unmeasured.length === 1 ? this.unmeasured[0]! : this.unmeasured.join('');
		this.unmeasured.length = 0;
		this.unmeasuredCharacters = 0;
		let bytes = utf8ByteLength(html);
		const previous = this.lastCodeUnit;
		const next = html.charCodeAt(0);
		// A formerly lone high surrogate joins this group's low surrogate into one code point.
		if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) bytes -= 2;
		this.bufferedBytes += bytes;
		this.value += html;
		this.lastCodeUnit = html.charCodeAt(html.length - 1);
	}
}
