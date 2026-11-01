/** Raw observable SSR results shared by adapter and native runtime acceptance. */
export interface ComponentChildInputSsrObservation {
	readonly case: string;
	readonly reads: number;
	readonly otherReads?: number;
	readonly events?: readonly { readonly key: string; readonly original: boolean }[];
	readonly html?: string;
	readonly error?: string;
	readonly sameError?: boolean;
}
/** Validates the acquisition, receiver, identity and exception controls after output is recorded. */
export declare function assertComponentChildInputSsr(
	rows: readonly ComponentChildInputSsrObservation[]
): void;
