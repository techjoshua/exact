import { isExactDocumentHtml } from '../document.js';
import { SsrOutputLimitError } from './limits.js';
import { mapRenderValue, type RenderValue } from './execution.js';
import type { SsrProgramSink } from './program-sink.js';
import { utf8ByteLength } from './utf8.js';
import { documentHydrationSlot } from './document-output.js';

const documentTail = '</body></html>';

/** Transport publications stay ordered and apply pressure before traversal continues. */
export interface DocumentStreamDestination {
	/** Publishes the committed document head. */
	head(html: string): RenderValue<void>;
	/** Publishes subsequent body output. */
	body(html: string): RenderValue<void>;
	/** Cancels pending descendants before a destination failure unwinds their owner. */
	abort(reason: unknown): void;
}

/**
 * Collects speculative document output until its head commits, then releases body spans.
 * Buffer size is a flush threshold, not a maximum authored span size. Only a closing-tag
 * lookbehind and the current buffer remain owned after each successful publication, until an
 * explicit hydration slot retains the following document tail for final state publication.
 */
export class DocumentStreamSink implements SsrProgramSink {
	private value = '';
	private emittedBytes = 0;
	private bufferedBytes = 0;
	private lastCodeUnit = NaN;
	private closed = false;
	private committed = false;
	private pending: Promise<void> | undefined;

	constructor(
		private readonly maxBytes: number,
		private readonly destination: DocumentStreamDestination,
		private readonly bufferSize = 8192
	) {
		if (!Number.isSafeInteger(bufferSize) || bufferSize < 1)
			throw new RangeError('streamBufferSize must be a positive safe integer');
	}

	/** Accepts a complete span; readiness owns any resulting transport pressure. */
	write(html: string): void {
		this.assertOpen();
		if (!html) return;
		let bytes = utf8ByteLength(html);
		const previous = this.lastCodeUnit;
		const next = html.charCodeAt(0);
		// Two separately counted lone surrogates become one four-byte code point on concatenation.
		if (previous >= 0xd800 && previous <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) bytes -= 2;
		if (this.emittedBytes + this.bufferedBytes + bytes > this.maxBytes) {
			return this.fail(new SsrOutputLimitError(this.maxBytes));
		}
		this.bufferedBytes += bytes;
		this.value += html;
		this.lastCodeUnit = html.charCodeAt(html.length - 1);
	}

	/** Flushes a full buffer plus the accepted span, retaining the final document delimiter. */
	ready(): RenderValue<void> {
		this.assertOpen();
		if (this.pending) return this.pending;
		if (this.committed && this.bufferedBytes >= this.bufferSize) return this.publishBody();
	}

	/** Commits a completed head once, and drains available body output before pending work. */
	flush(reason: 'head' | 'await'): RenderValue<void> {
		this.assertOpen();
		if (this.pending) return this.pending;
		if (reason === 'head' && !this.committed && isExactDocumentHtml(this.value)) {
			const head = this.value;
			this.account(head);
			this.value = '';
			this.bufferedBytes = 0;
			this.lastCodeUnit = NaN;
			this.committed = true;
			return this.publish(head, true);
		}
		if (reason === 'await' && this.committed) {
			let reserve = Math.min(documentTail.length, this.value.length);
			while (reserve && !this.value.endsWith(documentTail.slice(0, reserve))) reserve--;
			return this.publishBody(reserve);
		}
	}

	/** Returns collected fallback markup or only the reserved closing tags after body delivery. */
	finish(prefix: readonly string[] = []): RenderValue<{ html: string; streamed: boolean }> {
		this.assertOpen();
		if (this.pending) return mapRenderValue(this.pending, () => this.finish(prefix));
		if (!this.committed) {
			const html = prefix.join('') + this.value;
			this.account(html);
			this.destroy();
			return { html, streamed: false };
		}
		// Resource hints discovered after commitment cannot be prepended to bytes already sent.
		// They remain valid head resources before commitment; late hints precede body completion.
		const hints = prefix.join('');
		if (hints) {
			this.value = hints + this.value;
			this.bufferedBytes += utf8ByteLength(hints);
		}
		if (!this.value.endsWith(documentTail))
			throw new Error('Streamed document output is missing its closing body/html elements');
		return mapRenderValue(this.publishBody(), () => {
			this.account(this.value);
			const html = this.value;
			this.destroy();
			return { html, streamed: true };
		});
	}

	/** Releases retained output on completion, cancellation, or failure. */
	destroy(): void {
		this.value = '';
		this.bufferedBytes = 0;
		this.lastCodeUnit = NaN;
		this.pending = undefined;
		this.closed = true;
	}

	private publishBody(reserve = documentTail.length): RenderValue<void> {
		let end = this.value.length - reserve;
		// Retain deferred hydration and everything after it until capture has completed.
		const slot = this.value.indexOf(documentHydrationSlot);
		if (slot >= 0) end = Math.min(end, slot);
		if (end <= 0) return;
		// Never encode opposite halves of a surrogate pair in independent transport writes.
		const code = this.value.charCodeAt(end - 1);
		const next = this.value.charCodeAt(end);
		if (
			code >= 0xd800 &&
			code <= 0xdbff &&
			(end === this.value.length || (next >= 0xdc00 && next <= 0xdfff))
		)
			end--;
		if (!end) return;
		const body = this.value.slice(0, end);
		this.bufferedBytes -= this.account(body);
		this.value = this.value.slice(end);
		return this.publish(body, false);
	}

	private account(html: string): number {
		const bytes = utf8ByteLength(html);
		this.emittedBytes += bytes;
		if (this.emittedBytes > this.maxBytes) {
			this.fail(new SsrOutputLimitError(this.maxBytes));
		}
		return bytes;
	}

	private assertOpen(): void {
		if (this.closed) throw new Error('SSR document sink is closed');
	}

	private publish(html: string, head: boolean): RenderValue<void> {
		try {
			const pending = head ? this.destination.head(html) : this.destination.body(html);
			if (!(pending instanceof Promise)) return pending;
			return (this.pending = pending.then(
				() => {
					this.pending = undefined;
				},
				(error) => this.fail(error)
			));
		} catch (error) {
			return this.fail(error);
		}
	}

	private fail(error: unknown): never {
		this.destroy();
		this.destination.abort(error);
		throw error;
	}
}
