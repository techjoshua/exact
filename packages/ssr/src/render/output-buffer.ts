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

/** Allocation-free encoded byte-ledger state for one request-local render attempt. */
export type SsrOutputCheckpoint = number;

/** Collects one request's ordered output and accounts for UTF-8 bytes incrementally. */
export class SsrOutputBuffer {
	private readonly values: string[] = [];
	private bytes = 0;
	private pendingHighSurrogate = false;
	private accountingValid = true;

	constructor(private readonly maxBytes: number) {}

	/** Appends a renderer chunk without flattening previously rendered descendants. */
	append(value: string): void {
		if (!value) return;
		this.charge(value);
		this.values.push(value);
	}

	/**
	 * Commits a fully rendered root whose fragments were already charged through this sink.
	 * Invalidated provenance falls back to one exact scan of the completed foreign string.
	 */
	appendAccounted(value: string): void {
		if (!value) return;
		if (!this.accountingValid) {
			this.bytes = 0;
			this.pendingHighSurrogate = false;
			this.accountingValid = true;
			this.charge(value);
		}
		this.values.push(value);
	}

	/** Charges one compiler-owned string from its immutable standalone UTF-8 byte fact. */
	accountKnown(value: string, standaloneBytes: number): void {
		if (!this.accountingValid || !value) return;
		let bytes = standaloneBytes;
		if (this.pendingHighSurrogate) {
			this.pendingHighSurrogate = false;
			bytes += isLowSurrogate(value.charCodeAt(0)) ? 1 : 3;
		}
		if (isHighSurrogate(value.charCodeAt(value.length - 1))) {
			bytes -= 3;
			this.pendingHighSurrogate = true;
		}
		this.addBytes(bytes);
	}

	/** Charges compiler-proven byte-closed spans that cannot join a surrounding surrogate. */
	accountClosedBytes(bytes: number): void {
		if (!this.accountingValid) return;
		if (this.pendingHighSurrogate) {
			this.pendingHighSurrogate = false;
			this.addBytes(3);
		}
		this.addBytes(bytes);
	}

	/** Charges a dynamic or foreign string once at the boundary that produced it. */
	account(value: string): void {
		if (this.accountingValid && value) this.charge(value);
	}

	/** Stops trusting partial provenance so root commitment uses the generic exact scanner. */
	invalidateAccounting(): void {
		this.accountingValid = false;
	}

	/** Captures the byte ledger before one component attempt can publish output. */
	checkpoint(): SsrOutputCheckpoint {
		if (!this.accountingValid) return -1;
		return this.pendingHighSurrogate ? -this.bytes - 2 : this.bytes;
	}

	/** Restores byte ownership after a failed component attempt. */
	rollback(checkpoint: SsrOutputCheckpoint): void {
		this.accountingValid = checkpoint !== -1;
		this.pendingHighSurrogate = checkpoint < -1;
		this.bytes = checkpoint < -1 ? -checkpoint - 2 : Math.max(0, checkpoint);
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
		this.accountingValid = true;
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
