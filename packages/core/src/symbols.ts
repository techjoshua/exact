/** Provides the canonical fragment value. */
export const Fragment = Symbol.for('exact.fragment');
/** Provides the canonical semantic-target forwarding boundary. */
export const Target = Symbol.for('exact.target');
/** Framework-owned target metadata for properties that intentionally replace authored fallbacks. */
export const TargetOverrides = Symbol.for('exact.target-overrides');
/** Provides the canonical text value. */
export const Text = Symbol.for('exact.text');
/** Provides the canonical cell value. */
export const Cell = Symbol.for('exact.cell');
/** Provides the canonical dynamic value. */
export const Dynamic = Symbol.for('exact.dynamic');
/** Provides the canonical portal value. */
export const Portal = Symbol.for('exact.portal');
/** Provides the canonical server boundary value. */
export const ServerBoundary = Symbol.for('exact.server-boundary');
/** Provides the canonical server slot value. */
export const ServerSlot = Symbol.for('exact.server-slot');
/** Provides the canonical unsafe html value. */
export const UnsafeHtml = Symbol.for('exact.unsafe-html');
/** Provides the canonical retained Activity boundary value. */
export const Activity = Symbol.for('exact.activity') as symbol &
	((props: { mode?: 'active' | 'parked' | 'background'; children?: unknown }) => never);
/** Provides the canonical native readiness boundary value. */
export const Suspense = Symbol.for('exact.suspense') as symbol &
	((props: { fallback?: unknown; children?: unknown }) => never);
/** Compiler-emitted render-program kind shared by independently loaded framework artifacts. */
export const RenderProgram = Symbol.for('exact.render-program');
