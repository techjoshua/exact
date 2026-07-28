import type { Component } from '@exactjs/core';
import { AuthorizationContext, BrandContext } from './identity-context.js';

/** Renders the public identity exposed by the nearest identity provider. */
export function IdentitySummary(this: Component<Record<string, never>>) {
	const authorization = this.getContext(AuthorizationContext);
	const brand = this.getContext(BrandContext);

	return () => (
		<button
			data-brand={brand.name()}
			data-accent={brand.accent()}
			data-editor={authorization.hasRole('editor') ? 'true' : 'false'}
		>
			{brand.name()}:{authorization.hasRole('editor') ? 'editor' : 'viewer'}
		</button>
	);
}
