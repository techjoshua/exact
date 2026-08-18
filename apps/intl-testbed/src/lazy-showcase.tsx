import type { Component } from '@exactjs/core';

/** Lazily loaded message used to verify late descriptor and catalog adoption. */
export function LazyShowcase(this: Component<Record<string, never>>) {
	return () => (
		<aside
			theme:status="success"
			className="lazy-result"
			data-testid="lazy-result"
			intl:message="lazy-arrival"
		>
			This translated panel and its catalog arrived in a separate lazy chunk.
		</aside>
	);
}
