import { createContext, type Child, type Component } from '@exactjs/core';

/** Defines the server authorization interface contract. */
export interface ServerAuthorization {
	roles(): readonly string[];
}

/** Defines the server brand interface contract. */
export interface ServerBrand {
	publicBrand(): Readonly<{
		name: string;
		accent: string;
	}>;
}

/** Defines the authorization interface contract. */
export interface Authorization {
	hasRole(role: string): boolean;
}

/** Defines the brand interface contract. */
export interface Brand {
	name(): string;
	accent(): string;
}

/** Defines the public identity interface contract. */
export interface PublicIdentity {
	roles: string[];
	brand: { name: string; accent: string };
}

/** Provides the canonical server authorization context value. */
export const ServerAuthorizationContext = createContext<ServerAuthorization>(
	'sample.authorization.server',
	{
		global: true,
		reactive: false,
		keep: 'server',
		scope: 'request'
	}
);

/** Provides the canonical server brand context value. */
export const ServerBrandContext = createContext<ServerBrand>('sample.brand.server', {
	global: true,
	reactive: false,
	keep: 'server',
	scope: 'application'
});

/** Provides the canonical authorization context value. */
export const AuthorizationContext = createContext<Authorization>('sample.authorization.public', {
	global: true,
	reactive: false
});

/** Provides the canonical brand context value. */
export const BrandContext = createContext<Brand>('sample.brand.public', {
	global: true,
	reactive: false
});

/** Reads protected server contexts and projects only public identity state. */
export function ServerIdentityProjection(
	this: Component<{
		roleNames: string;
		brandName: string;
		brandAccent: string;
	}>
) {
	this.state.roleNames ??= '';
	this.state.brandName ??= '';
	this.state.brandAccent ??= '';

	this.task.server(async () => {
		await Promise.resolve();
		const authorization = this.getContext(ServerAuthorizationContext);
		const brand = this.getContext(ServerBrandContext);
		const publicBrand = brand.publicBrand();
		this.state.roleNames = authorization.roles().join(',');
		this.state.brandName = publicBrand.name;
		this.state.brandAccent = publicBrand.accent;
	});

	return () => (
		<IdentityProvider
			initial={{
				roles: this.state.roleNames.split(',').filter(Boolean),
				brand: {
					name: this.state.brandName,
					accent: this.state.brandAccent
				}
			}}
		/>
	);
}

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
	const brand = {
		name: () => this.state.brandName,
		accent: () => this.state.brandAccent
	};
	this.setContext(AuthorizationContext, authorization);
	this.setContext(BrandContext, brand);

	return () => props.children ?? <IdentitySummary />;
}

/** Performs the identity summary domain operation. */
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
