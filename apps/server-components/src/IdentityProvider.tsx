import type { Child, Component } from '@exactjs/core';
import { IdentitySummary } from './IdentitySummary.js';
import {
	AuthorizationContext,
	BrandContext,
	type Authorization,
	type Brand,
	type PublicIdentity
} from './identity-context.js';

/**
 * Reconstructs public context methods from plain state during both SSR and
 * hydration. This context remains component-tree scoped.
 */
export function IdentityProvider(
	this: Component<{
		roleNames: string;
		brandName: string;
		brandAccent: string;
	}>,
	props: { initial?: PublicIdentity; children?: Child }
) {
	this.state.roleNames ??= (props.initial?.roles ?? []).join(',');
	this.state.brandName ??= props.initial?.brand.name ?? '';
	this.state.brandAccent ??= props.initial?.brand.accent ?? '';

	const authorization: Authorization = {
		hasRole: (role) => this.state.roleNames.split(',').includes(role)
	};
	const brand: Brand = {
		name: () => this.state.brandName,
		accent: () => this.state.brandAccent
	};
	this.setContext(AuthorizationContext, authorization);
	this.setContext(BrandContext, brand);

	return () => props.children ?? <IdentitySummary />;
}
