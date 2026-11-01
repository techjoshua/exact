/** Optional internal syntax-slot acquisition contract advertised by the native handshake. */
export const nativeExecutableSlotsVersion = 2;

/**
 * Internal host executable selection installed atomically with prepared sources.
 * Increase generation for every replacement, including target/config/resolver changes.
 * Selected sessions require replacement snapshots until reset. Lowering uses the same selected source body owner and its finite helper eligibility proof.
 */
export type NativeExecutableSelection = Readonly<{
	generation: number;
	revision: string;
	target: 'default' | 'client' | 'server';
	modules: readonly Readonly<{
		id: string;
		sourceId: string;
		/** SHA-256 of the complete prepared source before native normalization. */
		contentRevision: string;
	}>[];
	edges: readonly Readonly<{
		importer: string;
		/** Zero-based source-order import/export specifier or literal require/import call slot. */
		slot: number;
		specifier: string;
		kind: 'import' | 'require';
		/** Omission represents opaque/external selection, with no typed-body fallback. */
		selected?: string;
	}>[];
}>;
