/**
 * Bundle-local SSR capabilities selected by compiler-emitted runtime imports. Request state never
 * enters this registry. A server bundle owns exactly one @exactjs/ssr module graph; duplicate
 * package copies are a build error rather than a reason to mutate globalThis.
 */
export const ssrCapabilities: Record<string, unknown> = Object.create(null) as Record<
	string,
	unknown
>;
