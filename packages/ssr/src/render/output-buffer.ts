import { SsrOutputLimitError } from './limits.js';
import { isHighSurrogate, isLowSurrogate } from './utf8.js';

export { utf8ByteLength } from './utf8.js';

/** Internal ordered chunks behind a public SSR string result. */
export const ssrHtmlChunks = Symbol('exact.ssr.html-chunks');

/** Internal ordered chunks behind a public hydratable SSR string result. */
export const ssrHydratableChunks = Symbol('exact.ssr.hydratable-chunks');

/** Public result augmented with renderer-owned chunks that adapters may preserve. */
export type SsrChunkedResult = {
	[ssrHtmlChunks]?: readonly string[];
	[ssrHydratableChunks]?: readonly string[];
};

/** Collects one request's ordered output and accounts for UTF-8 bytes incrementally. */
export class SsrOutputBuffer {
	private readonly values: string[] = [];
	private bytes = 0;
	private pendingHighSurrogate = false;

	constructor(private readonly maxBytes: number) {}

	/** Appends a renderer chunk without flattening previously rendered descendants. */
	append(value: string): void {
		if (!value) return;
		this.charge(value);
		this.values.push(value);
	}

	/** Prepends late-discovered resource hints and revalidates cross-chunk encoding boundaries. */
	prepend(values: readonly string[]): void {
		if (!values.length) return;
		for (let index = values.length - 1; index >= 0; index--) {
			const value = values[index]!;
			if (value) this.values.unshift(value);
		}
		this.recount();
	}

	/** Returns the request-owned chunks after charging any trailing unpaired surrogate. */
	finish(): readonly string[] {
		if (this.pendingHighSurrogate) {
			this.pendingHighSurrogate = false;
			this.addBytes(3);
		}
		return this.values;
	}

	private recount(): void {
		this.bytes = 0;
		this.pendingHighSurrogate = false;
		for (const value of this.values) this.charge(value);
	}

	private charge(value: string): void {
		let index = 0;
		if (this.pendingHighSurrogate) {
			this.pendingHighSurrogate = false;
			if (isLowSurrogate(value.charCodeAt(0))) {
				this.addBytes(4);
				index = 1;
			} else this.addBytes(3);
		}
		for (; index < value.length; index++) {
			const code = value.charCodeAt(index);
			if (code <= 0x7f) this.addBytes(1);
			else if (code <= 0x7ff) this.addBytes(2);
			else if (isHighSurrogate(code)) {
				if (index + 1 === value.length) {
					this.pendingHighSurrogate = true;
					continue;
				}
				if (isLowSurrogate(value.charCodeAt(index + 1))) {
					this.addBytes(4);
					index++;
				} else this.addBytes(3);
			} else this.addBytes(3);
		}
	}

	private addBytes(bytes: number): void {
		this.bytes += bytes;
		if (this.bytes > this.maxBytes) throw new SsrOutputLimitError(this.maxBytes);
	}
}

/** Reads renderer-owned chunks without materializing the public HTML getter. */
export function htmlChunksOf(value: object): readonly string[] | undefined {
	return (value as SsrChunkedResult)[ssrHtmlChunks];
}

/** Reads renderer-owned hydratable chunks without materializing the public HTML getter. */
export function hydratableChunksOf(value: object): readonly string[] | undefined {
	return (value as SsrChunkedResult)[ssrHydratableChunks];
}
